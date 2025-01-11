import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply, ChevronDown, ChevronRight, FileIcon, ExternalLink } from "lucide-react";
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

  const { data: replies = message.replies || [] } = useQuery<MessageType[]>({
    queryKey: [`/api/messages/${message.id}/replies`],
    enabled: true, // Always fetch replies to show correct count
  });

  // Combine initial replies with new WebSocket messages
  const allReplies = [
    ...replies,
    ...wsMessages.filter(
      wsMsg => 
        wsMsg.parentMessageId === message.id &&
        !replies.some(reply => reply.id === wsMsg.id)
    ),
  ];

  const replyCount = allReplies.length;

  // Helper function to check if file is an image
  const isImageFile = (mimetype: string) => {
    return mimetype.startsWith('image/');
  };

  // Invalidate replies query when new messages come in
  useEffect(() => {
    const newReplies = wsMessages.filter(msg => msg.parentMessageId === message.id);
    if (newReplies.length > 0) {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${message.id}/replies`] });
    }
  }, [wsMessages, message.id, queryClient]);

  return (
    <>
      <div 
        ref={ref} 
        id={`message-${message.id}`}
        className="group hover:bg-muted rounded-lg -mx-4 px-4 py-1.5 transition-all duration-200 ease-in-out"
      >
        <div className="flex gap-4">
          <Avatar className="h-8 w-8 group-hover:ring-2 group-hover:ring-primary transition-all">
            <AvatarImage src={message.user?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10">
              {message.user?.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{message.user?.username}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(message.createdAt || '').toLocaleTimeString()}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="opacity-0 group-hover:opacity-100 transition-opacity h-8 px-2"
                onClick={() => setShowThread(true)}
              >
                <Reply className="h-4 w-4 mr-1" />
                Reply
              </Button>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{message.content}</p>

            {/* Display attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {/* Display image previews */}
                <div className="flex flex-wrap gap-2">
                  {message.attachments
                    .filter(file => isImageFile(file.mimetype))
                    .map((file, index) => (
                      <a 
                        key={index}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-xs hover:opacity-90 transition-opacity"
                      >
                        <img
                          src={file.url}
                          alt={file.originalName}
                          className="rounded-md max-h-48 object-cover"
                        />
                      </a>
                    ))}
                </div>

                {/* Display non-image file links */}
                <div className="flex flex-wrap gap-2">
                  {message.attachments
                    .filter(file => !isImageFile(file.mimetype))
                    .map((file, index) => (
                      <a
                        key={index}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                      >
                        <FileIcon className="h-4 w-4" />
                        {file.originalName}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                </div>
              </div>
            )}

            {replyCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 mt-2"
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
          </div>
        </div>
        {showReplies && allReplies.length > 0 && (
          <div className="ml-12 pl-4 border-l mt-2">
            {allReplies.map((reply) => (
              <div key={reply.id} className="flex gap-4 mt-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={reply.user?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10">
                    {reply.user?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{reply.user?.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(reply.createdAt || '').toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{reply.content}</p>

                  {/* Display attachments in replies */}
                  {reply.attachments && reply.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {/* Display image previews */}
                      <div className="flex flex-wrap gap-2">
                        {reply.attachments
                          .filter(file => isImageFile(file.mimetype))
                          .map((file, index) => (
                            <a 
                              key={index}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block max-w-xs hover:opacity-90 transition-opacity"
                            >
                              <img
                                src={file.url}
                                alt={file.originalName}
                                className="rounded-md max-h-48 object-cover"
                              />
                            </a>
                          ))}
                      </div>

                      {/* Display non-image file links */}
                      <div className="flex flex-wrap gap-2">
                        {reply.attachments
                          .filter(file => !isImageFile(file.mimetype))
                          .map((file, index) => (
                            <a
                              key={index}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                            >
                              <FileIcon className="h-4 w-4" />
                              {file.originalName}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
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