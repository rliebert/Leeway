import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, file_attachments, channels, users } from "@db/schema";
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
}

interface WSMessage {
  type:
    | "subscribe"
    | "unsubscribe"
    | "message"
    | "typing"
    | "ping"
    | "message_deleted"
    | "message_edited";
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
}

const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

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
      }
    }
  });

  debug.info(
    `Broadcast complete: ${broadcastCount} clients received the message`,
  );
}

export function setupWebSocketServer(server: Server) {
  debug.enable();

  const wss = new WebSocketServer({
    server,
    path: "/ws",
    perMessageDeflate: false,
    clientTracking: true,
    handleProtocols: (protocols) => {
      if (protocols?.includes('chat')) return 'chat';
      if (protocols?.includes('vite-hmr')) return 'vite-hmr';
      return false;
    }
  });

  wss.on(
    "connection",
    async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
      if (request.headers["sec-websocket-protocol"] === "vite-hmr") {
        return;
      }

      ws.userId = (request as any).userId?.toString();
      ws.isAlive = true;
      debug.info("WebSocket connected for user:", ws.userId);

      ws.on("message", async (data: string) => {
        try {
          const message = JSON.parse(data) as WSMessage;
          debug.info(`Received message of type: ${message.type}`);

          switch (message.type) {
            case "message": {
              if (!message.channelId || !message.content || !ws.userId) {
                debug.warn("Invalid message data:", message);
                break;
              }

              try {
                // First broadcast a temporary message for instant feedback
                const tempMessage = {
                  id: "temp_" + Date.now(),
                  channel_id: message.channelId,
                  user_id: ws.userId,
                  content: message.content,
                  created_at: new Date().toISOString(),
                  author: await db.query.users.findFirst({
                    where: eq(users.id, ws.userId),
                  }),
                };

                // Send temporary message immediately
                broadcastToChannel(message.channelId, {
                  type: "message",
                  message: normalizeMessageForClient(tempMessage),
                });

                // Then save to database
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
                  // Update with permanent message
                  broadcastToChannel(message.channelId, {
                    type: "message",
                    message: normalizeMessageForClient(completeMessage),
                  });

                  // Check for question and generate AI response
                  if (ragIsQuestion(message.content)) {
                    const aiResponse = await generateAIResponse(
                      message.content,
                      [],
                    );

                    if (aiResponse && process.env.AI_BOT_USER_ID) {
                      const [aiMessage] = await db
                        .insert(messages)
                        .values({
                          channel_id: message.channelId,
                          user_id: process.env.AI_BOT_USER_ID,
                          content: aiResponse,
                          parent_id: newMessage.id,
                        })
                        .returning();

                      const aiMessageWithAuthor =
                        await db.query.messages.findFirst({
                          where: eq(messages.id, aiMessage.id),
                          with: {
                            author: true,
                            attachments: true,
                          },
                        });

                      if (aiMessageWithAuthor) {
                        broadcastToChannel(message.channelId, {
                          type: "message",
                          message:
                            normalizeMessageForClient(aiMessageWithAuthor),
                        });
                      }
                    }
                  }
                }

                // Process attachments after sending messages
                if (message.attachments?.length > 0) {
                  const attachmentRecords = message.attachments.map(
                    (attachment) => ({
                      message_id: newMessage.id,
                      file_url: attachment.url,
                      file_name: attachment.originalName,
                      file_type: attachment.mimetype,
                      file_size: attachment.size || 0,
                    }),
                  );
                  await db.insert(file_attachments).values(attachmentRecords);
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
            case "message_deleted": {
              if (!message.channelId || !message.messageId) {
                debug.warn("Invalid message_deleted event:", { message });
                break;
              }

              try {
                debug.info("Processing message deletion request:", {
                  messageId: message.messageId,
                  channelId: message.channelId,
                  userId: ws.userId,
                });

                const targetMessage = await db.query.messages.findFirst({
                  where: eq(messages.id, message.messageId),
                  with: {
                    author: true,
                  },
                });

                if (!targetMessage) {
                  debug.warn(
                    "Message not found for deletion:",
                    message.messageId,
                  );
                  ws.send(
                    JSON.stringify({
                      type: "error",
                      message: "Message not found",
                    }),
                  );
                  break;
                }

                const user = await db.query.users.findFirst({
                  where: eq(users.id, ws.userId!),
                });

                const isAdmin = user?.is_admin || false;
                const isOwnMessage = targetMessage.user_id === ws.userId;

                if (!user || (!isAdmin && !isOwnMessage)) {
                  debug.warn("Unauthorized deletion attempt");
                  ws.send(
                    JSON.stringify({
                      type: "error",
                      message: "Not authorized to delete this message",
                    }),
                  );
                  break;
                }

                await db
                  .delete(messages)
                  .where(eq(messages.id, message.messageId));
                debug.info("Message deleted from database:", message.messageId);

                const deleteNotification = {
                  type: "message_deleted",
                  messageId: message.messageId,
                  channelId: message.channelId,
                };

                debug.info(
                  "Broadcasting deletion notification:",
                  deleteNotification,
                );
                broadcastToChannel(message.channelId, deleteNotification);
                debug.info("Deletion notification broadcast complete");
              } catch (error) {
                debug.error("Error handling message deletion:", error);
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: "Failed to delete message",
                  }),
                );
              }
              break;
            }
            case "subscribe": {
              if (!message.channelId) break;

              if (!channelSubscriptions.has(message.channelId)) {
                channelSubscriptions.set(message.channelId, new Set());
              }
              channelSubscriptions.get(message.channelId)?.add(ws);
              debug.info(
                `User ${ws.userId} subscribed to channel ${message.channelId}`,
              );

              const existingMessages = await db.query.messages.findMany({
                where: eq(messages.channel_id, message.channelId),
                with: {
                  author: true,
                  attachments: true,
                },
                orderBy: [asc(messages.created_at)],
                limit: 50,
              });

              existingMessages.forEach((msg) => {
                ws.send(
                  JSON.stringify({
                    type: "message",
                    message: normalizeMessageForClient(msg),
                  }),
                );
              });
              break;
            }
            // Add other message type handlers here
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
        channelSubscriptions.forEach((subscribers) => {
          subscribers.delete(ws);
        });
      });

      ws.on("error", (error) => {
        debug.error("WebSocket error for user:", ws.userId, error);
      });
    },
  );

  // Heartbeat to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
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
