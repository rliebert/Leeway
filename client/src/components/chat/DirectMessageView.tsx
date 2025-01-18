import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Message, User } from "@db/schema";
import MessageComponent from "./Message";
import ChatInput from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useWS } from "@/lib/ws";
import ThreadModal from './ThreadModal';

interface DirectMessageChannel {
  id: string;
  created_at: string;
  initiator_id: string;
  invited_user_id: string;
  order_index: number;
  subscriptions: {
    id: string;
    user_id: string;
    dm_channel_id: string;
    subscribed_at: string;
  }[];
}

interface ThreadMessage {
  id: string;
  created_at: Date | null;
  content: string;
  channel_id: string;
  dm_channel_id: string | null;
  user_id: string;
  pinned_by: string | null;
  pinned_at: Date | null;
  parent_id: string | null;
  author?: {
    id: string;
    username: string;
    avatar_url: string | null;
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
    id: string;
    created_at: Date | null;
    message_id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    url: string;
    originalName: string;
    mimetype: string;
  }>;
}

interface DirectMessageViewProps {
  channelId: string;
}

export default function DirectMessageView({ channelId }: DirectMessageViewProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { messages: wsMessages, send, subscribe, unsubscribe } = useWS();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isThreadModalOpen, setIsThreadModalOpen] = useState(false);

  const { data: channel, isError, error } = useQuery<DirectMessageChannel, Error>({
    queryKey: [`/api/dm/channels/${channelId}`],
    enabled: !!channelId,
    retry: (failureCount: number, error: Error) => {
      // Only retry if it's not a 404
      return failureCount < 3 && !error.message.includes("404");
    }
  });

  // Get the other user's data
  const { data: otherUser } = useQuery<User>({
    queryKey: [`/api/users/${channel?.initiator_id === user?.id ? channel?.invited_user_id : channel?.initiator_id}`],
    enabled: !!channel && !!user,
  });

  // Get messages for this channel
  const { data: channelMessages = [] } = useQuery<Message[]>({
    queryKey: [`/api/dm/channels/${channelId}/messages`],
    enabled: !!channelId,
  });

  useEffect(() => {
    if (isError && error) {
      console.error("Error fetching DM channel:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to load DM channel",
      });
      // Only redirect on critical errors, not on expected cases like 404
      if (!error.message.includes("404")) {
        setLocation("/");
      }
    }
  }, [isError, error, toast, setLocation]);

  // Get the other user's ID from the channel data
  const otherUserId = channel ? 
    channel.initiator_id === user?.id ? channel.invited_user_id : channel.initiator_id 
    : null;

  useEffect(() => {
    if (!channelId || isSubscribed) return;

    console.log(`[DM] Subscribing to channel: ${channelId}`);
    subscribe(channelId);
    setIsSubscribed(true);

    return () => {
      if (isSubscribed) {
        console.log(`[DM] Unsubscribing from channel: ${channelId}`);
        unsubscribe(channelId);
        setIsSubscribed(false);
      }
    };
  }, [channelId, subscribe, unsubscribe, isSubscribed]);

  useEffect(() => {
    if (channel) {
      setIsThreadModalOpen(true);
    }
  }, [channel]);

  const handleSendMessage = async (content: string) => {
    if (!user || !content.trim()) return;

    try {
      send({
        type: 'message',
        channelId: channelId,
        content: content.trim()
      });
    } catch (error) {
      console.error("[DM] Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
    }
  };

  // Transform websocket messages to include full user information
  const allMessages = [...channelMessages, ...wsMessages
    .filter(msg => msg.channel_id === channelId)
    .map(msg => ({
      ...msg,
      created_at: new Date(msg.created_at),
      pinned_at: msg.pinned_at ? new Date(msg.pinned_at) : null,
      author: otherUser && msg.user_id === otherUser.id ? {
        id: otherUser.id,
        username: otherUser.username,
        avatar_url: otherUser.avatar_url,
        email: otherUser.email,
        password: otherUser.password,
        full_name: otherUser.full_name,
        status: otherUser.status,
        last_active: otherUser.last_active,
        created_at: otherUser.created_at,
        role: otherUser.role,
        is_admin: otherUser.is_admin,
      } : user && msg.user_id === user.id ? {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        email: user.email,
        password: user.password,
        full_name: user.full_name,
        status: user.status,
        last_active: user.last_active,
        created_at: user.created_at,
        role: user.role,
        is_admin: user.is_admin,
      } : {
        id: msg.user_id,
        username: "Unknown User",
        email: "",
        password: "",
        avatar_url: null,
        full_name: null,
        status: null,
        last_active: null,
        created_at: null,
        role: "user",
        is_admin: false,
      }
    }))];

  if (!channel || !otherUserId || !otherUser) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const parentMessage: ThreadMessage = {
    id: channelId,
    user_id: otherUserId,
    content: '', // Empty content for DM view
    created_at: channel ? new Date(channel.created_at) : null,
    channel_id: channelId,
    dm_channel_id: channelId,
    pinned_by: null,
    pinned_at: null,
    parent_id: null,
    author: otherUser ? {
      id: otherUser.id,
      username: otherUser.username,
      avatar_url: otherUser.avatar_url,
      email: otherUser.email,
      password: otherUser.password,
      full_name: otherUser.full_name,
      status: otherUser.status,
      last_active: otherUser.last_active,
      created_at: otherUser.created_at,
      role: otherUser.role,
      is_admin: otherUser.is_admin
    } : undefined,
    attachments: [] as Array<{
      id: string;
      created_at: Date | null;
      message_id: string;
      file_url: string;
      file_name: string;
      file_type: string;
      file_size: number;
      url: string;
      originalName: string;
      mimetype: string;
    }>
  };

  return (
    <div className="flex-1 flex flex-col">
      {isThreadModalOpen ? (
        <ThreadModal
          open={isThreadModalOpen}
          onOpenChange={setIsThreadModalOpen}
          mode="dm"
          parentMessage={parentMessage}
        />
      ) : (
        <ChatInput 
          channelId={channelId} 
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
              channelId,
              content: content || "(attachment)",
              tempId,
              attachments
            });
          }}
        />
      )}
    </div>
  );
}