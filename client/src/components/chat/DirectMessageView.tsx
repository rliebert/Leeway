import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DirectMessage, DirectMessageChannel, User as UserType } from "@db/schema";
import Message from "./Message";
import ChatInput from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useWS } from "@/lib/ws";

interface DirectMessageViewProps {
  channelId: string;
}

export default function DirectMessageView({ channelId }: DirectMessageViewProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { messages: wsMessages, send, subscribe, unsubscribe } = useWS();

  const { data: channel } = useQuery<DirectMessageChannel & { participants: UserType[] }>({
    queryKey: [`/api/dm/channels/${channelId}`],
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to load DM channel",
      });
      setLocation("/");
    },
  });

  const otherUser = channel?.participants?.find(p => p.id !== user?.id);

  useEffect(() => {
    if (!channelId) return;

    // Subscribe to DM channel
    subscribe(`dm_${channelId}`);

    return () => {
      unsubscribe(`dm_${channelId}`);
    };
  }, [channelId]);

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

  // Filter messages for this DM channel
  const channelMessages = wsMessages.filter(msg => msg.channel_id === `dm_${channelId}`);

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
            DM with {otherUser?.full_name || otherUser?.username}
          </h2>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {channelMessages.map((message) => (
            <Message
              key={message.id}
              message={message}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <ChatInput onSend={handleSendMessage} placeholder="Send a message..." />
      </div>
    </div>
  );
}