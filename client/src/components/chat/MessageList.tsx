import { useQuery } from "@tanstack/react-query";
import { useWS } from "@/lib/ws";
import Message from "./Message";
import type { Message as MessageType } from "@db/schema";

interface MessageListProps {
  channelId: number;
}

export default function MessageList({ channelId }: MessageListProps) {
  const { messages } = useWS();
  const { data: initialMessages } = useQuery<MessageType[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
  });

  const allMessages = [...(initialMessages || []), ...messages.filter(m => m.channelId === channelId)];

  return (
    <div className="flex flex-col gap-4 p-4">
      {allMessages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </div>
  );
}
