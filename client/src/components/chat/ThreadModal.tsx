import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@db/schema";
import ChatInput from "./ChatInput";
import { useEffect, useRef, useState } from "react";
import { useWS } from "@/lib/ws";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ThreadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentMessage: Message & {
    author?: { username: string; avatar_url?: string | null };
    attachments?: Array<{ url: string; originalName: string; mimetype: string }>;
    channel_id: string;
  };
}

export default function ThreadModal({
  open,
  onOpenChange,
  parentMessage,
}: ThreadModalProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { messages: wsMessages, send } = useWS();
  const { user } = useUser();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleEditMessage = (messageId: string) => {
    if (!editContent.trim()) return;

    send({
      type: 'message_edited',
      messageId,
      content: editContent,
      channelId: parentMessage.channel_id
    });

    setEditingMessageId(null);
    setEditContent('');
  };

  const { data: replies = [] } = useQuery<(Message & {
    author?: { username: string; avatar_url?: string | null };
    attachments?: Array<{ url: string; originalName: string; mimetype: string }>;
  })[]>({
    queryKey: [`/api/messages/${parentMessage.id}/replies`],
    enabled: open,
  });

  // Combine initial replies with new WebSocket messages
  const allReplies = [
    ...(replies || []),
    ...wsMessages.filter(
      msg => 
        msg.parent_id?.toString() === parentMessage?.id?.toString() &&
        !(replies || []).some(reply => reply?.id === msg?.id)
    ),
  ].sort((a, b) => 
    new Date(a?.created_at || '').getTime() - new Date(b?.created_at || '').getTime()
  );

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [open, allReplies.length]);

  useEffect(() => {
    const newReplies = wsMessages.filter(msg => msg.parent_id === parentMessage.id);
    if (newReplies.length > 0) {
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${parentMessage.id}/replies`] });
    }
  }, [wsMessages, parentMessage.id, queryClient]);

  const formatTimestamp = (date: string | Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>Thread</DialogTitle>
          <DialogDescription>
            Message thread started by {parentMessage.author?.username}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col h-full">
          <div className="p-4">
            <div className="flex gap-4">
              <Avatar>
                <AvatarImage src={parentMessage.author?.avatar_url || undefined} />
                <AvatarFallback>
                  {parentMessage.author?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 group">
                  <span className="font-semibold">{parentMessage.author?.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(parentMessage.created_at)}
                  </span>
                  {parentMessage.user_id === user?.id && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                        onClick={() => {
                          setEditingMessageId(parentMessage.id);
                          setEditContent(parentMessage.content);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-destructive hover:text-destructive"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('This will delete the entire thread. Are you sure you want to continue?')) {
                            const response = await fetch(`/api/messages/${parentMessage.id}`, {
                              method: 'DELETE',
                            });
                            if (response.ok) {
                              send({
                                type: 'message_deleted',
                                channelId: parentMessage.channel_id,
                                messageId: parentMessage.id
                              });
                              onOpenChange(false);
                            }
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingMessageId === parentMessage.id ? (
                  <div className="mt-1 space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[60px] text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleEditMessage(parentMessage.id);
                        }
                        if (e.key === "Escape") {
                          setEditingMessageId(null);
                          setEditContent('');
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => handleEditMessage(parentMessage.id)}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditContent('');
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm mt-1">{parentMessage.content}</p>
                )}
              </div>
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              {allReplies.map((reply) => (
                <div key={reply?.tempId || reply?.id} className="flex gap-4">
                  <Avatar>
                    <AvatarImage src={reply.author?.avatar_url || undefined} />
                    <AvatarFallback>
                      {reply.author?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 group">
                      <span className="font-semibold">{reply.author?.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(reply.created_at)}
                      </span>
                      {reply.user_id === user?.id && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                            onClick={() => {
                              setEditingMessageId(reply.id);
                              setEditContent(reply.content);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-destructive hover:text-destructive"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm('Are you sure you want to delete this reply?')) {
                                const response = await fetch(`/api/messages/${reply.id}`, {
                                  method: 'DELETE',
                                });
                                if (response.ok) {
                                  send({
                                    type: 'message_deleted',
                                    channelId: parentMessage.channel_id,
                                    messageId: reply.id
                                  });
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {editingMessageId === reply.id ? (
                      <div className="mt-1 space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[60px] text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleEditMessage(reply.id);
                            }
                            if (e.key === "Escape") {
                              setEditingMessageId(null);
                              setEditContent('');
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => handleEditMessage(reply.id)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditContent('');
                            }}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm mt-1">{reply.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4">
            <ChatInput 
              channelId={parentMessage.channel_id} 
              parentMessageId={parentMessage.id.toString()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}