import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Message } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface WSContextType {
  messages: Message[];
  send: (data: WSMessage) => void;
  connected: boolean;
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

        // Construct the WebSocket URL
        const wsUrl = `${wsProtocol}//${wsHost}/ws`;

        console.log(`Attempting WebSocket connection to: ${wsUrl}`);

        // Close existing socket if any
        if (socket?.readyState === WebSocket.OPEN) {
          console.log('Closing existing WebSocket connection');
          socket.close();
        }

        const ws = new WebSocket(wsUrl);
        let connectionTimeout: NodeJS.Timeout;

        // Set connection timeout
        connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket connection timeout, closing socket');
            ws.close();
          }
        }, 5000);

        ws.onopen = () => {
          console.log('WebSocket connection established successfully');
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

          // Implement exponential backoff for reconnection
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(initialDelay * Math.pow(2, reconnectAttempts), 10000);
            console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`);

            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connect();
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
      if (socket) {
        socket.close(1000, "Component unmounting");
      }
    };
  }, [toast, user, socket]);

  const send = (data: WSMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected, message not sent:', data);
      return;
    }

    try {
      socket.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      toast({
        variant: "destructive",
        description: "Failed to send message. Please try again.",
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