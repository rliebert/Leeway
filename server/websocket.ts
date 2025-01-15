import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, file_attachments, channels, users, sessions } from "@db/schema";
import { eq, asc } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { serverDebugLogger as debug } from "./debug";
import {
  generateAIResponse,
  isQuestion as ragIsQuestion,
} from "./services/rag";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
  subscriptions: Set<string>;
}

interface WSMessage {
  type:
    | "subscribe"
    | "unsubscribe"
    | "message"
    | "typing"
    | "ping"
    | "message_deleted"
    | "message_edited"
    | "debug_mode";
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: {
    url: string;
    originalName: string;
    mimetype: string;
    size: number;
  }[];
  enabled?: boolean;
}

const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();
const activeConnections = new Map<string, AuthenticatedWebSocket>();

function broadcastToChannel(
  channelId: string,
  message: any,
  excludeWs?: WebSocket,
) {
  const subscribers = channelSubscriptions.get(channelId);
  if (!subscribers) {
    debug.warn(`No subscribers found for channel: ${channelId}`);
    return;
  }

  const data = JSON.stringify(message);
  let broadcastCount = 0;

  subscribers.forEach((client: AuthenticatedWebSocket) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
        broadcastCount++;
      } catch (error) {
        debug.error(`Failed to send to client ${client.userId}:`, error);
        // Clean up dead connections
        subscribers.delete(client);
        if (client.userId) {
          activeConnections.delete(client.userId);
        }
      }
    }
  });

  debug.info(
    `Broadcast complete: ${broadcastCount} clients received the message`,
  );
}

async function handleAuthentication(ws: AuthenticatedWebSocket, request: IncomingMessage): Promise<boolean> {
  try {
    // Parse session cookie
    const cookies = parseCookie(request.headers.cookie || '');
    const sessionId = cookies['connect.sid'];

    if (!sessionId) {
      debug.warn("No session ID found in cookies");
      ws.close(1008, "Unauthorized");
      return false;
    }

    // Clean session ID (remove s: prefix and possible signature)
    const cleanSessionId = sessionId.split('.')[0].replace('s:', '');

    // Fetch session data
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.sid, cleanSessionId)
    });

    if (!session?.sess) {
      debug.warn("No session found in database");
      ws.close(1008, "Invalid session");
      return false;
    }

    // Parse session data
    let sessionData;
    try {
      sessionData = typeof session.sess === 'string' ? 
        JSON.parse(session.sess) : 
        session.sess;
    } catch (e) {
      debug.error("Failed to parse session data:", e);
      ws.close(1008, "Invalid session");
      return false;
    }

    // Validate user data
    if (!sessionData?.passport?.user) {
      debug.warn("No user ID found in session passport");
      ws.close(1008, "Unauthorized");
      return false;
    }

    const userId = sessionData.passport.user.toString();

    // Close existing connection if it exists
    const existingConnection = activeConnections.get(userId);
    if (existingConnection && existingConnection !== ws) {
      debug.info(`Closing existing connection for user: ${userId}`);
      existingConnection.close(1000, "New connection established");
    }

    // Set socket properties
    ws.userId = userId;
    ws.isAlive = true;
    ws.subscriptions = new Set();
    activeConnections.set(userId, ws);
    debug.info("WebSocket connected for user:", userId);

    // Send connection acknowledgment
    ws.send(JSON.stringify({ type: "connected" }));
    return true;
  } catch (error) {
    debug.error("Error authenticating WebSocket connection:", error);
    ws.close(1008, "Unauthorized");
    return false;
  }
}

