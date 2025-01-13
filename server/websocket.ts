import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments } from "@db/schema";
import { eq } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { sessionStore } from "./auth";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping';
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: {
    url: string;
    objectKey: string;
    name: string;
    type: string;
    size: number;
  }[];
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    perMessageDeflate: false,
    clientTracking: true,
    handleProtocols: (protocols) => {
      if (protocols.includes('vite-hmr')) return 'vite-hmr';
      return protocols[0];
    },
    verifyClient: async ({ req }, done) => {
      try {
        // Skip auth for Vite HMR
        if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
          done(true);
          return;
        }

        if (!req.headers.cookie) {
          done(false, 401, 'No cookie');
          return;
        }

        const cookies = parseCookie(req.headers.cookie);
        const sessionId = cookies['connect.sid'];

        if (!sessionId) {
          done(false, 401, 'No session cookie');
          return;
        }

        // Clean and parse session ID
        const cleanSessionId = sessionId.replace(/^s:/, '').split('.')[0];

        // Get session data from memory store
        sessionStore.get(cleanSessionId, async (err, session) => {
          if (err || !session?.passport?.user) {
            done(false, 401, 'Invalid session');
            return;
          }

          try {
            const user = await db.query.users.findFirst({
              where: eq(users.id, session.passport.user),
            });

            if (!user) {
              done(false, 401, 'User not found');
              return;
            }

            (req as any).userId = user.id;
            done(true);
          } catch (error) {
            console.error('Database error during WebSocket verification:', error);
            done(false, 500, 'Database error');
          }
        });
      } catch (error) {
        console.error('WebSocket verification error:', error);
        done(false, 500, 'Internal server error');
      }
    }
  });

  const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    // Skip handling for Vite HMR connections
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    ws.userId = (request as any).userId;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data) as WSMessage;

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        switch (message.type) {
          case 'message': {
            if (!message.channelId || !message.content || !ws.userId) {
              break;
            }

            try {
              // Create the message
              const [newMessage] = await db.insert(messages)
                .values({
                  channel_id: message.channelId,
                  user_id: ws.userId,
                  content: message.content,
                  parent_id: message.parentId || null,
                })
                .returning();

              // Handle attachments if present
              if (message.attachments?.length) {
                await Promise.all(message.attachments.map(attachment =>
                  db.insert(file_attachments)
                    .values({
                      message_id: newMessage.id,
                      file_url: attachment.url,
                      file_name: attachment.name,
                      file_type: attachment.type,
                      file_size: attachment.size
                    })
                ));
              }

              // Fetch complete message with attachments
              const completeMessage = await db.query.messages.findFirst({
                where: eq(messages.id, newMessage.id),
                with: {
                  author: true,
                  attachments: true,
                }
              });

              if (!completeMessage) {
                throw new Error('Failed to retrieve complete message');
              }

              broadcastToChannel(message.channelId, {
                type: 'message',
                message: completeMessage
              });
            } catch (error) {
              console.error('Error handling message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to send message'
              }));
            }
            break;
          }

          case 'subscribe': {
            if (!message.channelId) break;
            if (!channelSubscriptions.has(message.channelId)) {
              channelSubscriptions.set(message.channelId, new Set());
            }
            channelSubscriptions.get(message.channelId)?.add(ws);

            // Send recent messages
            const existingMessages = await db.query.messages.findMany({
              where: eq(messages.channel_id, message.channelId),
              with: {
                author: true,
                attachments: true,
              },
              orderBy: [messages.created_at],
              limit: 50,
            });

            existingMessages.forEach(msg => {
              ws.send(JSON.stringify({
                type: 'message',
                message: msg
              }));
            });
            break;
          }

          case 'unsubscribe': {
            if (!message.channelId) break;
            channelSubscriptions.get(message.channelId)?.delete(ws);
            break;
          }

          case 'typing': {
            if (!message.channelId || !ws.userId) break;
            broadcastToChannel(message.channelId, {
              type: 'typing',
              userId: ws.userId
            }, ws);
            break;
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      ws.isAlive = false;
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  wss.on('close', () => {
    clearInterval(interval);
  });

  function broadcastToChannel(channelId: string, message: any, excludeWs?: WebSocket) {
    const subscribers = channelSubscriptions.get(channelId);
    if (!subscribers) return;

    const data = JSON.stringify(message);
    subscribers.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  return wss;
}