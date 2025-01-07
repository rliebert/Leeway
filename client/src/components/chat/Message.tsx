import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply } from "lucide-react";
import type { Message as MessageType } from "@db/schema";
import { forwardRef, useState } from "react";
import ThreadModal from "./ThreadModal";

interface MessageProps {
  message: MessageType;
}

const Message = forwardRef<HTMLDivElement, MessageProps>(({ message }, ref) => {
  const [showThread, setShowThread] = useState(false);
  const replyCount = message.replies?.length ?? 0;

  return (
    <>
      <div ref={ref} className="flex gap-4 group">
        <Avatar>
          <AvatarImage src={message.user?.avatar} />
          <AvatarFallback>{message.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{message.user?.username}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm mt-1">{message.content}</p>
          <div className="flex items-center gap-2 mt-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setShowThread(true)}
            >
              <Reply className="h-4 w-4 mr-1" />
              {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}
            </Button>
          </div>
        </div>
      </div>
      <ThreadModal
        open={showThread}
        onOpenChange={setShowThread}
        parentMessage={message}
      />
    </>
  );
});

Message.displayName = "Message";

export default Message;