export function setupWebSocketServer(server: Server) {
  debug.enable();

  const wss = new WebSocketServer({
    server,
    path: "/ws",
    perMessageDeflate: false,
    clientTracking: true,
  });

  wss.on(
    "connection",
    async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
      if (request.headers["sec-websocket-protocol"] === "vite-hmr") {
        return;
      }

      const authenticated = await handleAuthentication(ws, request);
      if (!authenticated) return;

      ws.on("message", async (data: string) => {
        if (!ws.userId) {
          debug.warn("Received message from unauthenticated socket");
          ws.close(1008, "Unauthorized");
          return;
        }

        try {
          const message = JSON.parse(data) as WSMessage;
          debug.info(`Received message of type: ${message.type}`);

          switch (message.type) {
            case "message": {
              if (!message.channelId || !message.content) {
                debug.warn("Invalid message data:", message);
                break;
              }

              try {
                // Save to database
                const [newMessage] = await db
                  .insert(messages)
                  .values({
                    channel_id: message.channelId,
                    user_id: ws.userId,
                    content: message.content,
                    parent_id: message.parentId || null,
                  })
                  .returning();

                // Get complete message with author and attachments
                const completeMessage = await db.query.messages.findFirst({
                  where: eq(messages.id, newMessage.id),
                  with: {
                    author: true,
                    attachments: true,
                  },
                });

                if (completeMessage) {
                  // Send acknowledgment to sender
                  ws.send(JSON.stringify({
                    type: "message_ack",
                    messageId: newMessage.id,
                    channelId: message.channelId
                  }));

                  // Broadcast the message
                  broadcastToChannel(message.channelId, {
                    type: "message",
                    channelId: message.channelId,
                    message: normalizeMessageForClient(completeMessage),
                  }, ws);

                  // Process attachments if any
                  if (message.attachments?.length > 0) {
                    const attachmentRecords = message.attachments.map(
                      (attachment) => ({
                        message_id: newMessage.id,
                        file_url: attachment.url,
                        file_name: attachment.originalName,
                        file_type: attachment.mimetype,
                        file_size: attachment.size,
                      }),
                    );
                    await db.insert(file_attachments).values(attachmentRecords);
                  }
                }
              } catch (error) {
                debug.error("Error handling message:", error);
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: "Failed to send message",
                  }),
                );
              }
              break;
            }

            case "subscribe": {
              if (!message.channelId) {
                debug.warn("Invalid subscribe request - no channelId");
                break;
              }

              // Verify channel access
              const channel = await db.query.channels.findFirst({
                where: eq(channels.id, message.channelId),
              });

              if (!channel) {
                debug.warn("Attempted to subscribe to non-existent channel");
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Channel not found"
                }));
                break;
              }

              if (!channelSubscriptions.has(message.channelId)) {
                channelSubscriptions.set(message.channelId, new Set());
              }

              const subscribers = channelSubscriptions.get(message.channelId)!;
              subscribers.add(ws);
              ws.subscriptions.add(message.channelId);

              debug.info(
                `User ${ws.userId} subscribed to channel ${message.channelId}`,
              );

              // Send existing messages
              const existingMessages = await db.query.messages.findMany({
                where: eq(messages.channel_id, message.channelId),
                with: {
                  author: true,
                  attachments: true,
                },
                orderBy: [asc(messages.created_at)],
                limit: 50,
              });

              ws.send(JSON.stringify({
                type: "message_history",
                channelId: message.channelId,
                messages: existingMessages.map(normalizeMessageForClient),
              }));
              break;
            }

            case "unsubscribe": {
              if (!message.channelId) break;
              const subscribers = channelSubscriptions.get(message.channelId);
              if (subscribers) {
                subscribers.delete(ws);
                ws.subscriptions.delete(message.channelId);
              }
              debug.info(
                `User ${ws.userId} unsubscribed from channel ${message.channelId}`,
              );
              break;
            }

            case "ping": {
              ws.isAlive = true;
              ws.send(JSON.stringify({ type: "pong" }));
              break;
            }
          }
        } catch (error) {
          debug.error("Error processing WebSocket message:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Failed to process message",
            }),
          );
        }
      });

      ws.on("close", () => {
        debug.info("WebSocket closed for user:", ws.userId);
        // Clean up subscriptions
        if (ws.userId) {
          activeConnections.delete(ws.userId);
          ws.subscriptions.forEach(channelId => {
            const subscribers = channelSubscriptions.get(channelId);
            if (subscribers) {
              subscribers.delete(ws);
            }
          });
        }
      });

      ws.on("error", (error) => {
        debug.error("WebSocket error:", error);
      });
    },
  );

  // Heartbeat to keep connections alive and clean up dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as AuthenticatedWebSocket;
      if (!extWs.isAlive) {
        if (extWs.userId) {
          activeConnections.delete(extWs.userId);
        }
        ws.terminate();
        return;
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  return wss;
}

function normalizeMessageForClient(msg: any) {
  return {
    id: msg.id?.toString(),
    channel_id: msg.channel_id?.toString(),
    user_id: msg.user_id?.toString(),
    content: msg.content || "",
    created_at: msg.created_at || new Date().toISOString(),
    updated_at: msg.updated_at || msg.created_at || new Date().toISOString(),
    parent_id: msg.parent_id?.toString() || null,
    author: msg.author,
    attachments:
      msg.attachments?.map((attachment: any) => ({
        id: attachment.id?.toString(),
        url: attachment.file_url || attachment.url || "",
        originalName: attachment.file_name || attachment.originalName || "",
        mimetype: attachment.file_type || attachment.mimetype || "",
        file_size: Number(attachment.file_size) || 0,
      })) || [],
  };
}