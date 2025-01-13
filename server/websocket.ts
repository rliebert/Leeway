import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, users, file_attachments } from "@db/schema";
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
      if (!protocols) return '';
      if (Array.isArray(protocols) && protocols.includes('vite-hmr')) return 'vite-hmr';
      return Array.isArray(protocols) ? protocols[0] : protocols;
    },
    verifyClient: async ({ req }, done) => {
      try {
        // Skip auth for Vite HMR
        if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
          console.log('Accepting Vite HMR connection');
          done(true);
          return;
        }

        const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
        const sessionId = cookies['connect.sid'];

        if (!sessionId) {
          console.log('WebSocket connection rejected: No session cookie');
          done(false, 401, 'No session cookie');
          return;
        }

        // Handle both signed and unsigned session IDs
        const cleanSessionId = decodeURIComponent(sessionId).split('.')[0].replace('s:', '');
        console.log('Processing WebSocket connection for session:', cleanSessionId);

        // Verify session and get user
        sessionStore.get(cleanSessionId, async (err, session) => {
          if (err) {
            console.error('Session store error:', err);
            done(false, 500, 'Session store error');
            return;
          }

          if (!session?.passport?.user) {
            console.log('WebSocket connection rejected: No user in session');
            done(false, 401, 'No user in session');
            return;
          }

          try {
            const user = await db.query.users.findFirst({
              where: eq(users.id, session.passport.user),
            });

            if (!user) {
              console.log('WebSocket connection rejected: User not found');
              done(false, 401, 'User not found');
              return;
            }

            // Store user ID in request for later use
            (req as any).userId = user.id;
            console.log('WebSocket connection authorized for user:', user.id);
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

  // Keep alive mechanism
  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) {
        console.log('Terminating inactive WebSocket connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      console.log('Vite HMR WebSocket connected');
      return;
    }

    ws.userId = (request as any).userId;
    ws.isAlive = true;

    console.log('WebSocket connected for user:', ws.userId);

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
            if (!message.channelId || !message.content || !ws.userId) break;

            try {
              const [newMessage] = await db.insert(messages)
                .values({
                  channel_id: message.channelId,
                  user_id: ws.userId,
                  content: message.content,
                  parent_id: message.parentId || null,
                })
                .returning();

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
            console.log(`User ${ws.userId} subscribing to channel ${message.channelId}`);

            if (!channelSubscriptions.has(message.channelId)) {
              channelSubscriptions.set(message.channelId, new Set());
            }
            channelSubscriptions.get(message.channelId)?.add(ws);
            break;
          }

          case 'unsubscribe': {
            if (!message.channelId) break;
            console.log(`User ${ws.userId} unsubscribing from channel ${message.channelId}`);
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
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message'
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket disconnected for user:', ws.userId);
      ws.isAlive = false;
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for user:', ws.userId, error);
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