import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply, ChevronDown, ChevronRight, FileIcon, ExternalLink, Trash2 } from "lucide-react";
import type { Message as MessageType } from "@db/schema";
import { forwardRef, useState, useEffect } from "react";
import ThreadModal from "./ThreadModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWS } from "@/lib/ws";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";

interface FileAttachment {
  id: string;
  url: string;
  originalName: string;
  mimetype: string;
  file_size: number;
}

interface MessageProps {
  message: MessageType & {
    author?: { username: string; avatar_url?: string };
    attachments?: FileAttachment[];
  };
}

const Message = forwardRef<HTMLDivElement, MessageProps>(({ message }, ref) => {
  const [showThread, setShowThread] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWS();
  const { user } = useUser();
  const { toast } = useToast(); // Use useToast hook here

  const { data: replies = [] } = useQuery<(MessageType & {
    author?: { username: string; avatar_url?: string };
    attachments?: FileAttachment[];
  })[]>({
    queryKey: [`/api/messages/${message.id}/replies`],
    enabled: true,
  });

  // Combine initial replies with new WebSocket messages
  const allReplies = [
    ...replies,
    ...wsMessages.filter(
      wsMsg => 
        wsMsg.parent_id === message.id &&
        !replies.some(reply => reply.id === wsMsg.id)
    ),
  ].sort((a, b) => {
    const dateA = new Date(a.created_at || '').getTime();
    const dateB = new Date(b.created_at || '').getTime();
    return dateA - dateB;
  });

  const replyCount = allReplies.length;

  // Helper function to check if file is an image
  const isImageFile = (mimetype: string): boolean => {
    return mimetype.startsWith('image/');
  };

  const formatTimestamp = (date: string | Date | null): string => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString();
  };

  useEffect(() => {
    const newReplies = wsMessages.filter(msg => msg.parent_id === message.id);
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
            <AvatarImage src={message.author?.avatar_url} />
            <AvatarFallback className="bg-primary/10">
              {message.author?.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{message.author?.username}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(message.created_at)}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                  onClick={() => setShowThread(true)}
                >
                  <Reply className="h-3 w-3 mr-1" />
                  {replyCount > 0 ? `${replyCount}` : 'Reply'}
                </Button>
                {message.user_id === user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-destructive hover:text-destructive"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm('Are you sure you want to delete this message?')) {
                        const response = await fetch(`/api/messages/${message.id}`, {
                          method: 'DELETE',
                        });
                        if (response.ok) {
                          toast({ description: "Message deleted" });
                          
                          // Update the WebSocket context
                          const { setMessages } = useWS();
                          setMessages(prevMessages => 
                            prevMessages.filter(msg => msg.id !== message.id)
                          );
                          
                          // Update the query cache for messages
                          queryClient.setQueryData(
                            [`/api/channels/${message.channel_id}/messages`],
                            (oldData: any) => oldData?.filter((msg: MessageType) => msg.id !== message.id) ?? []
                          );
                          
                          // Update the query cache for replies
                          queryClient.setQueryData(
                            [`/api/messages/${message.id}/replies`],
                            []
                          );
                          
                          // Invalidate related queries to trigger refetch
                          queryClient.invalidateQueries({ 
                            queryKey: [`/api/channels/${message.channel_id}/messages`]
                          });
                        } else {
                          toast({ 
                            variant: "destructive",
                            description: "Failed to delete message"
                          });
                        }
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{message.content}</p>

            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
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

            {showReplies && allReplies.length > 0 && (
              <div className="ml-12 pl-4 border-l mt-2">
                {allReplies.map((reply) => (
                  <div key={reply.id} className="flex gap-4 mt-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={reply.author?.avatar_url} />
                      <AvatarFallback className="bg-primary/10">
                        {reply.author?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{reply.author?.username}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(reply.created_at)}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{reply.content}</p>

                      {reply.attachments && reply.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
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