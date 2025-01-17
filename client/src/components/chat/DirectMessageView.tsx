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

  const { data: channel, isError, error } = useQuery<DirectMessageChannel>({
    queryKey: [`/api/dm/channels/${channelId}`],
    enabled: !!channelId,
    retry: false,
  });

  useEffect(() => {
    if (isError) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to load DM channel",
      });
      setLocation("/");
    }
  }, [isError, error, toast, setLocation]);

  const otherUser = channel?.members?.find(m => m.user.id !== user?.id)?.user;

  useEffect(() => {
    if (!channelId) return;
    subscribe(`dm_${channelId}`);
    return () => {
      unsubscribe(`dm_${channelId}`);
    };
  }, [channelId, subscribe, unsubscribe]);

  const handleSendMessage = async (content: string) => {
    if (!user || !content.trim()) return;

    try {
      send({
        type: 'message',
        channelId: `dm_${channelId}`,
        content: content.trim()
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        description: "Failed to send message",
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
        password: "" // This is safe as it's only used for type compatibility and never exposed
      }
    }));

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Error: {error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  if (!channel || !otherUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
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