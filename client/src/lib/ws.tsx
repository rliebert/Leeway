import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Message } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface WSContextType {
  messages: Message[];
  send: (data: WSMessage) => void;
  connected: boolean;
  error: string | null;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping';
  channelId?: string;
  content?: string;
  parentId?: string;
  attachments?: string[];
}

const WSContext = createContext<WSContextType>({
  messages: [],
  send: () => {},
  connected: false,
  subscribe: () => {},
  unsubscribe: () => {},
});

export function WSProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxRetries = 5;
  const [retryCount, setRetryCount] = useState(0);
  const { toast } = useToast();
  const { user } = useUser();

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const initialDelay = 1000; // Start with 1 second delay

    const connect = () => {
      if (!user) {
        console.log('No user logged in, skipping WebSocket connection');
        return;
      }

      try {
        // Get the current window location
        const currentLocation = window.location;

        // Determine WebSocket protocol based on page protocol
        const wsProtocol = currentLocation.protocol === 'https:' ? 'wss:' : 'ws:';

        // Use the same host as the page
        const wsHost = currentLocation.host;

        // Construct the WebSocket URL with explicit protocol and host
        const wsUrl = window.location.protocol === 'https:' 
          ? `wss://${window.location.host}/ws`
          : `ws://${window.location.host}/ws`;

        console.log(`Attempting WebSocket connection to: ${wsUrl}`);

        // Close existing socket if any
        if (socket?.readyState === WebSocket.OPEN) {
          console.log('Closing existing WebSocket connection');
          socket.close();
        }

        const ws = new WebSocket(wsUrl);
        let connectionTimeout: NodeJS.Timeout;
        let heartbeatInterval: NodeJS.Timeout | undefined;
        const messageQueue: WSMessage[] = [];

        // Set connection timeout
        connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket connection timeout, closing socket');
            ws.close(1000, "Connection timeout");
          }
        }, 10000);

        ws.onopen = () => {
          console.log('WebSocket connection established successfully');
          clearTimeout(connectionTimeout);

          // Set up heartbeat
          heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);

          // Send any queued messages
          while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (msg) ws.send(JSON.stringify(msg));
          }
          clearTimeout(connectionTimeout);
          setConnected(true);
          reconnectAttempts = 0;
          setSocket(ws);

          // Send initial ping to verify connection
          ws.send(JSON.stringify({ type: 'ping' }));
        };

        ws.onclose = (event) => {
          console.log(`WebSocket closed - Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
          clearTimeout(connectionTimeout);
          setConnected(false);
          setSocket(null);

          // Don't reconnect on normal closure
          if (event.code === 1000 || event.code === 1001) {
            console.log('Clean WebSocket closure, not attempting reconnect');
            return;
          }

          // Don't reconnect if user is not logged in
          if (!user) {
            console.log('User not logged in, skipping reconnection');
            return;
          }

          // Implement more stable reconnection logic
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(initialDelay * Math.pow(1.5, reconnectAttempts), 15000);
            console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`);

            reconnectTimeout = setTimeout(() => {
              if (!connected) {
                reconnectAttempts++;
                connect();
              }
            }, delay);
          } else {
            console.log('Max reconnection attempts reached');
            toast({
              variant: "destructive",
              description: "Unable to connect to chat server. Please refresh the page.",
              duration: 5000,
            });
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error occurred:', error);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);

            if (data.type === 'pong') {
              console.log('Received pong response, connection confirmed');
              return;
            }

            if (data.type === 'connected') {
              console.log('Connection confirmed with userId:', data.userId);
              return;
            }

            if (data.type === 'message' && data.message) {
              setMessages((prev) => {
                if (prev.some(msg => msg.id === data.message.id)) {
                  return prev;
                }
                return [...prev, data.message];
              });
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };

      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Component unmounting");
        setSocket(null);
      }
    };
  }, [toast, user, socket]);

  const send = (data: WSMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.log('Connection not ready, queueing message');
      messageQueue.push(data);
      return;
    }

    try {
      socket.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      messageQueue.push(data);
      toast({
        variant: "destructive",
        description: "Message will be sent when connection is restored.",
        duration: 3000,
      });
    }
  };

  const subscribe = (channelId: string) => {
    if (channelId) {
      console.log('Subscribing to channel:', channelId);
      send({ type: 'subscribe', channelId });
    }
  };

  const unsubscribe = (channelId: string) => {
    if (channelId) {
      console.log('Unsubscribing from channel:', channelId);
      send({ type: 'unsubscribe', channelId });
    }
  };

  return (
    <WSContext.Provider value={{ messages, send, connected, subscribe, unsubscribe }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWS() {
  const context = useContext(WSContext);
  if (context === undefined) {
    throw new Error('useWS must be used within a WSProvider');
  }
  return context;
}

export default WSContext;