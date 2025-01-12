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
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing';
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

    const connect = () => {
      if (!user) {
        console.log('No user logged in, skipping WebSocket connection');
        return;
      }

      try {
        // Construct WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        console.log('Connecting to WebSocket:', wsUrl);

        // Create WebSocket connection
        const ws = new WebSocket(wsUrl);
        console.log('WebSocket connection initialized');

        ws.onopen = () => {
          console.log('WebSocket connection opened');
          setConnected(true);
          reconnectAttempts = 0;
        };

        ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          setConnected(false);
          setSocket(null);

          // Don't attempt to reconnect if the closure was clean
          if (event.code === 1000 || event.code === 1001) {
            console.log('Clean WebSocket closure, not attempting to reconnect');
            return;
          }

          // Handle reconnection
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`);

            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connect();
            }, delay);
          } else {
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

            if (data.type === 'connected') {
              console.log('Connection confirmed with userId:', data.userId);
              return;
            }

            if (data.type === 'message' && data.message) {
              setMessages((prev) => {
                // Prevent duplicate messages
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

        setSocket(ws);
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
  }, [toast, user]);

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