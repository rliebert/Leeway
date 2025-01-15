import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useUser } from "@/hooks/use-user";
import { debugLogger } from "@/lib/debug";
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

const optimisticMessages = new Set<string>();

export function WSProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useUser();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messageBuffer = useRef<WSMessage[]>([]);
  const [connecting, setConnecting] = useState(false);

  const send = useCallback((data: WSMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      messageBuffer.current.push(data);
      return;
    }

    // For new messages, add them to the state immediately
    if (data.type === 'message') {
      const tempId = crypto.randomUUID();
      optimisticMessages.add(tempId);
      
      const optimisticMessage = {
        id: tempId,
        content: data.content!,
        channel_id: data.channelId!,
        created_at: new Date().toISOString(),
        user_id: user?.id,
        author: {
          username: user?.username,
          avatar_url: user?.avatar_url
        }
      };

      setMessages(prev => [...prev, optimisticMessage]);
    }

    socket.send(JSON.stringify(data));
  }, [socket, user]);

  const connect = useCallback(() => {
    if (!user || isLoading || socket) return; // Prevent multiple connections

    setConnecting(true); // Set connecting state before attempting connection
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseDelay = 1000;

    ws.onopen = () => {
      console.log('WebSocket connection opened');
      setConnecting(false); // Clear connecting state
      setConnected(true);
      setSocket(ws);
      reconnectAttempts = 0; // Reset attempts on successful connection
      while (messageBuffer.current.length > 0) {
        const msg = messageBuffer.current.shift();
        if (msg) ws.send(JSON.stringify(msg));
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setConnected(false);
      setSocket(null);

      // Only attempt to reconnect if we haven't exceeded max attempts
      if (reconnectAttempts < maxReconnectAttempts) {
        setConnecting(true); // Show connecting state during reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
        setTimeout(() => {
          if (!socket) { // Ensure no existing socket before reconnecting
            reconnectAttempts++;
            connect();
          }
        }, delay);
      } else {
        setConnecting(false); // Clear connecting state
        console.error('Max reconnection attempts reached');
        toast({
          variant: "destructive",
          description: "Connection lost. Please refresh the page."
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Don't close the connection here, let onclose handle reconnection
    };

    ws.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'message':
          setMessages(prev => {
            // Clean up any optimistic messages with matching content
            const filtered = prev.filter(msg => {
              if (optimisticMessages.has(msg.id)) {
                const isMatch = 
                  msg.content === data.message.content && 
                  msg.channel_id === data.message.channel_id && 
                  msg.user_id === data.message.user_id;
                
                if (isMatch) {
                  optimisticMessages.delete(msg.id);
                  return false;
                }
              }
              return true;
            });
            
            return [...filtered, data.message];
          });
          break;
        case 'message_edited':
          console.log('Editing message:', data.message);
          setMessages(prev => prev.map(msg => 
            msg.id === data.message.id ? data.message : msg
          ));
          break;
        case 'message_deleted':
          console.log('Deleting message:', data.messageId);
          setMessages(prev => prev.filter(msg => {
            // Remove both the real message and any optimistic versions
            if (msg.id === data.messageId) {
              optimisticMessages.delete(msg.id);
              return false;
            }
            return true;
          }));
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
      connecting,
      messages,
      subscribe: (channelId: string) => send({ type: 'subscribe', channelId }),
      unsubscribe: (channelId: string) => send({ type: 'unsubscribe', channelId }),
      send,
      connectionQuality: connecting ? 3 : connected ? 5 : 0,
    }}>
      {children}
    </WSContext.Provider>
  );
}

export const useWS = () => useContext(WSContext);