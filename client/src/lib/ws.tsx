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
        // Use same protocol and host as the current page
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;
        console.log('Connecting to WebSocket:', wsUrl);

        // Create new WebSocket connection
        const ws = new WebSocket(wsUrl);

        // Set up event handlers
        ws.onopen = () => {
          console.log('WebSocket connection established');
          setConnected(true);
          reconnectAttempts = 0;
          toast({
            description: "Connected to chat server",
            duration: 3000,
          });
        };

        ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event);
          setConnected(false);
          setSocket(null);

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            toast({
              variant: "destructive",
              description: "Connection lost. Reconnecting...",
              duration: 3000,
            });

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
          console.error('WebSocket Error:', error);
          toast({
            variant: "destructive",
            description: "Connection error. Trying to reconnect...",
            duration: 3000,
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);

            if (data.type === 'message' && data.message) {
              setMessages((prev) => {
                if (prev.some(msg => msg.id === data.message.id)) {
                  return prev;
                }
                return [...prev, data.message];
              });
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        setSocket(ws);
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            connect();
          }, 2000 * Math.pow(2, reconnectAttempts));
        }
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.close(1000, "Component unmounting");
      }
    };
  }, [toast, user]);

  const send = (data: WSMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected. Message not sent:', data);
      toast({
        variant: "destructive",
        description: "Failed to send message. Please try again.",
        duration: 3000,
      });
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
      send({ type: 'subscribe', channelId });
    }
  };

  const unsubscribe = (channelId: string) => {
    if (channelId) {
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