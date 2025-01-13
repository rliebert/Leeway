import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Message } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface WSContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  send: (data: WSMessage) => void;
  connected: boolean;
  error: string | null;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
}

interface WSMessage {
  type: "subscribe" | "unsubscribe" | "message" | "typing" | "ping" | "message_deleted" | "message_edited";
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: any[];
}

const WSContext = createContext<WSContextType>({
  messages: [],
  setMessages: () => {},
  send: () => {},
  connected: false,
  error: null,
  subscribe: () => {},
  unsubscribe: () => {},
});

export function WSProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageQueue] = useState<WSMessage[]>([]);
  const { toast } = useToast();
  const { user } = useUser();

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | undefined;
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const initialDelay = 1000;

    const connect = () => {
      if (!user) {
        console.log("No user logged in, skipping WebSocket connection");
        return;
      }

      try {
        const loc = window.location;
        const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${loc.host}/ws`;

        console.log(`Attempting WebSocket connection to: ${wsUrl}`);

        if (socket?.readyState === WebSocket.OPEN) {
          console.log("Closing existing WebSocket connection");
          socket.close();
        }

        const ws = new WebSocket(wsUrl);

        let connectionTimeout: NodeJS.Timeout;
        connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.log("WebSocket connection timeout, closing socket");
            ws.close(1000, "Connection timeout");
            setError("Connection timeout");
          }
        }, 10000);

        ws.onopen = () => {
          console.log("WebSocket connection established");
          clearTimeout(connectionTimeout);

          heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 15000);

          while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (msg) ws.send(JSON.stringify(msg));
          }

          setConnected(true);
          setError(null);
          reconnectAttempts = 0;
          setSocket(ws);

          ws.send(JSON.stringify({ type: "ping" }));
        };

        ws.onclose = (event) => {
          console.log(`WebSocket closed with code: ${event.code}`);
          clearTimeout(connectionTimeout);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          setConnected(false);
          setSocket(null);

          if (event.code === 1000 || event.code === 1001) {
            console.log("Clean WebSocket closure");
            return;
          }

          if (!user) {
            console.log("User not logged in, skipping reconnection");
            return;
          }

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(
              initialDelay * Math.pow(1.5, reconnectAttempts),
              15000
            );
            console.log(
              `Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`
            );

            reconnectTimeout = setTimeout(() => {
              if (!connected) {
                reconnectAttempts++;
                connect();
              }
            }, delay);
          } else {
            console.log("Max reconnection attempts reached");
            setError("Connection lost. Please refresh the page.");
            toast({
              variant: "destructive",
              description: "Unable to connect to chat server. Please refresh the page.",
              duration: 5000,
            });
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setError("Connection error occurred");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);

            if (data.type === "pong" || data.type === "connected") {
              return;
            }

            const normalizeMessage = (message: any) => {
              if (!message) {
                console.warn('Attempted to normalize undefined message');
                return null;
              }

              console.log('Original message:', message);
              // Ensure consistent field names and types between initial load and updates
              const normalized = {
                ...message,
                id: message.id?.toString(),
                channel_id: message.channel_id?.toString(),
                user_id: message.user_id?.toString(),
                content: message.content || '',
                created_at: message.created_at || new Date().toISOString(),
                updated_at: message.updated_at || message.created_at || new Date().toISOString(),
                parent_id: message.parent_id?.toString() || null,
                author: message.author || null,
                attachments: Array.isArray(message.attachments)
                  ? message.attachments.map((attachment: any) => ({
                      id: attachment.id?.toString(),
                      url: attachment.file_url || attachment.url || '',
                      originalName: attachment.file_name || attachment.originalName || '',
                      mimetype: attachment.file_type || attachment.mimetype || '',
                      file_size: Number(attachment.file_size) || 0,
                    }))
                  : []
              };

              console.log('Normalized message:', normalized);
              return normalized;
            };

            const updateMessageInState = (messageData: any) => {
              const normalizedMessage = normalizeMessage(messageData);
              if (!normalizedMessage) {
                console.warn('Failed to normalize message:', messageData);
                return;
              }

              console.log('Updating message state with:', normalizedMessage);

              setMessages((prevMessages) => {
                // Find existing message by ID (ensure string comparison)
                const existingIndex = prevMessages.findIndex(
                  (msg) => msg.id?.toString() === normalizedMessage.id?.toString()
                );
                console.log('Existing message index:', existingIndex);

                if (existingIndex > -1) {
                  // Update existing message while preserving fields
                  const updatedMessages = [...prevMessages];
                  const existingMessage = prevMessages[existingIndex];

                  updatedMessages[existingIndex] = {
                    ...existingMessage,  // Keep existing fields
                    ...normalizedMessage, // Apply updates
                    // Ensure critical fields are present and normalized
                    id: normalizedMessage.id,
                    content: normalizedMessage.content,
                    updated_at: new Date().toISOString(),
                    author: normalizedMessage.author || existingMessage.author,
                    attachments: normalizedMessage.attachments || existingMessage.attachments
                  };

                  console.log('Updated message:', updatedMessages[existingIndex]);
                  return updatedMessages;
                }

                // Add new message
                return [...prevMessages, normalizedMessage];
              });
            };

            switch (data.type) {
              case "message":
                if (data.message) {
                  console.log('Processing new message:', data.message);
                  updateMessageInState(data.message);
                }
                break;

              case "message_edited":
                if (data.message) {
                  console.log('Processing edited message:', data.message);
                  updateMessageInState(data.message);
                }
                break;

              case "message_deleted":
                console.log('Processing message deletion:', data);
                setMessages((prevMessages) =>
                  prevMessages.filter(
                    (msg) => 
                      msg.id?.toString() !== data.messageId?.toString() && 
                      msg.parent_id?.toString() !== data.messageId?.toString()
                  )
                );
                break;
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
            setError('Error processing message');
          }
        };
      } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        setError("Failed to create connection");
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Component unmounting");
        setSocket(null);
      }
    };
  }, [toast, user, messageQueue]);

  const send = (data: WSMessage) => {
    if (!socket) {
      console.log("No socket connection, queueing message");
      messageQueue.push(data);
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      console.log("Socket still connecting, queueing message");
      messageQueue.push(data);
      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      console.log("Socket not open, reconnecting");
      messageQueue.push(data);
      socket.close();
      return;
    }

    try {
      console.log('Sending WebSocket message:', data);
      socket.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending message:", error);
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
      console.log("Subscribing to channel:", channelId);
      setMessages([]);
      send({ type: "subscribe", channelId });
    }
  };

  const unsubscribe = (channelId: string) => {
    if (channelId) {
      console.log("Unsubscribing from channel:", channelId);
      send({ type: "unsubscribe", channelId });
    }
  };

  return (
    <WSContext.Provider
      value={{
        messages,
        setMessages,
        send,
        connected,
        error,
        subscribe,
        unsubscribe,
      }}
    >
      {children}
    </WSContext.Provider>
  );
}

export function useWS() {
  const context = useContext(WSContext);
  if (context === undefined) {
    throw new Error("useWS must be used within a WSProvider");
  }
  return context;
}

export default WSContext;