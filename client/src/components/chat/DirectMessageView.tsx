import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Message, User as UserType, Channel } from "@db/schema";
import MessageComponent from "./Message";
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
  const [isSubscribed, setIsSubscribed] = useState(false);

  const { data: channel } = useQuery<Channel>({
    queryKey: [`/api/channels/${channelId}`],
    queryFn: async () => {
      const response = await fetch(`/api/channels/${channelId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    enabled: !!channelId,
    retry: false,
  });

  const otherUser = channel?.participants?.find(p => p.id !== user?.id);

  // Subscribe to channel when it's loaded
  useEffect(() => {
    if (!channelId || isSubscribed) return;

    subscribe(channelId);
    setIsSubscribed(true);

    return () => {
      unsubscribe(channelId);
      setIsSubscribed(false);
    };
  }, [channelId, subscribe, unsubscribe, isSubscribed]);

  const handleSendMessage = async (content: string) => {
    if (!user || !content.trim()) return;

    try {
      send({
        type: 'message',
        channelId: channelId,
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

  // Filter messages for this channel
  const channelMessages = wsMessages.filter(msg => 
    msg.channel_id === channelId
  );

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
              message={{
                ...message,
                attachments: message.attachments?.map(att => ({
                  url: att.file_url || att.url,
                  originalName: att.file_name || att.originalName,
                  mimetype: att.file_type || att.mimetype
                }))
              }}
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