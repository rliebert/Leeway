import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments, sessions } from "@db/schema";
import { eq } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing';
  channelId?: string;
  content?: string;
  parentId?: string;
  attachments?: string[];
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    perMessageDeflate: true,
  });

  const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    try {
      // Parse and validate session
      const cookies = parseCookie(request.headers.cookie || '');
      const sessionId = cookies['connect.sid'];

      if (!sessionId) {
        console.error('WebSocket connection rejected: No session cookie');
        ws.close(4001, 'No session cookie');
        return;
      }

      // Clean session ID and verify
      const cleanSessionId = decodeURIComponent(sessionId).split('.')[0].replace('s:', '');
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.sid, cleanSessionId),
      });

      if (!session?.sess) {
        console.error('WebSocket connection rejected: Invalid session');
        ws.close(4001, 'Invalid session');
        return;
      }

      // Parse session data and verify user
      const sessionData = typeof session.sess === 'string' 
        ? JSON.parse(session.sess) 
        : session.sess;

      if (!sessionData?.passport?.user) {
        console.error('WebSocket connection rejected: No user in session');
        ws.close(4001, 'Authentication failed');
        return;
      }

      // Setup connection
      ws.userId = sessionData.passport.user;
      ws.isAlive = true;
      console.log('WebSocket connected for user:', ws.userId);

      // Setup ping/pong
      const pingInterval = setInterval(() => {
        if (!ws.isAlive) {
          console.log('Terminating inactive connection for user:', ws.userId);
          clearInterval(pingInterval);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      }, 30000);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle messages
      ws.on('message', async (data: string) => {
        try {
          const message = JSON.parse(data) as WSMessage;
          console.log('Received message:', message);

          switch (message.type) {
            case 'subscribe': {
              if (!message.channelId) break;
              if (!channelSubscriptions.has(message.channelId)) {
                channelSubscriptions.set(message.channelId, new Set());
              }
              channelSubscriptions.get(message.channelId)?.add(ws);
              console.log(`User ${ws.userId} subscribed to channel ${message.channelId}`);
              break;
            }

            case 'unsubscribe': {
              if (!message.channelId) break;
              channelSubscriptions.get(message.channelId)?.delete(ws);
              console.log(`User ${ws.userId} unsubscribed from channel ${message.channelId}`);
              break;
            }

            case 'message': {
              if (!message.channelId || !message.content || !ws.userId) {
                console.log('Invalid message data:', { 
                  channelId: message.channelId, 
                  content: !!message.content, 
                  userId: ws.userId 
                });
                break;
              }

              try {
                const [newMessage] = await db.insert(messages).values({
                  channel_id: message.channelId,
                  user_id: ws.userId,
                  content: message.content,
                  parent_id: message.parentId || null,
                }).returning();

                if (message.attachments?.length) {
                  for (const attachmentId of message.attachments) {
                    await db.insert(file_attachments).values({
                      message_id: newMessage.id,
                      file_url: `/uploads/${attachmentId}`,
                      file_name: attachmentId,
                      file_type: 'application/octet-stream',
                      file_size: 0,
                    });
                  }
                }

                const messageWithAuthor = await db.query.messages.findFirst({
                  where: eq(messages.id, newMessage.id),
                  with: {
                    author: true,
                    attachments: true,
                  }
                });

                if (messageWithAuthor) {
                  broadcastToChannel(message.channelId, {
                    type: 'message',
                    message: messageWithAuthor
                  });
                }
              } catch (error) {
                console.error('Error handling message:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Failed to send message'
                }));
              }
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
            message: 'Failed to process message'
          }));
        }
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
        console.log('WebSocket closed for user:', ws.userId);
        channelSubscriptions.forEach(subscribers => {
          subscribers.delete(ws);
        });
      });

      // Send initial connection success message
      ws.send(JSON.stringify({ 
        type: 'connected',
        userId: ws.userId
      }));

    } catch (error) {
      console.error('Error in WebSocket connection:', error);
      ws.close(1011, 'Internal server error');
    }
  });

  const broadcastToChannel = (channelId: string, message: any, excludeWs?: WebSocket) => {
    const subscribers = channelSubscriptions.get(channelId);
    if (!subscribers) return;

    const data = JSON.stringify(message);
    subscribers.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  return wss;
}