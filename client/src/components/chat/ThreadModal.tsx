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
import { PaperclipIcon, ExternalLink } from "lucide-react";

// Add type for mode
type ThreadMode = 'thread' | 'dm';

interface ThreadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentMessage: Message & {
    author?: {
      id: string;
      username: string;
      avatar_url?: string | null;
      email: string;
      password: string;
      full_name: string | null;
      status: string | null;
      last_active: Date | null;
      created_at: Date | null;
      role: string;
      is_admin: boolean;
    };
    attachments?: Array<{
      url: string;
      originalName: string;
      mimetype: string;
    }>;
    channel_id: string;
    tempId?: string;
  };
  mode?: ThreadMode;
}

// Add WebSocketMessage type to handle incoming messages
type WebSocketMessage = {
  id: string;
  content: string;
  user_id: string;
  channel_id: string;
  parent_id?: string;
  created_at?: string | Date;
  pinned_at?: string | Date | null;
  tempId?: string;
  type?: string;
  attachments?: Array<{
    id?: string;
    url: string;
    originalName: string;
    mimetype: string;
    size: number;
  }>;
  author?: {
    username: string;
    avatar_url: string;
    full_name?: string | null;
  };
};

// Add FileAttachment type definition
type FileAttachment = {
  id: string;
  message_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: Date | null;
};

// Update MessageWithAuthor type to use FileAttachment
type MessageWithAuthor = Message & {
  author?: {
    id: string;
    username: string;
    avatar_url?: string | null;
    email: string;
    password: string;
    full_name: string | null;
    status: string | null;
    last_active: Date | null;
    created_at: Date | null;
    role: string;
    is_admin: boolean;
  };
  attachments?: FileAttachment[];
  tempId?: string;
  type?: string;
  dm_channel_id: string | null;
};

