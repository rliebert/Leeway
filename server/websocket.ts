import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { db } from "@db";
import { messages, file_attachments, sessions, users } from "@db/schema";
import { eq, asc } from "drizzle-orm";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { serverDebugLogger as debug } from "./debug";
import { trainOnUserMessages, startPeriodicRetraining, isQuestion, findSimilarMessages, generateAIResponse } from './services/rag';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping' | 'message_deleted' | 'message_edited' | 'debug_mode' | 'retrain_ai';
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: { url: string; originalName: string; mimetype: string; size: number }[];
  enabled?: boolean;
}

export function setupWebSocketServer(server: Server) {
  // Start with debug logging disabled
  debug.disable();

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
          debug.error('WebSocket connection rejected: No session cookie');
          done(false, 401, 'No session cookie');
          return;
        }

        const cleanSessionId = decodeURIComponent(sessionId).split('s:')[1]?.split('.')[0];
        if (!cleanSessionId) {
          debug.error('WebSocket connection rejected: Invalid session format');
          done(false, 401, 'Invalid session format');
          return;
        }

        const session = await db.query.sessions.findFirst({
          where: eq(sessions.sid, cleanSessionId),
        });

        if (!session?.sess) {
          debug.error('WebSocket connection rejected: Invalid session');
          done(false, 401, 'Invalid session');
          return;
        }

        const sessionData = typeof session.sess === 'string'
          ? JSON.parse(session.sess)
          : session.sess;

        if (!sessionData?.passport?.user) {
          debug.error('WebSocket connection rejected: No user in session');
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

  const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) {
        debug.log('Terminating inactive connection for user:', ws.userId);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);

  const normalizeMessageForClient = (msg: any) => {
    debug.startGroup('Normalizing message');
    debug.debug('Input message:', msg);

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

    debug.debug('Normalized output:', normalized);
    debug.endGroup();
    return normalized;
  };

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    ws.userId = (request as any).userId?.toString();
    ws.isAlive = true;
    debug.info('WebSocket connected for user:', ws.userId);

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

        // Handle debug mode toggle messages
        if (message.type === 'debug_mode') {
          if (message.enabled) {
            debug.enable();
          } else {
            debug.disable();
          }
          return;
        }

        // Handle retrain_ai command (admin only)
        if (message.type === 'retrain_ai') {
          const user = await db.query.users.findFirst({
            where: eq(users.id, ws.userId)
          });

          if (!user?.is_admin) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Only administrators can trigger AI retraining'
            }));
            return;
          }

          const result = await trainOnUserMessages(user.id);
          ws.send(JSON.stringify({
            type: 'retrain_ai_status',
            success: result.success,
            message: result.success
              ? `Successfully processed ${result.newMessagesProcessed} messages`
              : `Training failed: ${result.error}`
          }));
          return;
        }


        debug.startGroup(`Processing message type: ${message.type}`);
        debug.debug('Received message:', message);

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          debug.endGroup();
          return;
        }

        // Check if message is a question and should trigger AI response
        if (message.type === 'message' && message.content && isQuestion(message.content)) {
          try {
            const aiRobUser = await db.query.users.findFirst({
              where: eq(users.username, 'ai.rob'),
            });

            if (!aiRobUser) {
              console.error('AI bot user not found');
              return;
            }

            const similarMessages = await findSimilarMessages(message.content);
            const aiResponse = await generateAIResponse(message.content, similarMessages);

            // Send AI response as ai.rob
            const [aiMessage] = await db.insert(messages).values({
              channel_id: message.channelId,
              user_id: aiRobUser.id,
              content: aiResponse,
              parent_id: null,
            }).returning();

            const messageWithAuthor = await db.query.messages.findFirst({
              where: eq(messages.id, aiMessage.id),
              with: {
                author: true,
                attachments: true,
              }
            });

            if (messageWithAuthor) {
              broadcastToChannel(message.channelId, {
                type: 'message',
                message: normalizeMessageForClient(messageWithAuthor)
              });
            }
          } catch (error) {
            console.error('Error generating AI response:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to generate AI response'
            }));
          }
        }

        switch (message.type) {
          case 'subscribe': {
            if (!message.channelId) break;
            const isDirectMessage = message.channelId.startsWith('dm_');

            if (!channelSubscriptions.has(message.channelId)) {
              channelSubscriptions.set(message.channelId, new Set());
            }
            channelSubscriptions.get(message.channelId)?.add(ws);
            debug.log(`User ${ws.userId} subscribed to ${isDirectMessage ? 'DM' : 'channel'} ${message.channelId}`);

            try {
              debug.log('Fetching existing messages for channel:', message.channelId);
              const messageTable = isDirectMessage ? 'direct_messages' : 'messages';
              const existingMessages = await db.query[messageTable].findMany({
                where: eq(messages.channel_id, isDirectMessage ? message.channelId.replace('dm_', '') : message.channelId),
                with: {
                  author: true,
                  attachments: true,
                },
                orderBy: [asc(messages.created_at)],
              });

              debug.log('Found messages:', existingMessages.length);
              existingMessages.forEach(msg => {
                ws.send(JSON.stringify({
                  type: 'message',
                  message: normalizeMessageForClient(msg)
                }));
              });
            } catch (error) {
              debug.error('Error fetching message history:', error);
            }
            break;
          }

          case 'unsubscribe': {
            if (!message.channelId) break;
            channelSubscriptions.get(message.channelId)?.delete(ws);
            debug.log(`User ${ws.userId} unsubscribed from channel ${message.channelId}`);
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
                debug.log('Created attachment records:', attachmentRecords);
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
                debug.log('Broadcasting new message:', normalizedMessage);

                broadcastToChannel(message.channelId, {
                  type: 'message',
                  message: normalizedMessage
                });
              }
            } catch (error) {
              debug.error('Error handling message:', error);
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
              debug.startGroup('Processing message edit');
              debug.debug('Edit request:', {
                messageId: message.messageId,
                content: message.content,
                channelId: message.channelId
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
                debug.debug('Message before normalization:', updatedMessage);
                const normalizedMessage = normalizeMessageForClient(updatedMessage);
                debug.debug('Broadcasting normalized edited message:', normalizedMessage);

                broadcastToChannel(message.channelId, {
                  type: 'message_edited',
                  message: normalizedMessage
                });
              } else {
                debug.warn('Message not found after update');
              }
              debug.endGroup();
            } catch (error) {
              debug.error('Error handling message edit:', error);
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
              debug.error('Error handling message deletion:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to delete message'
              }));
            }
            break;
          }
        }
        debug.endGroup();
      } catch (error) {
        debug.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    });

    ws.on('close', () => {
      ws.isAlive = false;
      debug.log('WebSocket closed for user:', ws.userId);
      channelSubscriptions.forEach(subscribers => {
        subscribers.delete(ws);
      });
    });

    ws.on('error', (error) => {
      debug.error('WebSocket error for user:', ws.userId, error);
    });
  });

  // Start periodic retraining when server starts
  startPeriodicRetraining();

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