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
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping';
  channelId?: string;
  content?: string;
  parentId?: string;
  attachments?: string[];
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    perMessageDeflate: false, // Disable compression for better compatibility
    clientTracking: true,
    handleProtocols: () => 'chat',
    verifyClient: async ({ req }, done) => {
      try {
        // Always allow Vite HMR connections
        if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
          done(true);
          return;
        }

        // For application WebSocket connections, verify authentication
        const cookies = parseCookie(req.headers.cookie || '');
        const sessionId = cookies['connect.sid'];

        if (!sessionId) {
          console.error('WebSocket connection rejected: No session cookie');
          done(false, 401, 'No session cookie');
          return;
        }

        // Clean session ID and verify
        const cleanSessionId = decodeURIComponent(sessionId).split('s:')[1]?.split('.')[0];
        if (!cleanSessionId) {
          console.error('WebSocket connection rejected: Invalid session format');
          done(false, 401, 'Invalid session format');
          return;
        }

        // Verify session in database
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

  // Track channel subscriptions
  const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  // Heartbeat check every 15 seconds
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
    // Skip processing for Vite HMR connections
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    ws.userId = (request as any).userId;
    ws.isAlive = true;
    console.log('WebSocket connected for user:', ws.userId);

    // Send initial connection confirmation
    ws.send(JSON.stringify({ 
      type: 'connected',
      userId: ws.userId
    }));

    // Handle heartbeat responses
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data) as WSMessage;

        // Handle ping messages immediately
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
            
            // Fetch and send existing messages
            try {
              const existingMessages = await db.query.messages.findMany({
                where: eq(messages.channel_id, message.channelId),
                with: {
                  author: true,
                  attachments: true,
                },
                orderBy: [asc(messages.created_at)],
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
              const [newMessage] = await db.insert(messages).values({
                channel_id: message.channelId,
                user_id: ws.userId,
                content: message.content,
                parent_id: message.parentId || null,
              }).returning();

              // Handle attachments
              if (message.attachments?.length) {
                await Promise.all(message.attachments.map(attachmentId =>
                  db.insert(file_attachments).values({
                    message_id: newMessage.id,
                    file_url: `/uploads/${attachmentId}`,
                    file_name: attachmentId,
                    file_type: 'application/octet-stream',
                    file_size: 0,
                  })
                ));
              }

              // Get message with author details
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

    // Handle connection closure
    ws.on('close', () => {
      ws.isAlive = false;
      console.log('WebSocket closed for user:', ws.userId);
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error for user:', ws.userId, error);
    });
  });

  // Clean up on server shutdown
  wss.on('close', () => {
    clearInterval(interval);
  });

  // Utility function to broadcast messages to channel subscribers
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