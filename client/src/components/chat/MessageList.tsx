import { useQuery } from "@tanstack/react-query";
import { useWS } from "@/lib/ws.tsx";
import Message from "@/components/chat/Message";
import type { Message as MessageType } from "@db/schema";

interface MessageListProps {
  channelId: number;
}

export default function MessageList({ channelId }: MessageListProps) {
  const { messages: wsMessages } = useWS();
  const { data: initialMessages } = useQuery<MessageType[]>({
    queryKey: [`/api/channels/${channelId}/messages`],
  });

  // Combine initial messages with websocket messages, ensuring no duplicates
  const allMessages = [
    ...(initialMessages || []),
    ...wsMessages.filter(
      wsMsg => 
        wsMsg.channelId === channelId && 
        !initialMessages?.some(initMsg => initMsg.id === wsMsg.id)
    ),
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {allMessages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </div>
  );
}