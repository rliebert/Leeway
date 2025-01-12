import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Message } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface WSContextType {
  messages: Message[];
  send: (data: WSMessage) => void;
  connected: boolean;
}

interface WSMessage {
  type: string;
  message?: Message;
  channelId?: string;
  content?: string;
  userId?: string;
  parentMessageId?: string;
}

const WSContext = createContext<WSContextType>({
  messages: [],
  send: () => {},
  connected: false,
});

export function WSProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const websocket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      websocket.onopen = () => {
        setConnected(true);
        toast({
          description: "Connected to chat server",
          duration: 3000,
        });
      };

      websocket.onclose = () => {
        setConnected(false);
        toast({
          variant: "destructive",
          description: "Disconnected from chat server. Reconnecting...",
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
          const data = JSON.parse(event.data) as WSMessage;
          switch (data.type) {
            case 'message':
              if (data.message) {
                setMessages((prev) => {
                  const exists = prev.some(msg => msg.id === data.message!.id);
                  if (exists) return prev;
                  return [...prev, data.message!];
                });
              }
              break;
            case 'typing':
              // Handle typing indicators
              break;
            case 'presence':
              // Handle user presence updates
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
        socket.close();
      }
    };
  }, [toast]);

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

  return (
    <WSContext.Provider value={{ messages, send, connected }}>
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