export default function ThreadModal({
  open,
  onOpenChange,
  parentMessage,
  mode = 'thread'
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

  const { data: replies = [] } = useQuery<MessageWithAuthor[]>({
    queryKey: mode === 'dm' 
      ? [`/api/dm/channels/${parentMessage.channel_id}/messages`, mode]
      : [`/api/messages/${parentMessage.id}/replies`, mode],
    enabled: open && !!parentMessage.channel_id && (mode === 'thread' || !!parentMessage.author),
    queryFn: async () => {
      if (mode === 'dm' && parentMessage.channel_id) {
        console.log('Fetching DM messages:', {
          channelId: parentMessage.channel_id,
          mode,
          parentMessage,
          url: `/api/dm/channels/${parentMessage.channel_id}/messages`
        });

        const response = await fetch(`/api/dm/channels/${parentMessage.channel_id}/messages`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.error('Failed to fetch DM messages:', {
            status: response.status,
            statusText: response.statusText,
            channelId: parentMessage.channel_id,
            response
          });
          return [];
        }

        const messages = await response.json();
        console.log('Received DM messages:', {
          channelId: parentMessage.channel_id,
          messageCount: messages.length,
          messages
        });
        
        // Update last_read timestamp when opening DM
        await fetch(`/api/dm/channels/${parentMessage.channel_id}/read`, {
          method: 'POST',
          credentials: 'include'
        });
        return messages;
      } else {
        const response = await fetch(`/api/messages/${parentMessage.id}/replies`, {
          credentials: 'include'
        });
        if (!response.ok) return [];
        return response.json();
      }
    }
  });

  // Add debug logging for WebSocket messages
  useEffect(() => {
    console.log('WebSocket messages:', wsMessages);
  }, [wsMessages]);

  // Combine initial replies with new WebSocket messages
  const allReplies = (() => {
    // Use a Map to deduplicate messages by both id and tempId
    const messageMap = new Map<string, MessageWithAuthor>();

    // Add initial replies to the map
    replies.forEach(reply => {
      messageMap.set(reply.id, reply);
      if (reply.tempId) {
        messageMap.set(reply.tempId, reply);
      }
    });

    // Process WebSocket messages
    (wsMessages as unknown as WebSocketMessage[])
      .filter((msg) => {
        if (mode === 'dm') {
          return msg.channel_id === parentMessage.channel_id && msg.type !== 'message_deleted';
        }
        return msg.parent_id === parentMessage.id && msg.type !== 'message_deleted';
      })
      .forEach((msg) => {
        // Skip if we already have this message (by id or tempId)
        if (messageMap.has(msg.id) || (msg.tempId && messageMap.has(msg.tempId))) {
          return;
        }

        // Transform attachments to match required type
        const processedAttachments = (msg.attachments || []).map(attachment => ({
          id: attachment.id || crypto.randomUUID(),
          message_id: msg.id,
          file_url: attachment.url,
          file_name: attachment.originalName,
          file_type: attachment.mimetype,
          file_size: attachment.size,
          created_at: new Date()
        }));

        // Add the message to our map with required fields
        const processedMsg: MessageWithAuthor = {
          id: msg.id,
          channel_id: msg.channel_id,
          dm_channel_id: mode === 'dm' ? parentMessage.channel_id : null,
          user_id: msg.user_id,
          content: msg.content,
          parent_id: msg.parent_id || null,
          pinned_by: null,
          pinned_at: msg.pinned_at ? new Date(msg.pinned_at) : null,
          created_at: msg.created_at ? new Date(msg.created_at) : new Date(),
          tempId: msg.tempId,
          type: msg.type,
          attachments: processedAttachments,
          author: msg.author ? {
            id: msg.user_id, // Use user_id as author id
            username: msg.author.username,
            avatar_url: msg.author.avatar_url,
            email: '', // Required by type but not needed for display
            password: '', // Required by type but not needed for display
            full_name: msg.author.full_name || null,
            status: null,
            last_active: null,
            created_at: null,
            role: 'user',
            is_admin: false
          } : undefined
        };

        messageMap.set(msg.id, processedMsg);
        if (msg.tempId) {
          messageMap.set(msg.tempId, processedMsg);
        }
      });

    // Convert map back to array and sort
    return Array.from(messageMap.values())
      // Remove duplicates that might have been added under both id and tempId
      .filter((msg, index, self) => 
        self.findIndex(m => m.id === msg.id || m.tempId === msg.tempId) === index
      )
      .sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
  })();

  // Debug log to track message deduplication
  useEffect(() => {
    console.log('Message state:', {
      replies: replies.map(r => ({ id: r.id, tempId: r.tempId, content: r.content })),
      wsMessages: wsMessages
        .filter(m => m.channel_id === parentMessage.channel_id || m.parent_id === parentMessage.id)
        .map(m => ({ id: m.id, tempId: m.tempId, content: m.content })),
      allReplies: allReplies.map(r => ({ id: r.id, tempId: r.tempId, content: r.content }))
    });
  }, [replies, wsMessages, allReplies, parentMessage.channel_id, parentMessage.id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, allReplies.length]);

  // Invalidate queries on WebSocket messages, but with debounce
  useEffect(() => {
    const hasNewMessages = wsMessages.some(msg => {
      if (mode === 'dm') {
        return msg.channel_id === parentMessage.channel_id &&
          !replies.some(reply => reply.id === msg.id || reply.tempId === msg.tempId);
      }
      return msg.parent_id === parentMessage.id &&
        !replies.some(reply => reply.id === msg.id || reply.tempId === msg.tempId);
    });

    const hasModifiedMessages = wsMessages.some(msg => 
      msg.type === 'message_deleted' || msg.type === 'message_edited'
    );

    if (hasNewMessages || hasModifiedMessages) {
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: mode === 'dm'
            ? [`/api/dm/channels/${parentMessage.channel_id}/messages`, mode]
            : [`/api/messages/${parentMessage.id}/replies`, mode]
        });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [wsMessages, parentMessage.id, parentMessage.channel_id, mode, queryClient, replies]);

  const formatTimestamp = (date: string | Date | null) => {
    if (!date) return '';
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      return dateObj.toLocaleTimeString();
    } catch {
      return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl min-h-[50vh] max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle>{mode === 'dm' ? 'Direct Message' : 'Thread'}</DialogTitle>
          <DialogDescription>
            {mode === 'dm' 
              ? `Conversation with ${parentMessage.author?.username || 'Loading...'}`
              : `Message thread started by ${parentMessage.author?.username || 'Loading...'}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 flex flex-col min-h-0">
          {mode === 'thread' && (
            <>
              <div className="p-4 flex-shrink-0">
                <div className="flex gap-4">
                  <Avatar>
                    <AvatarImage src={parentMessage.author?.avatar_url || undefined} />
                    <AvatarFallback>
                      {parentMessage.author?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
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
              <Separator className="flex-shrink-0" />
            </>
          )}
          <ScrollArea className="flex-1 p-4 overflow-y-auto">
            <div className="flex flex-col gap-4 min-h-0">
              {allReplies.map((reply) => (
                <div key={reply.id} className="flex gap-4">
                  <Avatar>
                    <AvatarImage src={reply.author?.avatar_url || undefined} />
                    <AvatarFallback>
                      {reply.author?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 group">
                      <span className="font-semibold text-sm">{reply.author?.username}</span>
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
                              if (window.confirm('Are you sure you want to delete this message?')) {
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
                      <>
                        <p className="text-sm mt-1">{reply.content}</p>
                        {reply.attachments && reply.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {reply.attachments
                                .filter(file => file.file_type?.startsWith('image/'))
                                .map((file, index) => (
                                  <div key={index} className="relative group">
                                    <a
                                      href={file.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block hover:opacity-90 transition-opacity"
                                    >
                                      <img
                                        src={file.file_url}
                                        alt={file.file_name}
                                        className="rounded-md max-h-48 object-cover"
                                      />
                                    </a>
                                  </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {reply.attachments
                                .filter(file => !file.file_type?.startsWith('image/'))
                                .map((file, index) => (
                                  <div key={index} className="relative group">
                                    <a
                                      href={file.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                                    >
                                      <PaperclipIcon className="h-4 w-4" />
                                      <span className="truncate max-w-[200px]">
                                        {file.file_name}
                                      </span>
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <div className="p-4 border-t flex-shrink-0">
            <ChatInput 
              channelId={parentMessage.channel_id}
              parentMessageId={mode === 'thread' ? parentMessage.id : undefined}
              placeholder={mode === 'dm' ? "Type a message..." : "Reply to thread..."}
              onSend={async (content, files) => {
                const tempId = crypto.randomUUID();
                
                // Upload files if any
                let attachments = [];
                if (files.length > 0) {
                  const formData = new FormData();
                  files.forEach((file) => {
                    formData.append('files', file);
                  });

                  const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                  });

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'File upload failed');
                  }

                  attachments = await response.json();
                }
                
                send({
                  type: 'message',
                  channelId: parentMessage.channel_id,
                  content: content || "(attachment)",
                  tempId,
                  attachments,
                  parentId: mode === 'thread' ? parentMessage.id : undefined
                });
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}