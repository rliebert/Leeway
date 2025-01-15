import type { IncomingMessage } from "http";
import type { Server } from "http";
import { parse as parseCookie } from "cookie";
import { WebSocketServer, WebSocket } from "ws";
import { serverDebugLogger as debug } from "./debug";
import { db } from "@db";
import { sessions, messages, users, file_attachments } from "@db/schema";
import { eq, asc } from "drizzle-orm";

// Constants
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 35000;
const PING_INTERVAL = 5000; // More frequent pings for better monitoring
const PING_TIMEOUT = 2000;  // How long to wait for pong before marking connection as degraded
const CLEANUP_INTERVAL = 60000; // 1 minute

// Types
interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  isAlive: boolean;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'ping' | 'message_deleted' | 'message_edited';
  channelId?: string;
  content?: string;
  parentId?: string;
  attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
  }>;
  messageId?: string;
}

// Track channel subscriptions
const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

function broadcastToChannel(channelId: string, message: any, excludeWs?: WebSocket) {
  const subscribers = channelSubscriptions.get(channelId);
  console.log('Broadcasting to channel:', {
    channelId,
    message,
    numSubscribers: subscribers?.size || 0,
    timestamp: new Date().toLocaleTimeString()
  });
  if (!subscribers) {
    console.warn(`No subscribers found for channel: ${channelId}`);
    debug.warn(`No subscribers found for channel: ${channelId}`);
    return;
  }

  const data = JSON.stringify(message);
  let broadcastCount = 0;

  subscribers.forEach((client: AuthenticatedWebSocket) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try {
        debug.info('Sending message to client:', { userId: client.userId });
        client.send(data);
        broadcastCount++;
        debug.info('Successfully sent message to client');
      } catch (error) {
        debug.error(`Failed to send to client: ${error}`);
        subscribers.delete(client); // Remove failed client
      }
    }
  });

  debug.info(`Broadcast complete: ${broadcastCount} clients received the message`);
}

function normalizeMessageForClient(message: any) {
  return {
    id: message.id,
    content: message.content,
    created_at: message.created_at,
    updated_at: message.updated_at,
    channel_id: message.channel_id,
    user_id: message.user_id,
    parent_id: message.parent_id,
    tempId: message.tempId, // Include tempId in normalized message
    author: message.author ? {
      id: message.author.id,
      username: message.author.username,
      avatar_url: message.author.avatar_url,
    } : undefined,
    attachments: message.attachments?.map((attachment: any) => ({
      id: attachment.id,
      file_url: attachment.file_url,
      file_name: attachment.file_name,
      file_type: attachment.file_type,
      file_size: attachment.file_size,
    })),
  };
}

