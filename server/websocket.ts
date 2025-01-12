import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments, sessions } from "@db/schema";
import { eq, and, or, desc, asc } from "drizzle-orm";
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
    clientTracking: true,
    verifyClient: async ({ req, origin }, callback) => {
      try {
        console.log('WebSocket connection attempt from origin:', origin);
        const cookies = parseCookie(req.headers.cookie || '');

        // Find connect.sid cookie
        const sessionId = cookies['connect.sid'];
        if (!sessionId) {
          console.error('WebSocket connection failed: No session cookie found');
          callback(false, 401, 'Unauthorized');
          return;
        }

        // Clean the session ID - remove s: prefix and signature
        const cleanSessionId = sessionId.split('.')[0].replace('s:', '');
        console.log('Verifying session:', cleanSessionId);

        const session = await db.query.sessions.findFirst({
          where: eq(sessions.sid, cleanSessionId),
        });

        if (!session) {
          console.error('WebSocket connection failed: Invalid session');
          callback(false, 401, 'Unauthorized');
          return;
        }

        // Parse session data
        const sessionData = typeof session.sess === 'string' 
          ? JSON.parse(session.sess) 
          : session.sess;

        if (!sessionData?.passport?.user) {
          console.error('WebSocket connection failed: No user in session');
          callback(false, 401, 'Unauthorized');
          return;
        }

        // Store user ID in request for later use
        (req as any).userId = sessionData.passport.user;
        console.log('WebSocket connection authorized for user:', sessionData.passport.user);

        // Add CORS headers for WebSocket upgrade
        const headers = {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Cookie, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        };

        callback(true, 200, 'Connection authorized', headers);
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
              console.log('Invalid message data:', { 
                channelId: message.channelId, 
                content: !!message.content, 
                userId: ws.userId 
              });
              break;
            }

            try {
              console.log('Creating new message:', {
                channelId: message.channelId,
                userId: ws.userId,
                content: message.content,
                parentId: message.parentId
              });

              // Insert message
              const [newMessage] = await db.insert(messages).values({
                channel_id: message.channelId,
                user_id: ws.userId,
                content: message.content,
                parent_id: message.parentId || null,
              }).returning();

              // Handle attachments if any
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

              // Fetch complete message with author and attachments
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
      console.log('WebSocket closed for user:', ws.userId);
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });
  });

  // Heartbeat interval to check for stale connections
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