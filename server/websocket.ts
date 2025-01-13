import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments, sessions } from "@db/schema";
import { eq, asc } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping' | 'message_deleted' | 'message_edited';
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: { url: string; originalName: string; mimetype: string; size: number }[];
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

        const session = await db.query.sessions.findFirst({
          where: eq(sessions.sid, cleanSessionId),
        });

        if (!session?.sess) {
          console.error('WebSocket connection rejected: Invalid session');
          done(false, 401, 'Invalid session');
          return;
        }

        const sessionData = typeof session.sess === 'string'
          ? JSON.parse(session.sess)
          : session.sess;

        if (!sessionData?.passport?.user) {
          console.error('WebSocket connection rejected: No user in session');
          done(false, 401, 'Authentication failed');
          return;
        }

        (req as any).userId = sessionData.passport.user;
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

  const normalizeMessageForClient = (msg: any) => {
    console.log('Normalizing message:', msg);
    const normalized = {
      id: msg.id?.toString(),
      channel_id: msg.channel_id?.toString(),
      user_id: msg.user_id?.toString(),
      content: msg.content || '',
      created_at: msg.created_at || new Date().toISOString(),
      updated_at: msg.updated_at || msg.created_at || new Date().toISOString(),
      parent_id: msg.parent_id?.toString() || null,
      author: msg.author,
      attachments: msg.attachments?.map((attachment: any) => ({
        id: attachment.id?.toString(),
        url: attachment.file_url || attachment.url || '',
        originalName: attachment.file_name || attachment.originalName || '',
        mimetype: attachment.file_type || attachment.mimetype || '',
        file_size: Number(attachment.file_size) || 0
      })) || []
    };
    console.log('Normalized result:', normalized);
    return normalized;
  };

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    ws.userId = (request as any).userId?.toString();
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
              console.log('Fetching existing messages for channel:', message.channelId);
              const existingMessages = await db.query.messages.findMany({
                where: eq(messages.channel_id, message.channelId),
                with: {
                  author: true,
                  attachments: true,
                },
                orderBy: [asc(messages.created_at)],
              });

              console.log('Found messages:', existingMessages.length);
              existingMessages.forEach(msg => {
                console.log('Processing message for initial load:', msg.id);
                const normalizedMessage = normalizeMessageForClient(msg);
                ws.send(JSON.stringify({
                  type: 'message',
                  message: normalizedMessage
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
              const [newMessage] = await db.insert(messages).values({
                channel_id: message.channelId,
                user_id: ws.userId,
                content: message.content,
                parent_id: message.parentId || null,
              }).returning();

              if (message.attachments && message.attachments.length > 0) {
                const attachmentRecords = message.attachments.map((attachment) => ({
                  message_id: newMessage.id,
                  file_url: attachment.url,
                  file_name: attachment.originalName,
                  file_type: attachment.mimetype,
                  file_size: attachment.size || 0,
                }));

                await db.insert(file_attachments).values(attachmentRecords);
                console.log('Created attachment records:', attachmentRecords);
              }

              const messageWithAuthor = await db.query.messages.findFirst({
                where: eq(messages.id, newMessage.id),
                with: {
                  author: true,
                  attachments: true,
                }
              });

              if (messageWithAuthor) {
                const normalizedMessage = normalizeMessageForClient(messageWithAuthor);
                console.log('Broadcasting new message:', normalizedMessage);

                broadcastToChannel(message.channelId, {
                  type: 'message',
                  message: normalizedMessage
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

          case 'message_edited': {
            if (!message.channelId || !message.messageId || !message.content || !ws.userId) break;

            try {
              console.log('Processing message edit:', {
                messageId: message.messageId,
                content: message.content
              });

              await db
                .update(messages)
                .set({
                  content: message.content,
                  updated_at: new Date()
                })
                .where(eq(messages.id, message.messageId));

              const updatedMessage = await db.query.messages.findFirst({
                where: eq(messages.id, message.messageId),
                with: {
                  author: true,
                  attachments: true,
                }
              });

              if (updatedMessage) {
                console.log('Message before normalization:', updatedMessage);
                const normalizedMessage = normalizeMessageForClient(updatedMessage);
                console.log('Broadcasting normalized edited message:', normalizedMessage);

                broadcastToChannel(message.channelId, {
                  type: 'message_edited',
                  message: normalizedMessage
                });
              }
            } catch (error) {
              console.error('Error handling message edit:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to edit message'
              }));
            }
            break;
          }

          case 'message_deleted': {
            if (!message.channelId || !message.messageId) break;

            try {
              await db.delete(messages).where(eq(messages.id, message.messageId));
              broadcastToChannel(message.channelId, {
                type: 'message_deleted',
                messageId: message.messageId,
                channelId: message.channelId
              });
            } catch (error) {
              console.error('Error handling message deletion:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to delete message'
              }));
            }
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