export function setupWebSocketServer(server: Server) {
  debug.info('Setting up WebSocket server');

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    perMessageDeflate: false,
    verifyClient: async ({ req }, done) => {
      debug.info('Verifying WebSocket connection', {
        protocol: req.headers['sec-websocket-protocol'],
        origin: req.headers.origin
      });

      // Allow Vite HMR connections
      if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
        debug.info('Allowing Vite HMR connection');
        done(true);
        return;
      }

      try {
        const cookies = parseCookie(req.headers.cookie || '');
        const sessionId = cookies['connect.sid'];

        if (!sessionId) {
          debug.error('No session cookie found');
          done(false, 401, 'No session cookie');
          return;
        }

        const cleanSessionId = decodeURIComponent(sessionId).split('s:')[1]?.split('.')[0];
        if (!cleanSessionId) {
          debug.error('Invalid session format');
          done(false, 401, 'Invalid session format');
          return;
        }

        const session = await db.query.sessions.findFirst({
          where: eq(sessions.sid, cleanSessionId),
        });

        if (!session?.sess) {
          debug.error('Invalid session');
          done(false, 401, 'Invalid session');
          return;
        }

        const sessionData = typeof session.sess === 'string' 
          ? JSON.parse(session.sess) 
          : session.sess;

        if (!sessionData?.passport?.user) {
          debug.error('No user in session');
          done(false, 401, 'Authentication failed');
          return;
        }

        (req as any).userId = sessionData.passport.user;
        done(true);
      } catch (error) {
        debug.error('WebSocket authentication error:', error);
        done(false, 500, 'Internal server error');
      }
    }
  });

  wss.on('listening', () => {
    debug.info('WebSocket server is listening');
  });

  wss.on('error', (error) => {
    debug.error('WebSocket server error:', error);
  });

  // Clean up dead connections periodically
  const cleanupInterval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        channelSubscriptions.forEach(subscribers => subscribers.delete(ws));
      }
    });
  }, CLEANUP_INTERVAL);

  wss.on('connection', (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') return;

    ws.userId = (request as any).userId;
    ws.isAlive = true;

    const heartbeat = setInterval(() => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      channelSubscriptions.forEach(subscribers => subscribers.delete(ws));
    });

    ws.on('message', async (data: string) => {
      try {
        console.log('WebSocket message received:', data.toString());
        debug.info('Raw WebSocket message received:', data.toString());
        const message = JSON.parse(data) as WSMessage;
        console.log('Parsed WebSocket message:', {
          type: message.type,
          channelId: message.channelId,
          tempId: message.tempId,
          content: message.content?.substring(0, 50),
          timestamp: new Date().toLocaleTimeString()
        });

        // Handle subscriptions first
        if (message.type === 'subscribe' && message.channelId) {
          let subscribers = channelSubscriptions.get(message.channelId);
          if (!subscribers) {
            subscribers = new Set();
            channelSubscriptions.set(message.channelId, subscribers);
          }
          subscribers.add(ws);
          debug.info(`Client subscribed to channel ${message.channelId}`);
          return;
        }

        if (message.type === 'unsubscribe' && message.channelId) {
          const subscribers = channelSubscriptions.get(message.channelId);
          if (subscribers) {
            subscribers.delete(ws);
            debug.info(`Client unsubscribed from channel ${message.channelId}`);
          }
          return;
        }
        debug.info('Parsed WebSocket message:', {
          type: message.type,
          channelId: message.channelId,
          tempId: message.tempId,
          content: message.content?.substring(0, 50),
          timestamp: new Date().toLocaleTimeString()
        });
        switch (message.type) {
          case 'message': {
            if (!message.channelId || !message.content) {
              debug.warn('Invalid message data:', { channelId: message.channelId, hasContent: !!message.content });
              return;
            }

            // Check if message is a question and trigger AI response
            const { isQuestion, handleAIResponse } = require('./services/rag');
            if (isQuestion(message.content)) {
              debug.info('Question detected, generating AI response');
              const aiResponse = await handleAIResponse(message.content);
              if (aiResponse) {
                // Get AI bot user
                const aiBot = await db.query.users.findFirst({
                  where: eq(users.username, 'ai.rob')
                });

                if (aiBot) {
                  // Create AI response message
                  const [aiMessage] = await db.insert(messages)
                    .values({
                      content: aiResponse,
                      channel_id: message.channelId,
                      user_id: aiBot.id,
                    })
                    .returning();

                  const messageWithAuthor = await db.query.messages.findFirst({
                    where: eq(messages.id, aiMessage.id),
                    with: {
                      author: true,
                      attachments: true,
                    },
                  });

                  if (messageWithAuthor) {
                    broadcastToChannel(message.channelId, {
                      type: 'message',
                      message: normalizeMessageForClient(messageWithAuthor)
                    });
                  }
                }
              }
            }
            debug.info('WebSocket packet received:', {
              type: message.type,
              tempId: message.tempId,
              content: message.content,
              channelId: message.channelId
            });

            try {
              // Create message and handle attachments
              const [newMessage] = await db.insert(messages)
                .values({
                  content: message.content,
                  channel_id: message.channelId,
                  user_id: ws.userId,
                  parent_id: message.parentId || null,
                })
                .returning();

              // If there are attachments, insert them
              if (message.attachments && message.attachments.length > 0) {
                await db.insert(file_attachments)
                  .values(message.attachments.map(attachment => ({
                    message_id: newMessage.id,
                    file_url: attachment.url,
                    file_name: attachment.originalName,
                    file_type: attachment.mimetype,
                    file_size: attachment.file_size
                  })));
              }

              const messageWithAuthor = await db.query.messages.findFirst({
                where: eq(messages.id, newMessage.id),
                with: {
                  author: true,
                  attachments: true,
                },
              });

              if (messageWithAuthor) {
                debug.info('Preparing broadcast message:', {
                  originalTempId: message.tempId,
                  messageId: messageWithAuthor.id,
                  channelId: message.channelId
                });
                const normalizedMessage = normalizeMessageForClient({
                  ...messageWithAuthor,
                  tempId: message.tempId
                });
                debug.info('Normalized message:', { normalizedMessage });
                const broadcastPacket = {
                  type: 'message',
                  tempId: message.tempId,
                  message: normalizedMessage
                };
                debug.info('Broadcasting packet:', broadcastPacket);
                broadcastToChannel(message.channelId, broadcastPacket);
              }
            } catch (error) {
              debug.error('Error adding message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to add message'
              }));
            }
            break;
          }
          case 'message_edited': {
            if (!message.channelId || !message.messageId || !message.content) {
              debug.warn('Invalid message_edited data:', message);
              break;
            }

            try {
              const targetMessage = await db.query.messages.findFirst({
                where: eq(messages.id, message.messageId)
              });

              if (!targetMessage || targetMessage.user_id !== ws.userId) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Not authorized to edit this message'
                }));
                break;
              }

              await db.update(messages)
                .set({ content: message.content })
                .where(eq(messages.id, message.messageId));

              const updatedMessage = await db.query.messages.findFirst({
                where: eq(messages.id, message.messageId),
                with: {
                  author: true,
                  attachments: true
                }
              });

              if (updatedMessage) {
                broadcastToChannel(message.channelId, {
                  type: 'message_edited',
                  message: normalizeMessageForClient(updatedMessage)
                });
              }
            } catch (error) {
              debug.error('Error editing message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to edit message'
              }));
            }
            break;
          }
          case 'message_deleted': {
            if (!message.channelId || !message.messageId) {
              debug.warn('Invalid message_deleted data:', message);
              break;
            }

            try {
              const targetMessage = await db.query.messages.findFirst({
                where: eq(messages.id, message.messageId)
              });

              debug.info('Delete request for message:', {
                messageId: message.messageId,
                targetMessage,
                userId: ws.userId
              });

              // If message doesn't exist (optimistic), just broadcast the delete
              if (!targetMessage) {
                broadcastToChannel(message.channelId, {
                  type: 'message_deleted',
                  messageId: message.messageId,
                  channelId: message.channelId,
                });
                break;
              }

              if (targetMessage.user_id !== ws.userId) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Not authorized to delete this message'
                }));
                break;
              }

              await db.delete(messages)
                .where(eq(messages.id, message.messageId));

              broadcastToChannel(message.channelId, {
                type: 'message_deleted',
                messageId: message.messageId,
                channelId: message.channelId,
              });

            } catch (error) {
              debug.error('Error deleting message:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to delete message'
              }));
            }
            break;
          }
          // Handle other message types...
        }
      } catch (error) {
        debug.error('Error processing message:', error);
      }
    });
  });

  wss.on('close', () => {
    clearInterval(cleanupInterval);
  });

  return wss;
}