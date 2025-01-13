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
  type: "subscribe" | "unsubscribe" | "message" | "typing" | "ping" | "message_deleted";
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: {
    url: string;
    originalName: string;
    mimetype: string;
    size: number;
  }[];
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
        const wsHost = loc.host;
        const wsPath = "/ws";
        const wsUrl = `${wsProtocol}//${wsHost}${wsPath}`;

        console.log(`Attempting WebSocket connection to: ${wsUrl}`);

        if (socket?.readyState === WebSocket.OPEN) {
          console.log("Closing existing WebSocket connection");
          socket.close();
        }

        const ws = new WebSocket(wsUrl);

        ws.addEventListener("error", (error) => {
          console.error("WebSocket Error:", error);
          setError("Connection error. Please check console for details.");
        });

        let connectionTimeout: NodeJS.Timeout;
        connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.log("WebSocket connection timeout, closing socket");
            ws.close(1000, "Connection timeout");
            setError("Connection timeout");
          }
        }, 10000);

        ws.onopen = () => {
          console.log("WebSocket connection established successfully");
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
          console.log(
            `WebSocket closed - Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`,
          );
          clearTimeout(connectionTimeout);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          setConnected(false);
          setSocket(null);

          if (event.code === 1000 || event.code === 1001) {
            console.log("Clean WebSocket closure, not attempting reconnect");
            return;
          }

          if (!user) {
            console.log("User not logged in, skipping reconnection");
            return;
          }

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(
              initialDelay * Math.pow(1.5, reconnectAttempts),
              15000,
            );
            console.log(
              `Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`,
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
              description:
                "Unable to connect to chat server. Please refresh the page.",
              duration: 5000,
            });
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error occurred:", error);
          setError("Connection error occurred");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("WebSocket message received:", data);

            if (data.type === "pong") {
              console.log("Received pong response, connection confirmed");
              return;
            }

            if (data.type === "connected") {
              console.log("Connection confirmed with userId:", data.userId);
              return;
            }

            if (data.type === "message" && data.message) {
              const messageWithAttachments = {
                ...data.message,
                attachments: Array.isArray(data.message.attachments)
                  ? data.message.attachments.map((attachment: any) => ({
                      url: attachment.file_url || attachment.url,  // Handle both formats
                      originalName: attachment.file_name || attachment.originalName,
                      mimetype: attachment.file_type || attachment.mimetype,
                      size: attachment.file_size || attachment.size,
                    }))
                  : [],
              };

              setMessages((prev) => {
                const existingMsgIndex = prev.findIndex(msg => msg.id === messageWithAttachments.id);
                if (existingMsgIndex > -1) {
                  const newMessages = [...prev];
                  newMessages[existingMsgIndex] = messageWithAttachments;
                  return newMessages;
                }
                return [...prev, messageWithAttachments];
              });
            }

            if (data.type === "message_deleted") {
              console.log('Handling message deletion:', data);
              setMessages(prev => {
                // Create a new array with filtered messages
                const filtered = prev.filter(msg => {
                  const isNotDeleted = msg.id !== data.messageId;
                  const isNotReply = msg.parent_id !== data.messageId;
                  return isNotDeleted && isNotReply;
                });
                console.log('Messages after deletion:', filtered);
                return filtered;
              });
            }
          } catch (error) {
            console.error("Error processing WebSocket message:", error);
            setError("Error processing message");
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
      socket.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
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