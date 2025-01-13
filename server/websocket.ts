import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments } from "@db/schema";
import { eq, and, or, desc, asc } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface MessageAttachment {
  message_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping' | 'message_deleted';
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
    handleProtocols: () => 'chat',
    verifyClient: async ({ req }, done) => {
      try {
        if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
          done(true);
          return;
        }

        const cookies = parseCookie(req.headers.cookie || '');
        const sessionId = cookies['connect.sid'];

        if (!sessionId) {
          console.error('WebSocket connection rejected: No session cookie');
          done(false, 401, 'No session cookie');
          return;
        }

        const cleanSessionId = decodeURIComponent(sessionId).split('s:')[1]?.split('.')[0];
        if (!cleanSessionId) {
          console.error('WebSocket connection rejected: Invalid session format');
          done(false, 401, 'Invalid session format');
          return;
        }

        // Use MemoryStore session validation (since we removed DB sessions)
        const user = req.session?.passport?.user;
        if (!user) {
          console.error('WebSocket connection rejected: No user in session');
          done(false, 401, 'Authentication failed');
          return;
        }

        (req as any).userId = user;
        done(true);
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        done(false, 500, 'Internal server error');
      }
    }
  });

  const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) {
        console.log('Terminating inactive connection for user:', ws.userId);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    ws.userId = (request as any).userId;
    ws.isAlive = true;
    console.log('WebSocket connected for user:', ws.userId);

    ws.send(JSON.stringify({
      type: 'connected',
      userId: ws.userId
    }));

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
          case 'subscribe': {
            if (!message.channelId) break;
            if (!channelSubscriptions.has(message.channelId)) {
              channelSubscriptions.set(message.channelId, new Set());
            }
            channelSubscriptions.get(message.channelId)?.add(ws);
            console.log(`User ${ws.userId} subscribed to channel ${message.channelId}`);

            try {
              const existingMessages = await db.query.messages.findMany({
                where: eq(messages.channel_id, message.channelId),
                with: {
                  author: true,
                  attachments: true,
                },
                orderBy: [asc(messages.created_at)],
                limit: 50,
              });

              existingMessages.forEach(msg => {
                ws.send(JSON.stringify({
                  type: 'message',
                  message: msg
                }));
              });
            } catch (error) {
              console.error('Error fetching message history:', error);
            }
            break;
          }

          case 'unsubscribe': {
            if (!message.channelId) break;
            channelSubscriptions.get(message.channelId)?.delete(ws);
            console.log(`User ${ws.userId} unsubscribed from channel ${message.channelId}`);
            break;
          }

          case 'message': {
            if (!message.channelId || !message.content || !ws.userId) break;

            try {
              console.log('Processing message with attachments:', message.attachments?.length || 0);

              // Step 1: Create message first
              const [newMessage] = await db.insert(messages).values({
                channel_id: message.channelId,
                user_id: ws.userId,
                content: message.content,
                parent_id: message.parentId || null,
              }).returning();

              console.log('Created message:', newMessage.id);

              // Step 2: Create attachments if any
              if (message.attachments?.length) {
                console.log('Creating attachments for message:', newMessage.id);

                const attachmentRecords = message.attachments
                  .filter(attachment => {
                    if (!attachment.url || !attachment.name || !attachment.type || attachment.size <= 0) {
                      console.error('Invalid attachment data:', attachment);
                      return false;
                    }
                    return true;
                  })
                  .map(attachment => ({
                    message_id: newMessage.id,
                    file_url: attachment.url,
                    file_name: attachment.name,
                    file_type: attachment.type,
                    file_size: attachment.size
                  }));

                if (attachmentRecords.length > 0) {
                  console.log('Creating attachment records:', attachmentRecords);
                  const createdAttachments = await db.insert(file_attachments)
                    .values(attachmentRecords)
                    .returning();
                  console.log('Created attachments:', createdAttachments);
                }
              }

              // Step 3: Fetch complete message with attachments
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

              // Step 4: Broadcast message
              console.log('Broadcasting message:', {
                id: completeMessage.id,
                content: completeMessage.content,
                attachments: completeMessage.attachments?.length || 0
              });

              broadcastToChannel(message.channelId, {
                type: 'message',
                message: completeMessage
              });

            } catch (error) {
              console.error('Error handling message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to send message',
                details: error instanceof Error ? error.message : 'Unknown error'
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

          case 'message_deleted': {
            if (!message.channelId || !message.messageId) break;
            broadcastToChannel(message.channelId, {
              type: 'message_deleted',
              messageId: message.messageId,
              channelId: message.channelId
            });
            break;
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
          details: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    });

    ws.on('close', () => {
      ws.isAlive = false;
      console.log('WebSocket closed for user:', ws.userId);
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