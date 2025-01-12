import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import type { User } from "@db/schema";
import { db } from "@db";
import { messages, file_attachments } from "@db/schema";
import { eq, sql } from "drizzle-orm";
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
        const cookies = parseCookie(info.req.headers.cookie || '');
        const sessionId = cookies['leeway.sid'];

        if (!sessionId) {
          callback(false, 401, 'Unauthorized: No session found');
          return;
        }

        const sessionResult = await db.execute<{ sess: { passport: { user: string } } }>(
          sql`SELECT sess FROM session WHERE sid = ${sessionId}`
        );

        const rows = sessionResult.rows || [];
        if (!rows.length) {
          callback(false, 401, 'Unauthorized: Invalid session');
          return;
        }

        const userId = rows[0]?.sess?.passport?.user;
        if (!userId) {
          callback(false, 401, 'Unauthorized: Invalid session user');
          return;
        }

        (info.req as any).userId = userId;
        callback(true);
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

    ws.on('pong', () => heartbeat(ws));

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data) as WSMessage;

        switch (message.type) {
          case 'subscribe': {
            if (!message.channelId) break;
            if (!channelSubscriptions.has(message.channelId)) {
              channelSubscriptions.set(message.channelId, new Set());
            }
            channelSubscriptions.get(message.channelId)?.add(ws);
            break;
          }

          case 'unsubscribe': {
            if (!message.channelId) break;
            channelSubscriptions.get(message.channelId)?.delete(ws);
            break;
          }

          case 'message': {
            if (!message.channelId || !message.content || !ws.userId) break;

            try {
              // Insert new message into database
              const [newMessage] = await db.insert(messages).values({
                channel_id: message.channelId,
                user_id: ws.userId,
                content: message.content,
                parent_id: message.parentId || null,
              }).returning();

              // Add file attachments if present
              if (message.attachments?.length) {
                for (const attachmentId of message.attachments) {
                  await db.insert(file_attachments).values({
                    message_id: newMessage.id,
                    file_url: `/uploads/${attachmentId}`,
                    file_name: attachmentId,
                    file_type: 'application/octet-stream',
                    file_size: 0, // This will be updated when we properly handle file metadata
                  });
                }
              }

              if (newMessage) {
                // Fetch full message with author details and attachments
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
              }
            } catch (error) {
              console.error('Error inserting message:', error);
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
      // Remove from all channel subscriptions
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });
  });

  // Ping clients every 30 seconds to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      const ws = client as AuthenticatedWebSocket;
      if (ws.isAlive === false) {
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