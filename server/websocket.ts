import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, file_attachments } from "@db/schema";
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
    verifyClient: async (info, callback) => {
      try {
        console.log('WebSocket connection attempt with headers:', info.req.headers);
        const cookies = parseCookie(info.req.headers.cookie || '');
        console.log('Parsed cookies:', cookies);

        // Find session cookie - it could be connect.sid or any other name
        const sessionCookie = Object.entries(cookies).find(([key]) => 
          key.includes('.sid') || key.includes('connect.sid')
        );

        if (!sessionCookie) {
          console.error('WebSocket connection failed: No session cookie found');
          callback(false, 401, 'Unauthorized: No session found');
          return;
        }

        const [cookieName, sessionId] = sessionCookie;
        console.log('Found session cookie:', cookieName, 'with value:', sessionId);

        // Clean the session ID
        const cleanSessionId = decodeURIComponent(sessionId.replace(/^s%3A/, ''));

        try {
          const result = await db.execute(
            `SELECT sess FROM "session" WHERE sid = $1`,
            [cleanSessionId]
          );

          console.log('Session query result:', result);

          if (!result.rows?.length) {
            console.error('WebSocket connection failed: Invalid session');
            callback(false, 401, 'Unauthorized: Invalid session');
            return;
          }

          const session = result.rows[0];
          if (!session?.sess?.passport?.user) {
            console.error('WebSocket connection failed: No user in session');
            callback(false, 401, 'Unauthorized: No user found in session');
            return;
          }

          (info.req as any).userId = session.sess.passport.user;
          console.log('WebSocket connection authorized for user:', session.sess.passport.user);
          callback(true);
        } catch (error) {
          console.error('Error querying session:', error);
          callback(false, 500, 'Internal server error');
        }
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        callback(false, 500, 'Internal server error');
      }
    }
  });

  const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  const heartbeat = (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
  };

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

  wss.on('connection', (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    ws.isAlive = true;
    ws.userId = (request as any).userId;
    console.log('WebSocket connected for user:', ws.userId);

    ws.on('pong', () => heartbeat(ws));

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
              console.log('Invalid message data:', { channelId: message.channelId, content: !!message.content, userId: ws.userId });
              break;
            }

            try {
              console.log('Inserting message:', {
                channelId: message.channelId,
                userId: ws.userId,
                content: message.content,
                parentId: message.parentId
              });

              const [newMessage] = await db.insert(messages).values({
                channel_id: message.channelId,
                user_id: ws.userId,
                content: message.content,
                parent_id: message.parentId || null,
              }).returning();

              if (message.attachments?.length) {
                console.log('Processing attachments:', message.attachments);
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
                console.log('Broadcasting message:', messageWithAuthor);
                broadcastToChannel(message.channelId, {
                  type: 'message',
                  message: messageWithAuthor
                });
              }
            } catch (error) {
              console.error('Error handling message:', error);
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
        console.error('WebSocket message handling error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket closed for user:', ws.userId);
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      const ws = client as AuthenticatedWebSocket;
      if (ws.isAlive === false) {
        console.log('Terminating inactive WebSocket for user:', ws.userId);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}