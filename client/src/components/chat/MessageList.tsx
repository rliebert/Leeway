
import { useQuery } from "@tanstack/react-query";
import { useWS } from "@/lib/ws.tsx";
import Message from "@/components/chat/Message";
import type { Message as MessageType } from "@db/schema";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useUser } from "@/hooks/use-user";

interface MessageListProps {
  channelId: string;  // Changed to string for UUID
}

export default function MessageList({ channelId }: MessageListProps) {
  const { messages: wsMessages, subscribe, unsubscribe } = useWS();
  const { user } = useUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  
  const { data: initialMessages } = useQuery<MessageType[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
    enabled: !!channelId && channelId !== "0", // Only fetch if we have a valid channelId
  });

  useEffect(() => {
    if (channelId && channelId !== "0") {
      console.log('[MessageList] Subscribing to channel:', channelId);
      console.log('[MessageList] Initial WS messages:', wsMessages.length);
      subscribe(channelId);
      return () => {
        console.log('[MessageList] Unsubscribing from channel:', channelId);
        unsubscribe(channelId);
      };
    }
  }, [channelId, wsMessages.length]);

  // Filter out thread replies and combine messages
  const allMessages = [
    ...(initialMessages?.filter(msg => !msg.parent_id) || []),
    ...wsMessages.filter(
      wsMsg => {
        const isRelevant = 
          wsMsg.channel_id?.toString() === channelId?.toString() && 
          !wsMsg.parent_id &&
          wsMsg.content !== null;
        const isDuplicate = initialMessages?.some(initMsg => initMsg.id === wsMsg.id);
        return isRelevant && !isDuplicate;
      }
    ),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Debug effect for tracking message updates
  useEffect(() => {
    console.log('[MessageList] Message state updated:', {
      initialMessages: initialMessages?.length || 0,
      wsMessages: wsMessages.length,
      combinedMessages: allMessages.length,
      channelId
    });
  }, [initialMessages, wsMessages, allMessages.length, channelId]);

  useEffect(() => {
    console.log('MessageList: Final message count:', allMessages.length);
  }, [allMessages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
    setShowScrollButton(false);
  };

  // Set up intersection observer to detect when last message is visible
  useEffect(() => {
    if (!lastMessageRef.current) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setUnreadCount(0);
          setShowScrollButton(false);
        } else {
          setShowScrollButton(true);
        }
      },
      { threshold: 1 }
    );

    observerRef.current.observe(lastMessageRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Auto scroll when current user sends a message
  useEffect(() => {
    const lastMessage = allMessages[allMessages.length - 1];
    if (lastMessage?.user_id === user?.id) {
      scrollToBottom();
    } else if (lastMessage && !showScrollButton) {
      // If messages are already at bottom, scroll to new messages from others too
      scrollToBottom();
    } else if (lastMessage) {
      // Increment unread count for messages from others when not at bottom
      setUnreadCount(prev => prev + 1);
    }
  }, [allMessages.length, user?.id, showScrollButton]);

  if (!channelId || channelId === "0") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a channel to view messages
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
