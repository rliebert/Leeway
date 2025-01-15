import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useUser } from "@/hooks/use-user";
import { debugLogger } from "@/lib/debug";
import { useDebouncedCallback } from "use-debounce";
import type { Message, WSContextType, WSMessage } from "@/lib/types";

// Constants
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const CONNECTION_TIMEOUT = 5000;
const CONNECTION_HEALTH_CHECK_INTERVAL = 15000;
const MAX_PING_HISTORY = 10;

const WSContext = createContext<WSContextType>({
  connected: false,
  messages: [],
  subscribe: () => {},
  unsubscribe: () => {},
  send: () => {},
  connectionQuality: 5,
});

export function WSProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useUser();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messageBuffer = useRef<WSMessage[]>([]);

  const send = useCallback((data: WSMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      messageBuffer.current.push(data);
      return;
    }
    socket.send(JSON.stringify(data));
  }, [socket]);

  const connect = useCallback(() => {
    if (!user || isLoading || socket) return; // Prevent multiple connections

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connection opened');
      setConnected(true);
      setSocket(ws);
      while (messageBuffer.current.length > 0) {
        const msg = messageBuffer.current.shift();
        if (msg) ws.send(JSON.stringify(msg));
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setConnected(false);
      setSocket(null);
      setTimeout(() => {
        if (!socket) { // Ensure no existing socket before reconnecting
          connect();
        }
      }, 1000); // Simple reconnect
    };

    ws.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'message':
          console.log('Adding message:', data.message);
          setMessages(prev => [...prev, data.message]);
          break;
        case 'message_edited':
          console.log('Editing message:', data.message);
          setMessages(prev => prev.map(msg => 
            msg.id === data.message.id ? data.message : msg
          ));
          break;
        case 'message_deleted':
          console.log('Deleting message:', data.messageId);
          setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
          break;
      }
    };
  }, [user, isLoading, socket]);

  useEffect(() => {
    if (user && !isLoading) {
      console.log('Attempting to connect WebSocket');
      connect();
    }
    return () => {
      if (socket) {
        console.log('Closing WebSocket connection');
        socket.close();
      }
    };
  }, [user, isLoading]);

  const sendMessage = (channelId: string, content: string, parentId?: string) => {
    send({
      type: 'message',
      channelId,
      content,
      parentId,
    });
  };

  const editMessage = (channelId: string, messageId: string, content: string) => {
    send({
      type: 'message_edited',
      channelId,
      messageId,
      content,
    });
  };

  return (
    <WSContext.Provider value={{
      connected,
      messages,
      subscribe: (channelId: string) => send({ type: 'subscribe', channelId }),
      unsubscribe: (channelId: string) => send({ type: 'unsubscribe', channelId }),
      send,
      connectionQuality: connected ? 5 : 0,
    }}>
      {children}
    </WSContext.Provider>
  );
}

export const useWS = () => useContext(WSContext);