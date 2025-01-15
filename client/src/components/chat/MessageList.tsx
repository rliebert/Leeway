import { useQuery } from "@tanstack/react-query";
import { useWS } from "@/lib/ws";
import Message from "@/components/chat/Message";
import type { Message as MessageType } from "@/lib/types";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useUser } from "@/hooks/use-user";

interface MessageListProps {
  channelId: string;
}

export default function MessageList({ channelId }: MessageListProps) {
  const { messages: wsMessages, subscribe, unsubscribe } = useWS();
  const { user } = useUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const currentChannelRef = useRef<string | null>(null);

  const { data: initialMessages, isLoading } = useQuery<MessageType[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
    queryFn: async () => {
      if (!channelId || channelId === "0") return [];
      const response = await fetch(`/api/channels/${channelId}/messages`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      return response.json();
    },
    enabled: !!channelId && channelId !== "0",
  });

  // Handle channel subscription with debouncing
  useEffect(() => {
    if (!channelId || channelId === "0" || isLoading) return;

    // Prevent duplicate subscriptions
    if (currentChannelRef.current === channelId) return;

    const previousChannel = currentChannelRef.current;
    currentChannelRef.current = channelId;

    // Clean up previous subscription if exists
    if (previousChannel) {
      unsubscribe(previousChannel);
    }

    // Subscribe to new channel
    subscribe(channelId);

    // Cleanup on unmount or channel change
    return () => {
      if (channelId) {
        unsubscribe(channelId);
      }
    };
  }, [channelId, subscribe, unsubscribe, isLoading]);

  // Combine and deduplicate messages
  const messageMap = new Map<string, MessageType>();

  // Add initial messages
  initialMessages?.forEach(msg => {
    if (!msg.parent_id) { // Only add root messages
      messageMap.set(msg.id, msg);
    }
  });

  // Process WebSocket messages
  wsMessages.forEach(msg => {
    if (msg.type === 'message_deleted' && msg.messageId) {
      messageMap.delete(msg.messageId);
    } else if ((msg.type === 'message' || msg.type === 'message_edited') && msg.message) {
      const messageData = msg.message;
      if (!messageData.parent_id && messageData.channel_id === channelId) {
        messageMap.set(messageData.id, messageData);
      }
    }
  });

  const allMessages = Array.from(messageMap.values())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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
      { threshold: 0.5 }
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
      setUnreadCount(prev => prev + 1);
    }
  }, [allMessages.length, user?.id, showScrollButton, scrollToBottom]);

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
          {unreadCount} new message{unreadCount !== 1 ? 's' : ''} <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}