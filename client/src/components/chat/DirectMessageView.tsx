import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Message, User } from "@db/schema";
import MessageComponent from "./Message";
import ChatInput from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useWS } from "@/lib/ws";

interface DirectMessageChannel {
  id: string;
  created_at: string;
  members: Array<{
    user: User;
    user_id: string;
    channel_id: string;
    created_at: string;
  }>;
}

interface DirectMessageViewProps {
  channelId: string;
}

export default function DirectMessageView({ channelId }: DirectMessageViewProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { messages: wsMessages, send, subscribe, unsubscribe } = useWS();
  const [isSubscribed, setIsSubscribed] = useState(false);

  const { data: channel, isError, error, isLoading } = useQuery<DirectMessageChannel>({
    queryKey: [`/api/dm/channels/${channelId}`],
    enabled: !!channelId,
    retry: (failureCount, error) => {
      // Only retry if it's not a 404
      return failureCount < 3 && !(error instanceof Error && error.message.includes("404"));
    },
    onError: (error) => {
      console.error("Error fetching DM channel:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load DM channel",
      });
      // Only redirect on critical errors, not on expected cases like 404
      if (!(error instanceof Error && error.message.includes("404"))) {
        setLocation("/");
      }
    }
  });

  const otherUser = channel?.members?.find(m => m.user.id !== user?.id)?.user;

  useEffect(() => {
    if (!channelId || isSubscribed) return;

    const wsChannel = `dm_${channelId}`;
    console.log(`[DM] Subscribing to channel: ${wsChannel}`);
    subscribe(wsChannel);
    setIsSubscribed(true);

    return () => {
      if (isSubscribed) {
        console.log(`[DM] Unsubscribing from channel: ${wsChannel}`);
        unsubscribe(wsChannel);
        setIsSubscribed(false);
      }
    };
  }, [channelId, subscribe, unsubscribe, isSubscribed]);

  const handleSendMessage = async (content: string) => {
    if (!user || !content.trim()) return;

    try {
      send({
        type: 'message',
        channelId: `dm_${channelId}`,
        content: content.trim()
      });
    } catch (error) {
      console.error("[DM] Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
    }
  };

  // Transform websocket messages to include full user information
  const channelMessages = wsMessages
    .filter(msg => msg.channel_id === `dm_${channelId}`)
    .map(msg => ({
      ...msg,
      created_at: new Date(msg.created_at),
      pinned_at: msg.pinned_at ? new Date(msg.pinned_at) : null,
      user: channel?.members.find(m => m.user_id === msg.user_id)?.user || {
        id: msg.user_id,
        username: "Unknown User",
        email: "",
        avatar_url: null,
        full_name: null,
        status: null,
        last_active: null,
        created_at: null,
        role: "user",
        is_admin: false,
      }
    }));

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading conversation...</p>
      </div>
    );
  }

  if (isError) {
    console.error('DM channel error:', error);
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Could not load conversation. Please try again.</p>
      </div>
    );
  }

  if (!channel || !otherUser) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading conversation...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={otherUser?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10">
            {otherUser?.username[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-semibold">
            {otherUser?.username}
          </h2>
          <p className="text-sm text-muted-foreground">
            {otherUser?.email}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {channelMessages.map((message) => (
            <MessageComponent
              key={message.id}
              message={message}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <ChatInput 
          channelId={channelId} 
          onSend={handleSendMessage} 
          placeholder={`Message ${otherUser?.username}`} 
        />
      </div>
    </div>
  );
}