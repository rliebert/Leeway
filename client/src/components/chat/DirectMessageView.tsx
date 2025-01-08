import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useQuery } from "@tanstack/react-query";
import { Message as MessageType, DirectMessage, DirectMessageChannel, User as UserType } from "@db/schema";
import Message from "./Message";
import ChatInput from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface DirectMessageViewProps {
  channelId: number;
}

export default function DirectMessageView({ channelId }: DirectMessageViewProps) {
  const { user } = useUser();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);

  const { data: channel } = useQuery<DirectMessageChannel & { participants: UserType[] }>({
    queryKey: [`/api/dm/channels/${channelId}`],
  });

  const otherUser = channel?.participants?.find(p => p.id !== user?.id);

  // WebSocket connection
  useEffect(() => {
    if (!user) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    const newWs = new WebSocket(wsUrl);

    newWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message' && data.message.channelId === channelId) {
        setMessages(prev => [...prev, data.message]);
      }
    };

    setWs(newWs);

    return () => {
      newWs.close();
    };
  }, [user, channelId]);

  // Fetch messages
  useEffect(() => {
    if (!channelId) return;

    fetch(`/api/dm/channels/${channelId}/messages`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(console.error);
  }, [channelId]);

  const handleSendMessage = async (content: string, attachments?: { filename: string; originalName: string; mimetype: string; size: number; url: string; }[]) => {
    if (!ws || !user) return;

    ws.send(JSON.stringify({
      type: 'message',
      content,
      channelId,
      userId: user.id,
      attachments
    }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center gap-3">
        {otherUser && (
          <>
            <Avatar className="h-8 w-8">
              <AvatarImage src={otherUser.avatar || undefined} />
              <AvatarFallback>
                {otherUser.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold">{otherUser.username}</h2>
            </div>
          </>
        )}
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