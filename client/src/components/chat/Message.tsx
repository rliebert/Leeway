import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply, ChevronDown, ChevronRight, FileIcon, ExternalLink, Trash2, Pencil, Check, X, Smile, Paperclip } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "emoji-picker-react";
import type { Message as MessageType } from "@db/schema";
import { forwardRef, useState, useEffect, useRef } from "react";
import ThreadModal from "./ThreadModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWS } from "@/lib/ws";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

interface FileAttachment {
  id: string;
  url: string;
  originalName: string;
  mimetype: string;
  file_size: number;
  file_url?: string;
  file_type?: string;
}

interface MessageProps {
  message: MessageType & {
    author?: { username: string; avatar_url?: string | null };
    attachments?: FileAttachment[];
  };
}

const Message = forwardRef<HTMLDivElement, MessageProps>(({ message }, ref) => {
  const [showThread, setShowThread] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEditContent, setReplyEditContent] = useState('');
  const queryClient = useQueryClient();
  const { messages: wsMessages, send } = useWS();
  const { user } = useUser();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [deletedAttachments, setDeletedAttachments] = useState<string[]>([]); // Track deleted attachments

  const handleDeleteMessage = async () => {
    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Immediately remove from UI
        queryClient.setQueryData(
          [`/api/channels/${message.channel_id}/messages`],
          (oldData: any) => oldData?.filter((msg: any) => msg.id !== message.id)
        );

        // Notify others via WebSocket
        send({
          type: "message_deleted",
          channelId: message.channel_id || '',
          messageId: message.id
        });

        toast({ description: "Message deleted" });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete message');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      toast({
        variant: "destructive",
        description: "Failed to delete message"
      });
    }
  };

  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Message content updated:`, message.content, 'tempId:', message.tempId);
    setEditContent(message.content);
  }, [message.content]);

  const { data: replies = [] } = useQuery<(MessageType & {
    author?: { username: string; avatar_url?: string | null };
    attachments?: FileAttachment[];
  })[]>({
    queryKey: [`/api/messages/${message.id}/replies`],
    enabled: true,
  });

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

  const [uploadedFiles, setUploadedFiles] = useState<FileAttachment[]>([]);
  
  const normalizeFileUrl = (attachment: FileAttachment): string => {
    if (!attachment) return '';
    
    if (attachment.file_url?.startsWith('http') || attachment.url?.startsWith('http')) {
      return attachment.file_url || attachment.url || '';
    }

    const baseUrl = window.location.origin;
    let fileUrl = attachment.file_url || attachment.url || '';
    fileUrl = fileUrl.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
    return `${baseUrl}/uploads/${fileUrl}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        
        setUploadedFiles([...uploadedFiles, {
          id: data.id,
          url: data.url,
          originalName: file.name,
          mimetype: file.type,
          file_size: file.size,
        }]);
      } catch (error) {
        console.error('Upload error:', error);
      }
    }
    e.target.value = '';
  };

  const isImageFile = (mimetype?: string): boolean => {
    return mimetype ? mimetype.startsWith('image/') : false;
  };

  const formatTimestamp = (date: string | Date | null): string => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString();
  };

  const handleEditReply = async (replyId: string) => {
    if (!replyEditContent.trim()) return;

    try {
      send({
        type: 'message_edited',
        messageId: replyId,
        content: replyEditContent.trim(),
        channelId: message.channel_id || ''
      });

      setEditingReplyId(null);
      setReplyEditContent('');
      toast({ description: "Reply updated" });
    } catch (error) {
      console.error('Error editing reply:', error);
      toast({ 
        variant: "destructive",
        description: "Failed to update reply"
      });
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      const response = await fetch(`/api/messages/${replyId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        queryClient.setQueryData(
          [`/api/messages/${message.id}/replies`],
          (oldReplies: any) => oldReplies?.filter((reply: any) => reply.id !== replyId)
        );

        send({
          type: 'message_deleted',
          channelId: message.channel_id || '',
          messageId: replyId
        });
        toast({ description: "Reply deleted" });
      } else {
        throw new Error('Failed to delete reply');
      }
    } catch (error) {
      console.error('Error deleting reply:', error);
      toast({ 
        variant: "destructive",
        description: "Failed to delete reply"
      });
    }
  };

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);


  const onEmojiClick = (emojiData: any) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = editContent.substring(0, start) + emojiData.emoji + editContent.substring(end);
    setEditContent(newValue);

    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emojiData.emoji.length;
      }
    }, 0);
  };

  const handleEditMessage = async () => {
    if (editContent.trim() === message.content && deletedAttachments.length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      // Check if this is an optimistic message
      const isOptimisticMessage = message.id.length === 36;

      if (isOptimisticMessage) {
        // For optimistic messages, just update the cache and notify via WebSocket
        queryClient.setQueryData(
          [`/api/channels/${message.channel_id}/messages`],
          (oldData: any) => {
            if (!oldData) return [];
            return oldData.map((msg: any) => 
              msg.id === message.id 
                ? { ...msg, content: editContent.trim(), attachments: msg.attachments?.filter(a => !deletedAttachments.includes(a.id))}
                : msg
            );
          }
        );

        send({
          type: "message_edited",
          channelId: message.channel_id || '',
          messageId: message.id,
          content: editContent.trim(),
          deletedAttachments: deletedAttachments,
          attachments: uploadedFiles
        });

        setIsEditing(false);
        toast({ description: "Message updated" });
        return;
      }

      // For real messages, proceed with normal edit
      queryClient.setQueryData(
        [`/api/channels/${message.channel_id}/messages`],
        (oldData: any) => {
          if (!oldData) return [];
          return oldData.map((msg: any) => 
            msg.id === message.id 
              ? { ...msg, content: editContent.trim(), attachments: msg.attachments?.filter(a => !deletedAttachments.includes(a.id))}
              : msg
          );
        }
      );

      send({
        type: "message_edited",
        channelId: message.channel_id || '',
        messageId: message.id,
        content: editContent.trim(),
        deletedAttachments: deletedAttachments
      });

      setIsEditing(false);
      toast({ description: "Message updated" });

    } catch (error) {
      queryClient.invalidateQueries([`/api/channels/${message.channel_id}/messages`]);
      console.error('Error editing message:', error);
      toast({ 
        variant: "destructive",
        description: "Failed to update message"
      });
      setIsEditing(false);
    }
    setDeletedAttachments([]); // Reset after save
  };

  const handleAttachmentDelete = (attachmentId: string) => {
    setDeletedAttachments([...deletedAttachments, attachmentId]);
  };


  return (
    <>
      <div 
        ref={ref} 
        id={`message-${message.id}`}
        className="group hover:bg-muted rounded-lg -mx-4 px-4 py-1.5 transition-all duration-200 ease-in-out"
      >
        <div className="flex gap-4">
          <Avatar className="h-8 w-8 group-hover:ring-2 group-hover:ring-primary transition-all">
            <AvatarImage src={message.author?.avatar_url || undefined} />
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
                {(message.user_id === user?.id || user?.is_admin) && (
                  <>
                    {message.user_id === user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-destructive hover:text-destructive"
                      onClick={handleDeleteMessage}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {isEditing ? (
              <div className="mt-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="file"
                    className="hidden"
                    id={`file-upload-edit-${message.id}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const formData = new FormData();
                        formData.append('file', file);
                        fetch('/api/upload', {
                          method: 'POST',
                          body: formData,
                        })
                          .then((res) => res.json())
                          .then((data) => {
                            // Add the new attachment to the message
                            queryClient.setQueryData(
                              [`/api/channels/${message.channel_id}/messages`],
                              (oldData: any) => {
                                if (!oldData) return [];
                                return oldData.map((msg: any) =>
                                  msg.id === message.id
                                    ? {
                                        ...msg,
                                        attachments: [
                                          ...(msg.attachments || []),
                                          {
                                            id: data.id,
                                            url: data.url,
                                            originalName: file.name,
                                            mimetype: file.type,
                                            file_size: file.size,
                                          },
                                        ],
                                      }
                                    : msg
                                );
                              }
                            );
                          })
                          .catch(error => {
                            console.error('Upload error:', error);
                          });
                      }
                      e.target.value = '';
                    }}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={handleFileUpload}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      document.getElementById(`file-upload-edit-${message.id}`)?.click();
                    }}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-full p-0"
                      side="top"
                      align="start"
                    >
                      <EmojiPicker
                        onEmojiClick={onEmojiClick}
                        width="100%"
                        height="350px"
                      />
                    </PopoverContent>
                  </Popover>
                  <Textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[60px] text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditMessage();
                      }
                      if (e.key === "Escape") {
                        setIsEditing(false);
                        setEditContent(message.content);
                        setDeletedAttachments([]);
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setIsEditing(false);
                      setEditContent(message.content);
                      setDeletedAttachments([]);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={handleEditMessage}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm mt-1 whitespace-pre-wrap">{message.content}</p>
            )}

            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {message.attachments
                    .filter((file: FileAttachment) => !deletedAttachments.includes(file.id) && isImageFile(file.mimetype || file.file_type))
                    .map((file, index) => (
                      <div key={index} className="relative group">
                        <a
                          href={normalizeFileUrl(file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block hover:opacity-90 transition-opacity"
                        >
                          <img
                            src={normalizeFileUrl(file)}
                            alt={file.originalName || file.file_name}
                            className="rounded-md max-h-48 object-cover"
                          />
                        </a>
                        {isEditing && <Button
                          variant="destructive"
                          size="icon"
                          className="h-6 w-6 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleAttachmentDelete(file.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>}
                      </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {message.attachments
                    .filter(file => !deletedAttachments.includes(file.id) && !isImageFile(file.mimetype || file.file_type))
                    .map((file, index) => (
                      <div key={index} className="relative group">
                        <a
                          href={normalizeFileUrl(file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                        >
                          <Paperclip className="h-4 w-4" />
                          <span className="truncate max-w-[200px]">
                            {file.originalName || file.file_name}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {isEditing && <Button
                          variant="destructive"
                          size="icon"
                          className="h-6 w-6 absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleAttachmentDelete(file.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>}
                      </div>
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
                      <AvatarImage src={reply.author?.avatar_url || undefined} />
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
                        {reply.user_id === user?.id && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                              onClick={() => {
                                setEditingReplyId(reply.id);
                                setReplyEditContent(reply.content);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Are you sure you want to delete this reply?')) {
                                  handleDeleteReply(reply.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {editingReplyId === reply.id ? (
                        <div className="mt-1 space-y-2">
                          <Textarea
                            value={replyEditContent}
                            onChange={(e) => setReplyEditContent(e.target.value)}
                            className="min-h-[60px] text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleEditReply(reply.id);
                              }
                              if (e.key === "Escape") {
                                setEditingReplyId(null);
                                setReplyEditContent('');
                              }
                            }}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-7"
                              onClick={() => handleEditReply(reply.id)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7"
                              onClick={() => {
                                setEditingReplyId(null);
                                setReplyEditContent('');
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

                      {reply.attachments && reply.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {reply.attachments
                              .filter((file: FileAttachment) => isImageFile(file.mimetype || file.file_type))
                              .map((file, index) => (
                                <a 
                                  key={index}
                                  href={normalizeFileUrl(file)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block max-w-xs hover:opacity-90 transition-opacity"
                                >
                                  <img
                                    src={normalizeFileUrl(file)}
                                    alt={file.originalName || file.file_name}
                                    className="rounded-md max-h-48 object-cover"
                                  />
                                </a>
                              ))}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {reply.attachments
                              .filter(file => !isImageFile(file.mimetype || file.file_type))
                              .map((file, index) => (
                                <a
                                  key={index}
                                  href={normalizeFileUrl(file)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                                >
                                  <Paperclip className="h-4 w-4" />
                                  {file.originalName || file.file_name}
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
        parentMessage={{
          ...message,
          channel_id: message.channel_id || '',
        }}
      />
    </>
  );
});

Message.displayName = "Message";

export default Message;