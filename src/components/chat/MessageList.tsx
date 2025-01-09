import { useQuery } from "@tanstack/react-query";
import { useWS } from "@/lib/ws.tsx";
import Message from "@/components/chat/Message";
import type { Message as MessageType } from "@db/schema";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useUser } from "@/hooks/use-user";

interface MessageListProps {
  channelId: number;
}

export default function MessageList({ channelId }: MessageListProps) {
  const { messages: wsMessages } = useWS();
  const { data: initialMessages } = useQuery<MessageType[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
  });
  const { user } = useUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  // Filter out thread replies and combine messages
  const allMessages = [
    ...(initialMessages?.filter(msg => !msg.parentMessageId) || []),
    ...wsMessages.filter(
      wsMsg => 
        wsMsg.channelId === channelId && 
        !wsMsg.parentMessageId && // Only show top-level messages
        !initialMessages?.some(initMsg => initMsg.id === wsMsg.id)
    ),
  ];

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
    if (lastMessage?.userId === user?.id) {
      scrollToBottom();
    } else if (lastMessage && !showScrollButton) {
      // If messages are already at bottom, scroll to new messages from others too
      scrollToBottom();
    } else if (lastMessage) {
      // Increment unread count for messages from others when not at bottom
      setUnreadCount(prev => prev + 1);
    }
  }, [allMessages.length, user?.id]);

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