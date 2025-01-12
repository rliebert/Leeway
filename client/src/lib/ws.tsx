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

    const connect = () => {
      if (!user) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const websocket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      websocket.onopen = () => {
        setConnected(true);
        toast({
          description: "Connected to chat server",
          duration: 3000,
        });
      };

      websocket.onclose = (event) => {
        setConnected(false);
        const message = event.code === 1000 
          ? "Disconnected from chat server"
          : "Connection lost. Reconnecting...";

        toast({
          variant: "destructive",
          description: message,
          duration: 3000,
        });

        // Attempt to reconnect after 5 seconds
        reconnectTimeout = setTimeout(() => {
          connect();
        }, 5000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        toast({
          variant: "destructive",
          description: "Connection error. Trying to reconnect...",
          duration: 3000,
        });
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'message':
              if (data.message) {
                setMessages((prev) => {
                  // Avoid duplicate messages
                  const exists = prev.some(msg => msg.id === data.message.id);
                  if (exists) return prev;
                  return [...prev, data.message];
                });
              }
              break;
            case 'typing':
              // Handle typing indicators
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      setSocket(websocket);
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
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected. Message not sent:', data);
      toast({
        variant: "destructive",
        description: "Failed to send message. Please try again.",
        duration: 3000,
      });
    }
  };

  const subscribe = (channelId: string) => {
    send({ type: 'subscribe', channelId });
  };

  const unsubscribe = (channelId: string) => {
    send({ type: 'unsubscribe', channelId });
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