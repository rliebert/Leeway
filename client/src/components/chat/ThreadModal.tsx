import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import type { Message } from "@db/schema";
import ChatInput from "./ChatInput";
import { useEffect, useRef } from "react";

interface ThreadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentMessage: Message;
}

export default function ThreadModal({
  open,
  onOpenChange,
  parentMessage,
}: ThreadModalProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: replies = [] } = useQuery<Message[]>({
    queryKey: [`/api/messages/${parentMessage.id}/replies`],
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [open, replies.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>Thread</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col h-full">
          <div className="p-4">
            <div className="flex gap-4">
              <Avatar>
                <AvatarImage src={parentMessage.user?.avatar} />
                <AvatarFallback>
                  {parentMessage.user?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{parentMessage.user?.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(parentMessage.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm mt-1">{parentMessage.content}</p>
              </div>
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              {replies.map((reply) => (
                <div key={reply.id} className="flex gap-4">
                  <Avatar>
                    <AvatarImage src={reply.user?.avatar} />
                    <AvatarFallback>
                      {reply.user?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{reply.user?.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(reply.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{reply.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4">
            <ChatInput 
              channelId={parentMessage.channelId} 
              parentMessageId={parentMessage.id}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
