import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply, ChevronDown, ChevronRight } from "lucide-react";
import type { Message as MessageType } from "@db/schema";
import { forwardRef, useState, useEffect } from "react";
import ThreadModal from "./ThreadModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWS } from "@/lib/ws";

interface MessageProps {
  message: MessageType;
}

const Message = forwardRef<HTMLDivElement, MessageProps>(({ message }, ref) => {
  const [showThread, setShowThread] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWS();

  const { data: replies = [] } = useQuery<MessageType[]>({
    queryKey: [`/api/messages/${message.id}/replies`],
    enabled: showReplies || showThread,
  });

  // Update reply count when new messages come in via WebSocket
  const allReplies = [
    ...replies,
    ...wsMessages.filter(
      wsMsg => 
        wsMsg.parentMessageId === message.id &&
        !replies.some(reply => reply.id === wsMsg.id)
    ),
  ];

  const replyCount = allReplies.length;

  // Invalidate replies query when new messages come in
  useEffect(() => {
    const newReplies = wsMessages.filter(msg => msg.parentMessageId === message.id);
    if (newReplies.length > 0) {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${message.id}/replies`] });
    }
  }, [wsMessages, message.id, queryClient]);

  return (
    <>
      <div ref={ref} className="flex flex-col gap-2">
        <div className="flex gap-4 group">
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
              {replyCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setShowReplies(!showReplies)}
                >
                  {showReplies ? (
                    <ChevronDown className="h-4 w-4 mr-1" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-1" />
                  )}
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setShowThread(true)}
              >
                <Reply className="h-4 w-4 mr-1" />
                Reply
              </Button>
            </div>
          </div>
        </div>
        {showReplies && allReplies.length > 0 && (
          <div className="ml-12 pl-4 border-l">
            {allReplies.map((reply) => (
              <div key={reply.id} className="flex gap-4 mt-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={reply.user?.avatar} />
                  <AvatarFallback>{reply.user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{reply.user?.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(reply.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{reply.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
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