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
import { debugLogger } from './debug';

interface WSContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  send: (data: WSMessage) => void;
  connected: boolean;
  error: string | null;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
  toggleDebug: () => void;
  isDebugEnabled: boolean;
}

interface WSMessage {
  type: "subscribe" | "unsubscribe" | "message" | "typing" | "ping" | "message_deleted" | "message_edited" | "debug_mode";
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: any[];
  enabled?: boolean;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageQueue] = useState<WSMessage[]>([]);
  const [debugEnabled, setDebugEnabled] = useState(() => {
    // Check if debug mode was enabled in last session
    return localStorage.getItem('debug_mode') === 'true';
  });
  const { toast } = useToast();
  const { user } = useUser();

  // Initialize debug logger based on saved state
  useEffect(() => {
    if (debugEnabled) {
      debugLogger.enable();
    } else {
      debugLogger.disable();
    }
  }, [debugEnabled]);

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | undefined;
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const initialDelay = 1000;

    const connect = async () => {
      if (!user) {
        debugLogger.info("No user logged in, skipping WebSocket connection");
        return;
      }

      try {
        const loc = window.location;
        const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${loc.host}/ws`;
        
        // Add retry delay if there was a previous connection attempt
        if (socket?.readyState === WebSocket.CLOSED) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        debugLogger.debug(`Attempting WebSocket connection to: ${wsUrl}`);

        if (socket?.readyState === WebSocket.OPEN) {
          debugLogger.debug("Closing existing WebSocket connection");
          socket.close();
        }

        const ws = new WebSocket(wsUrl, ["chat"]);

        let connectionTimeout: NodeJS.Timeout;
        connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            debugLogger.error("WebSocket connection timeout, closing socket");
            ws.close(1000, "Connection timeout");
            setError("Connection timeout");
          }
        }, 10000);

        ws.onopen = () => {
          debugLogger.startGroup("WebSocket Connected");
          debugLogger.info("WebSocket connection established");
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
          debugLogger.endGroup();
        };

        ws.onclose = (event) => {
          debugLogger.info(`WebSocket closed with code: ${event.code}`);
          clearTimeout(connectionTimeout);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          setConnected(false);
          setSocket(null);

          if (event.code === 1000 || event.code === 1001) {
            debugLogger.info("Clean WebSocket closure");
            return;
          }

          if (!user) {
            debugLogger.info("User not logged in, skipping reconnection");
            return;
          }

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(
              initialDelay * Math.pow(1.5, reconnectAttempts),
              15000
            );
            debugLogger.info(
              `Scheduling reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts} in ${delay}ms`
            );

            reconnectTimeout = setTimeout(() => {
              if (!connected) {
                reconnectAttempts++;
                connect();
              }
            }, delay);
          } else {
            debugLogger.error("Max reconnection attempts reached");
            setError("Connection lost. Please refresh the page.");
            toast({
              variant: "destructive",
              description: "Unable to connect to chat server. Please refresh the page.",
              duration: 5000,
            });
          }
        };

        ws.onerror = (error) => {
          debugLogger.error("WebSocket error:", error);
          setError("Connection error occurred");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            debugLogger.startGroup(`WebSocket Message: ${data.type}`);
            debugLogger.debug('Received message', data);

            if (data.type === "pong" || data.type === "connected") {
              debugLogger.debug(`Received ${data.type} message`);
              debugLogger.endGroup();
              return;
            }

            const normalizeMessage = (message: any) => {
              if (!message) {
                debugLogger.error('Attempted to normalize undefined message');
                return null;
              }

              debugLogger.debug('Normalizing message input', message);
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
              debugLogger.debug('Normalized message output', normalized);
              return normalized;
            };

            const updateMessageInState = (messageData: any) => {
              const normalizedMessage = normalizeMessage(messageData);
              if (!normalizedMessage) {
                debugLogger.error('Failed to normalize message', messageData);
                return;
              }

              debugLogger.debug('Attempting to update message state with', normalizedMessage);

              setMessages((prevMessages) => {
                const existingIndex = prevMessages.findIndex(
                  (msg) => msg.id?.toString() === normalizedMessage.id?.toString()
                );
                debugLogger.debug('Found existing message at index', existingIndex);

                if (existingIndex > -1) {
                  const existingMessage = prevMessages[existingIndex];
                  debugLogger.debug('Existing message', existingMessage);

                  const updatedMessages = [...prevMessages];
                  updatedMessages[existingIndex] = {
                    ...normalizedMessage,
                    // Ensure we keep the message ID consistent
                    id: normalizedMessage.id,
                    // Preserve any fields that might not be in the update
                    author: normalizedMessage.author || existingMessage.author,
                    attachments: normalizedMessage.attachments || existingMessage.attachments,
                    // Force update timestamp
                    updated_at: new Date().toISOString()
                  };

                  debugLogger.debug('Updated message state', {
                    before: existingMessage,
                    after: updatedMessages[existingIndex]
                  });

                  return updatedMessages;
                }

                debugLogger.debug('No existing message found, adding new message');
                return [...prevMessages, normalizedMessage];
              });
            };

            switch (data.type) {
              case "message":
              case "message_edited":
                if (data.message) {
                  debugLogger.debug(`Processing ${data.type}`, data.message);
                  const normalizedMessage = normalizeMessage(data.message);
                  if (!normalizedMessage) {
                    debugLogger.error('Failed to normalize message', data.message);
                    return;
                  }

                  setMessages(prevMessages => {
                    const messageIndex = prevMessages.findIndex(msg => 
                      msg.id?.toString() === normalizedMessage.id?.toString()
                    );

                    if (messageIndex > -1) {
                      const updatedMessages = [...prevMessages];
                      updatedMessages[messageIndex] = {
                        ...normalizedMessage,
                        author: normalizedMessage.author || prevMessages[messageIndex].author
                      };
                      return updatedMessages;
                    }
                    return [...prevMessages, normalizedMessage];
                  });
                }
                break;

              case "message_deleted":
                debugLogger.debug('Processing message deletion', data);
                
                // Update WebSocket messages state
                setMessages((prevMessages) => {
                  const updatedMessages = prevMessages.filter(
                    (msg) =>
                      msg.id?.toString() !== data.messageId?.toString() &&
                      msg.parent_id?.toString() !== data.messageId?.toString()
                  );
                  debugLogger.debug('Messages after deletion:', updatedMessages);
                  return updatedMessages;
                });

                // Force immediate UI update via React Query
                const queryKey = [`/api/channels/${data.channelId}/messages`];
                queryClient.setQueryData(queryKey, (oldData: any) => {
                  if (!oldData) return [];
                  const filteredData = oldData.filter((msg: any) => 
                    msg.id?.toString() !== data.messageId?.toString() &&
                    msg.parent_id?.toString() !== data.messageId?.toString()
                  );
                  debugLogger.debug('Query cache after deletion:', filteredData);
                  return filteredData;
                });

                // Add deletion to WebSocket message history
                setMessages(prev => [...prev, data]);
                break;
            }
            debugLogger.endGroup();
          } catch (error) {
            debugLogger.error('Error processing WebSocket message:', error);
            setError('Error processing message');
          }
        };
      } catch (error) {
        debugLogger.error("Error creating WebSocket connection:", error);
        setError("Failed to create connection");
      }
    };

    // Start with debug enabled state from localStorage
    connect();

    return () => {
      debugLogger.disable();
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
      debugLogger.warn("No socket connection, queueing message");
      messageQueue.push(data);
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      debugLogger.warn("Socket still connecting, queueing message");
      messageQueue.push(data);
      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      debugLogger.warn("Socket not open, reconnecting");
      messageQueue.push(data);
      socket.close();
      return;
    }

    try {
      debugLogger.debug('Sending WebSocket message:', data);
      socket.send(JSON.stringify(data));
    } catch (error) {
      debugLogger.error("Error sending message:", error);
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
      debugLogger.info("Subscribing to channel:", channelId);
      setMessages([]);
      send({ type: "subscribe", channelId });
    }
  };

  const unsubscribe = (channelId: string) => {
    if (channelId) {
      debugLogger.info("Unsubscribing from channel:", channelId);
      send({ type: "unsubscribe", channelId });
    }
  };

  const toggleDebug = () => {
    if (debugEnabled) {
      debugLogger.debug("Debug mode being disabled...");
      debugLogger.disable();
      setDebugEnabled(false);
      // Sync with server
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'debug_mode', enabled: false }));
      }
      toast({
        description: "Debug logging disabled - Console logs will no longer show detailed information",
        duration: 3000,
      });
    } else {
      debugLogger.enable();
      setDebugEnabled(true);
      // Sync with server
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'debug_mode', enabled: true }));
      }
      debugLogger.debug("Debug mode enabled!");
      debugLogger.info("You can now see detailed logs in the browser console");
      debugLogger.debug("WebSocket state:", { connected, error, messageQueue: messageQueue.length });
      toast({
        description: "Debug logging enabled - Check browser console (F12) for detailed logs",
        duration: 3000,
      });
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