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
  send: (data: WSMessage) => void;
  connected: boolean;
  error: string | null;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
}

interface WSMessage {
  type: "subscribe" | "unsubscribe" | "message" | "typing" | "ping";
  channelId?: string;
  content?: string;
  parentId?: string;
  attachments?: string[];
}

const WSContext = createContext<WSContextType>({
  messages: [],
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
    const initialDelay = 1000; // Start with 1 second delay

    const connect = () => {
      if (!user) {
        console.log("No user logged in, skipping WebSocket connection");
        return;
      }

      try {
        // Get the current location
        const loc = window.location;

        // Determine WebSocket protocol and host
        const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
        const wsHost = loc.host;
        const wsPath = "/ws";

        // Construct WebSocket URL
        const wsUrl = `${wsProtocol}//${wsHost}${wsPath}`;

        console.log(`Attempting WebSocket connection to: ${wsUrl}`);

        // Close existing socket if any
        if (socket?.readyState === WebSocket.OPEN) {
          console.log("Closing existing WebSocket connection");
          socket.close();
        }

        const ws = new WebSocket(wsUrl);
        
        // Add error event listener for more detailed error logging
        ws.addEventListener('error', (error) => {
          console.error('WebSocket Error:', error);
          setError('Connection error. Please check console for details.');
        });
        let connectionTimeout: NodeJS.Timeout;

        // Set connection timeout
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

          // Set up heartbeat
          heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 15000);

          // Send any queued messages
          while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (msg) ws.send(JSON.stringify(msg));
          }

          setConnected(true);
          setError(null);
          reconnectAttempts = 0;
          setSocket(ws);

          // Send initial ping to verify connection
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

          // Don't reconnect on normal closure
          if (event.code === 1000 || event.code === 1001) {
            console.log("Clean WebSocket closure, not attempting reconnect");
            return;
          }

          // Don't reconnect if user is not logged in
          if (!user) {
            console.log("User not logged in, skipping reconnection");
            return;
          }

          // Implement exponential backoff for reconnection
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
              setMessages((prev) => {
                if (prev.some((msg) => msg.id === data.message.id)) {
                  return prev;
                }
                return [...prev, data.message];
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
      setMessages([]); // Clear existing messages
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
      value={{ messages, send, connected, error, subscribe, unsubscribe }}
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
