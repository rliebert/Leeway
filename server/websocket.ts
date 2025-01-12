import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { User } from "@db/schema";
import { db } from "@db";
import { messages } from "@db/schema";
import { eq } from "drizzle-orm";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface BroadcastMessage {
  type: 'message' | 'typing' | 'presence';
  channelId: string;
  data: any;
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Store active connections by channel
  const channelSubscriptions: Map<string, Set<AuthenticatedWebSocket>> = new Map();

  const heartbeat = (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
  };

  const broadcastToChannel = (channelId: string, message: BroadcastMessage, excludeWs?: WebSocket) => {
    const subscribers = channelSubscriptions.get(channelId);
    if (!subscribers) return;

    const data = JSON.stringify(message);
    for (const client of subscribers) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };

  wss.on('connection', (ws: AuthenticatedWebSocket, request) => {
    ws.isAlive = true;

    // Extract user ID from session
    const userId = (request as any).session?.passport?.user;
    if (!userId) {
      ws.close(1008, 'Authentication required');
      return;
    }
    ws.userId = userId;

    ws.on('pong', () => heartbeat(ws));

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'subscribe':
            // Subscribe to channel updates
            const channelId = message.channelId;
            if (!channelSubscriptions.has(channelId)) {
              channelSubscriptions.set(channelId, new Set());
            }
            channelSubscriptions.get(channelId)!.add(ws);
            break;

          case 'unsubscribe':
            // Unsubscribe from channel
            const channel = channelSubscriptions.get(message.channelId);
            if (channel) {
              channel.delete(ws);
            }
            break;

          case 'message':
            // Handle new message
            if (!message.channelId || !message.content) break;

            const [newMessage] = await db.insert(messages).values({
              channel_id: message.channelId,
              user_id: ws.userId!,
              content: message.content,
            }).returning();

            if (newMessage) {
              broadcastToChannel(message.channelId, {
                type: 'message',
                channelId: message.channelId,
                data: newMessage
              });
            }
            break;

          case 'typing':
            // Handle typing indicator
            broadcastToChannel(message.channelId, {
              type: 'typing',
              channelId: message.channelId,
              data: { userId: ws.userId }
            }, ws);
            break;
        }
      } catch (error) {
        console.error('WebSocket message handling error:', error);
      }
    });

    ws.on('close', () => {
      // Remove from all channel subscriptions
      for (const subscribers of channelSubscriptions.values()) {
        subscribers.delete(ws);
      }
    });
  });

  // Ping clients every 30 seconds
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as AuthenticatedWebSocket;
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}