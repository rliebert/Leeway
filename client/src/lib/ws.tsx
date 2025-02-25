import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useUser } from "@/hooks/use-user";
import { debugLogger } from "@/lib/debug";
import type { Message, WSContextType, WSMessage } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

// Constants
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const CONNECTION_TIMEOUT = 5000;
const CONNECTION_HEALTH_CHECK_INTERVAL = 15000;
const MAX_PING_HISTORY = 10;

const WSContext = createContext<WSContextType>({
  connected: false,
  connecting: false,
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

    // For new messages, track optimistic message with a tempId
    if (data.type === 'message') {
      const tempId = crypto.randomUUID();
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] Generated new tempId for optimistic message:`, tempId);
      optimisticMessages.add(tempId);
      
      const optimisticMessage: Message = {
        id: tempId,
        content: data.content!,
        channel_id: data.channelId!,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: user?.id || '',
        parent_id: null,
        pinned_by: null,
        pinned_at: null,
        author: {
          username: user?.username ?? '',
          avatar_url: user?.avatar_url ?? ''
        },
        attachments: data.attachments || [],
        tempId
      };

      setMessages(prev => [...prev, optimisticMessage]);
      data.tempId = tempId; // Add tempId to outgoing message
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
          const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] Received message from server:`, {
            messageId: data.message?.id,
            tempId: data.tempId,
            content: data.message?.content,
            isOptimistic: data.message?.isOptimistic
          });
          setMessages(prev => {
            // Only look for tempId match, ignore message.id
            const hasOptimistic = prev.some(msg => msg.tempId === data.tempId);
            const optimisticMsg = prev.find(msg => msg.tempId === data.tempId);
            console.log('Optimistic message check:', {
              tempId: data.tempId,
              found: hasOptimistic,
              optimisticContent: optimisticMsg?.content,
              hasAttachments: !!data.message?.attachments?.length,
              existingMessages: prev.map(m => ({ id: m.id, tempId: m.tempId, content: m.content }))
            });
            
            if (hasOptimistic) {
              optimisticMessages.delete(data.tempId);
              // Replace optimistic with real message, preserving tempId and merging attachments
              return prev.map(msg => 
                msg.tempId === data.tempId ? 
                { 
                  ...data.message, 
                  tempId: data.tempId,
                  attachments: data.message.attachments || msg.attachments
                } : 
                msg
              );
            }
            // No optimistic message found, add as new with attachments
            return [...prev, {
              ...data.message,
              attachments: data.message.attachments || []
            }];
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