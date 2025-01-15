import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { serverDebugLogger as debug } from "./debug";
//import { generateAIResponse, isQuestion } from "./services/rag";

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

// Initialize channelSubscriptions at the module level
const channelSubscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

function broadcastToChannel(channelId: string, message: any, excludeWs?: WebSocket) {
  const subscribers = channelSubscriptions.get(channelId);
  if (!subscribers) {
    debug.warn(`No subscribers found for channel: ${channelId}`);
    return;
  }

  const data = JSON.stringify(message);
  let broadcastCount = 0;
  debug.info(`Broadcasting to channel ${channelId}:`, message);

  subscribers.forEach((client: AuthenticatedWebSocket) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
        broadcastCount++;
        debug.info(`Successfully sent to client ${client.userId}`);
      } catch (error) {
        debug.error(`Failed to send to client: ${error}`);
      }
    }
  });

  debug.info(`Broadcast complete: ${broadcastCount} clients received the message`);
}

export function setupWebSocketServer(server: Server) {
  // Enhance debug logging
  debug.enable();

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

  wss.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    ws.userId = (request as any).userId?.toString();
    ws.isAlive = true;
    debug.info('WebSocket connected for user:', ws.userId);

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data) as WSMessage;
        debug.info(`Received message of type: ${message.type}`, message);

        switch (message.type) {
          case 'message_deleted': {
            if (!message.channelId || !message.messageId) {
              debug.warn('Invalid message_deleted event:', { message });
              break;
            }

            try {
              debug.info('Processing message deletion request:', {
                messageId: message.messageId,
                channelId: message.channelId,
                userId: ws.userId
              });

              // First check if message exists and get its details
              const targetMessage = await db.query.messages.findFirst({
                where: eq(messages.id, message.messageId),
                with: {
                  author: true
                }
              });

              if (!targetMessage) {
                debug.warn('Message not found for deletion:', message.messageId);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Message not found'
                }));
                break;
              }

              // Check permissions
              const user = await db.query.users.findFirst({
                where: eq(users.id, ws.userId!)
              });

              const isAdmin = user?.is_admin || false;
              const isOwnMessage = targetMessage.user_id === ws.userId;

              if (!user || (!isAdmin && !isOwnMessage)) {
                debug.warn('Unauthorized deletion attempt');
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Not authorized to delete this message'
                }));
                break;
              }

              // Delete message from database
              await db.delete(messages).where(eq(messages.id, message.messageId));
              debug.info('Message deleted from database:', message.messageId);

              // Broadcast deletion to all clients in the channel
              const deleteNotification = {
                type: 'message_deleted',
                messageId: message.messageId,
                channelId: message.channelId
              };

              debug.info('Broadcasting deletion notification:', deleteNotification);
              broadcastToChannel(message.channelId, deleteNotification);
              debug.info('Deletion notification broadcast complete');

            } catch (error) {
              debug.error('Error handling message deletion:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to delete message'
              }));
            }
            break;
          }

          case 'subscribe': {
            if (!message.channelId) break;

            if (!channelSubscriptions.has(message.channelId)) {
              channelSubscriptions.set(message.channelId, new Set());
            }
            channelSubscriptions.get(message.channelId)?.add(ws);
            debug.info(`User ${ws.userId} subscribed to channel ${message.channelId}`);

            // Send existing messages
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
                message: normalizeMessageForClient(msg)
              }));
            });
            break;
          }

          case 'message': {
            if (!message.channelId || !message.content || !ws.userId) {
              debug.warn('Invalid message data:', message);
              break;
            }

            try {
              debug.info('Creating new message in database');
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
              }

              const messageWithAuthor = await db.query.messages.findFirst({
                where: eq(messages.id, newMessage.id),
                with: {
                  author: true,
                  attachments: true,
                }
              });

              if (messageWithAuthor) {
                debug.info('Broadcasting new message to channel');
                broadcastToChannel(message.channelId, {
                  type: 'message',
                  message: normalizeMessageForClient(messageWithAuthor)
                });