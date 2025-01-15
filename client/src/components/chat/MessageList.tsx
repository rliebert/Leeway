import { useQuery } from "@tanstack/react-query";
import { useWS } from "@/lib/ws";
import Message from "@/components/chat/Message";
import type { Message as MessageType } from "@/lib/types";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useQueryClient } from "@tanstack/react-query";
import { debugLogger } from "@/lib/debug";

interface MessageListProps {
  channelId: string;
}

export default function MessageList({ channelId }: MessageListProps) {
  const { messages: wsMessages, subscribe, unsubscribe, connected } = useWS();
  const { user } = useUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const currentChannelRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const { data: initialMessages, isLoading } = useQuery<MessageType[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
    queryFn: async () => {
      if (!channelId || channelId === "0") return [];
      const response = await fetch(`/api/channels/${channelId}/messages`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      return response.json();
    },
    enabled: !!channelId && channelId !== "0",
  });

  // Get unique messages by id, preferring WebSocket messages over initial messages
  const messageMap = new Map();

  // Add initial messages first
  initialMessages
    ?.filter((msg) => !msg.parent_id)
    ?.forEach((msg) => {
      messageMap.set(msg.id, msg);
    });

  // Add or update with WebSocket messages
  wsMessages.forEach((wsMsg: WSMessage) => {
    if (wsMsg.type === "message_deleted") {
      messageMap.delete(wsMsg.messageId);
      // Also remove any child messages
      for (const [key, msg] of messageMap.entries()) {
        if (msg.parent_id?.toString() === wsMsg.messageId?.toString()) {
          messageMap.delete(key);
        }
      }
    } else if (wsMsg.type === "message_edited") {
      const existingMsg = messageMap.get(wsMsg.messageId);
      if (existingMsg) {
        messageMap.set(wsMsg.messageId, { ...existingMsg, content: wsMsg.content });
      }
    } else if (
      wsMsg.channel_id?.toString() === channelId?.toString() &&
      !wsMsg.parent_id &&
      wsMsg.content !== null
    ) {
      // Only check for tempId match for deduplication
      const existingMsg = Array.from(messageMap.values()).find(msg => msg.tempId === wsMsg.tempId);
      
      if (!existingMsg) {
        // No existing message with this tempId, add it
        messageMap.set(wsMsg.id, wsMsg);
      } else if (!wsMsg.isOptimistic) {
        // Replace optimistic message with real one, keeping the tempId
        messageMap.delete(existingMsg.id);
        messageMap.set(wsMsg.id, { ...wsMsg, tempId: existingMsg.tempId });
      }
    }
  });

  const allMessages = Array.from(messageMap.values()).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
    setShowScrollButton(false);
  }, []);

  // Set up intersection observer
  useEffect(() => {
    if (!lastMessageRef.current) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setUnreadCount(0);
          setShowScrollButton(false);
        } else {
          setShowScrollButton(true);
        }
      },
      { threshold: 0.5 },
    );

    observerRef.current.observe(lastMessageRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [allMessages.length]); // Recreate observer when messages change

  // Auto scroll for new messages
  useEffect(() => {
    const lastMessage = allMessages[allMessages.length - 1];
    if (lastMessage?.user_id === user?.id) {
      scrollToBottom();
    } else if (lastMessage && !showScrollButton) {
      scrollToBottom();
    } else if (lastMessage) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [allMessages.length, user?.id, showScrollButton, scrollToBottom]);

  // Add connection quality indicator
  const { connectionQuality } = useWS();

  // Subscribe to channel when mounted or changed
  useEffect(() => {
    if (connected && channelId) {
      debugLogger.info("MessageList: Subscribing to channel", channelId);
      subscribe(channelId);
      
      return () => {
        debugLogger.info("MessageList: Unsubscribing from channel", channelId);
        unsubscribe(channelId);
      };
    }
  }, [channelId, connected, subscribe, unsubscribe]);

  // Optimistic UI updates for new messages
  const handleNewMessage = useCallback((message: MessageType) => {
    queryClient.setQueryData(
      [`/api/channels/${channelId}/messages`],
      (old: MessageType[] | undefined) => {
        if (!old) return [message];
        return [...old, message];
      }
    );
  }, [channelId, queryClient]);

  // When a new message arrives
  useEffect(() => {
    if (wsMessages.length > 0) {
      // Debounce the refresh to avoid too many requests
      const timer = setTimeout(() => {
        queryClient.invalidateQueries([`/api/channels/${channelId}/messages`]);
      }, 1000); // Wait 1 second after last message
      
      return () => clearTimeout(timer);
    }
  }, [wsMessages.length, channelId]);

  if (!channelId || channelId === "0") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a channel to view messages
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading messages...
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      {/* Add connection quality indicator */}
      {connectionQuality < 3 && (
        <div className="sticky top-0 bg-yellow-500/10 text-yellow-500 px-4 py-2 text-sm">
          Poor connection quality. Some messages may be delayed.
        </div>
      )}
      
      <div className="flex flex-col gap-1 p-4">
        {allMessages.map((message, index) => (
          <Message
            key={message.id}
            message={message}
            ref={index === allMessages.length - 1 ? lastMessageRef : undefined}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      {showScrollButton && unreadCount > 0 && (
        <Button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 shadow-lg"
          variant="secondary"
        >
          {unreadCount} new message{unreadCount !== 1 ? "s" : ""}{" "}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
