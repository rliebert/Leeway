import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Message, WSMessage } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { debugLogger } from "./debug";
import { queryClient } from "@/lib/queryClient";
import { useDebouncedCallback } from "use-debounce";

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

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 15000;
const CONNECTION_TIMEOUT = 10000;

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
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();
  const { user, isLoading } = useUser();

  useEffect(() => {
    debugEnabled ? debugLogger.enable() : debugLogger.disable();
  }, [debugEnabled]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  }, []);

  const clearHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = undefined;
    }
  }, []);

  const connect = useDebouncedCallback(async () => {
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
      let connectionTimeoutId = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          debugLogger.error("WebSocket connection timeout");
          ws.close();
          setError("Connection timeout");
        }
      }, CONNECTION_TIMEOUT);

      ws.onopen = () => {
        debugLogger.info("WebSocket connection established");
        clearTimeout(connectionTimeoutId);
        reconnectAttempts.current = 0;

        // Set up heartbeat
        clearHeartbeatInterval();
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_INTERVAL);

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
      };

      ws.onclose = (event) => {
        debugLogger.info(`WebSocket closed with code: ${event.code}`);
        clearTimeout(connectionTimeoutId);
        clearHeartbeatInterval();
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
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts.current),
            MAX_RECONNECT_DELAY
          );
          debugLogger.info(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1})`);
          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
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
  }, 300); // 300ms debounce

  // Connect when user is available
  useEffect(() => {
    if (user && !isLoading && shouldReconnect) {
      connect();
    }

    return () => {
      clearReconnectTimeout();
      clearHeartbeatInterval();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Component unmounting");
      }
    };
  }, [user, isLoading, shouldReconnect, connect, socket, clearReconnectTimeout, clearHeartbeatInterval]);

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
    if (!channelId) return;
    debugLogger.info("Subscribing to channel:", channelId);
    setMessages([]); // Clear previous messages
    send({ type: "subscribe", channelId });
  }, [send]);

  const unsubscribe = useCallback((channelId: string) => {
    if (!channelId) return;
    debugLogger.info("Unsubscribing from channel:", channelId);
    send({ type: "unsubscribe", channelId });
  }, [send]);

  const toggleDebug = useCallback(() => {
    const newState = !debugEnabled;
    setDebugEnabled(newState);
    localStorage.setItem("debug_mode", String(newState));
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