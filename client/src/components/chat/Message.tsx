import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Message as MessageType } from "@db/schema";

interface MessageProps {
  message: MessageType;
}

export default function Message({ message }: MessageProps) {
  return (
    <div className="flex gap-4">
      <Avatar>
        <AvatarImage src={message.user?.avatar} />
        <AvatarFallback>{message.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{message.user?.username}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.createdAt).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm mt-1">{message.content}</p>
      </div>
    </div>
  );
}
