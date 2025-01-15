import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Message, WSMessage } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { debugLogger } from "./debug";
import { queryClient } from "@/lib/queryClient";

interface WSContextType {
  messages: WSMessage[];
  setMessages: React.Dispatch<React.SetStateAction<WSMessage[]>>;
  send: (data: WSMessage) => void;
  connected: boolean;
  error: string | null;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
  toggleDebug: () => void;
  isDebugEnabled: boolean;
}

const WSContext = createContext<WSContextType>({
  messages: [],
  setMessages: () => {},
  send: () => {},
  connected: false,
  error: null,
  subscribe: () => {},
  unsubscribe: () => {},
  toggleDebug: () => {},
  isDebugEnabled: false,
});

export function WSProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageQueue, setMessageQueue] = useState<WSMessage[]>([]);
  const [shouldReconnect, setShouldReconnect] = useState(true);
  const [debugEnabled, setDebugEnabled] = useState(() => {
    return localStorage.getItem("debug_mode") === "true";
  });
  const { toast } = useToast();
  const { user, isLoading } = useUser();

  useEffect(() => {
    debugEnabled ? debugLogger.enable() : debugLogger.disable();
  }, [debugEnabled]);

  const connect = useCallback(async () => {
    if (!user || isLoading) {
      debugLogger.info("No user logged in or still loading, skipping WebSocket connection");
      return;
    }

    try {
      const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

      if (socket?.readyState === WebSocket.OPEN) {
        debugLogger.debug("Closing existing WebSocket connection");
        socket.close();
      }

      const ws = new WebSocket(wsUrl);
      let connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          debugLogger.error("WebSocket connection timeout");
          ws.close();
          setError("Connection timeout");
        }
      }, 10000);

      ws.onopen = () => {
        debugLogger.info("WebSocket connection established");
        clearTimeout(connectionTimeout);

        // Set up heartbeat
        const heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);

        // Process queued messages
        messageQueue.forEach(msg => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        });
        setMessageQueue([]); // Clear queue after processing

        setConnected(true);
        setError(null);
        setSocket(ws);

        // Clean up heartbeat on unmount
        return () => clearInterval(heartbeatInterval);
      };

      ws.onclose = (event) => {
        debugLogger.info(`WebSocket closed with code: ${event.code}`);
        setConnected(false);
        setSocket(null);

        if (event.code === 1008) {
          debugLogger.error("Authentication failed. Please refresh the page.");
          toast({
            variant: "destructive",
            description: "Authentication failed. Please refresh the page.",
            duration: 5000,
          });
          setShouldReconnect(false);
          return;
        }

        if (shouldReconnect && user) {
          const delay = 3000;
          debugLogger.info(`Reconnecting in ${delay}ms...`);
          setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        debugLogger.error("WebSocket error:", error);
        setError("Connection error occurred");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSMessage;
          debugLogger.debug("Received message", data);

          if (data.type === "pong" || data.type === "connected") {
            debugLogger.debug(`Received ${data.type} message`);
            return;
          }

          setMessages(prev => {
            if (data.type === 'message_deleted' && data.messageId) {
              // Remove deleted message from the list
              return prev.filter(msg => {
                if (msg.type === 'message' && msg.message) {
                  return msg.message.id !== data.messageId;
                }
                return true;
              });
            }

            if (data.type === 'message' || data.type === 'message_edited') {
              // Update query cache for real-time updates
              if (data.message?.channel_id) {
                queryClient.setQueryData(
                  [`/api/channels/${data.message.channel_id}/messages`],
                  (oldData: Message[] | undefined) => {
                    if (!oldData || !data.message) return oldData;
                    const newMessages = oldData.filter(m => m.id !== data.message?.id);
                    return [...newMessages, data.message];
                  }
                );
              }
              return [...prev, data];
            }

            return prev;
          });

        } catch (error) {
          debugLogger.error("Error processing WebSocket message:", error);
          setError("Error processing message");
        }
      };
    } catch (error) {
      debugLogger.error("Error creating WebSocket connection:", error);
      setError("Failed to create connection");
    }
  }, [user, isLoading, messageQueue, socket, shouldReconnect, toast]);

  // Connect when user is available
  useEffect(() => {
    if (user && !isLoading && shouldReconnect) {
      connect();
    }
    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Component unmounting");
      }
    };
  }, [user, isLoading, shouldReconnect, connect, socket]);

  const send = useCallback((data: WSMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      debugLogger.warn("Socket not ready, queueing message");
      setMessageQueue(prev => [...prev, data]);
      return;
    }

    try {
      debugLogger.debug("Sending WebSocket message:", data);
      socket.send(JSON.stringify(data));
    } catch (error) {
      debugLogger.error("Error sending message:", error);
      setMessageQueue(prev => [...prev, data]);
      toast({
        variant: "destructive",
        description: "Message will be sent when connection is restored.",
        duration: 3000,
      });
    }
  }, [socket, toast]);

  const subscribe = useCallback((channelId: string) => {
    if (channelId) {
      debugLogger.info("Subscribing to channel:", channelId);
      setMessages([]); // Clear previous messages
      send({ type: "subscribe", channelId });
    }
  }, [send]);

  const unsubscribe = useCallback((channelId: string) => {
    if (channelId) {
      debugLogger.info("Unsubscribing from channel:", channelId);
      send({ type: "unsubscribe", channelId });
    }
  }, [send]);

  const toggleDebug = useCallback(() => {
    const newState = !debugEnabled;
    setDebugEnabled(newState);
    send({ type: "debug_mode", enabled: newState });

    toast({
      description: newState
        ? "Debug logging enabled - Check browser console (F12) for detailed logs"
        : "Debug logging disabled - Console logs will no longer show detailed information",
      duration: 3000,
    });
  }, [debugEnabled, send, toast]);

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
        toggleDebug,
        isDebugEnabled: debugEnabled,
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