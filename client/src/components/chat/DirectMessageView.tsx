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
import { User } from "lucide-react";

interface DirectMessageViewProps {
  channelId: number;
}

export default function DirectMessageView({ channelId }: DirectMessageViewProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [, setLocation] = useLocation();

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

  // WebSocket connection
  useEffect(() => {
    if (!user) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    const newWs = new WebSocket(wsUrl);

    newWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'dm' && data.message.channelId === channelId) {
          setMessages(prev => [...prev, data.message]);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };

    setWs(newWs);

    return () => {
      newWs.close();
    };
  }, [user, channelId]);

  // Fetch messages
  useEffect(() => {
    if (!channelId || !user) return;

    fetch(`/api/dm/channels/${channelId}/messages`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        return res.json();
      })
      .then(data => setMessages(data))
      .catch(error => {
        console.error("Error fetching messages:", error);
        toast({
          variant: "destructive",
          description: "Failed to load messages",
        });
      });
  }, [channelId, user, toast]);

  const handleSendMessage = async (content: string) => {
    if (!ws || !user || !content.trim()) return;

    try {
      ws.send(JSON.stringify({
        type: 'message',
        channelId: `dm_${channelId}`,
        content: content.trim(),
        userId: user.id,
      }));
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        description: "Failed to send message",
      });
    }
  };

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
          <h2 className="font-semibold">{otherUser?.username}</h2>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <Message
              key={message.id}
              message={{
                ...message,
                channelId,
                parentMessageId: null,
                attachments: null,
              }}
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