import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, MessageSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import ThreadModal from './ThreadModal';
import { useWS } from "@/lib/ws";

interface DirectMessageSidebarProps {
  selectedDM: string | null;
  onSelectDM: (userId: string) => void;
}

interface DMChannel {
  id: string;
  created_at: string;
  last_read?: string;
  initiator_id: string;
  invited_user_id: string;
  order_index: number;
  members: {
    user_id: string;
    channel_id: string;
    created_at: string;
  }[];
}

interface DMChannelResponse {
  dm_channels: {
    id: string;
    created_at: string;
    last_read?: string;
    initiator_id: string;
    invited_user_id: string;
    order_index: number;
    members: {
      user_id: string;
      channel_id: string;
      created_at: string;
    }[];
  };
  channel_subscriptions: {
    id: string;
    user_id: string;
    channel_id: string | null;
    dm_channel_id: string;
    subscribed_at: string;
  };
}

function isUserOnline(lastActive: Date | string | null) {
  if (!lastActive) return false;
  const lastActiveDate = new Date(lastActive);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastActiveDate > fiveMinutesAgo;
}

export function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isThreadModalOpen, setIsThreadModalOpen] = useState(false);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const { messages: wsMessages } = useWS();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: dmChannelsData = [] } = useQuery<DMChannelResponse[]>({
    queryKey: ["/api/dm/channels"],
    select: (channels) => {
      console.log('DM Channel Response:', JSON.stringify(channels, null, 2));
      return channels;
    }
  });

  // Extract channels and map to the format we need
  const dmChannels = dmChannelsData.map(data => data.dm_channels);

  const createDMMutation = useMutation({
    mutationFn: async (userId: string) => {
      try {
        // First check if a channel already exists with this user
        const existingChannel = dmChannels.find(channel =>
          channel.members?.some(member => member.user_id === userId)
        );

        if (existingChannel) {
          return existingChannel;
        }

        // Create a new DM channel
        const createResponse = await fetch("/api/dm/channels", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ invitedUserId: userId }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(errorData.error || "Failed to create DM channel");
        }

        return createResponse.json();
      } catch (error) {
        console.error("[DM] Request error:", error);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Failed to handle DM channel creation");
      }
    },
    onSuccess: (data) => {
      if (data?.id) {
        handleSelectDM(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/dm/channels"] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create DM channel",
        variant: "destructive",
      });
    }
  });

  const sortedUsers = [...users].filter(Boolean);
  if (currentUser) {
    const currentUserIndex = sortedUsers.findIndex(u => u.id === currentUser.id);
    if (currentUserIndex !== -1) {
      const [user] = sortedUsers.splice(currentUserIndex, 1);
      sortedUsers.unshift(user);
    }
  }

  const handleSelectDM = (channelId: string) => {
    console.log('Selecting DM channel:', {
      channelId,
      channel: dmChannels.find(c => c.id === channelId),
      channelData: dmChannelsData.find(c => c.dm_channels.id === channelId)
    });
    setCurrentChannelId(channelId);
    setIsThreadModalOpen(true);
  };

  // Get the other user's info for the selected channel
  const getOtherUserFromChannel = (channelId: string | null) => {
    if (!channelId) return undefined;
    const channelData = dmChannelsData.find(c => c.dm_channels.id === channelId);
    
    if (!channelData) return undefined;
    
    // Get the ID of the other user (either initiator or invited user)
    const otherUserId = channelData.dm_channels.initiator_id === currentUser?.id
      ? channelData.dm_channels.invited_user_id
      : channelData.dm_channels.initiator_id;
    
    // Look up the user info from the users list
    const otherUser = users.find(u => u.id === otherUserId);
    
    console.log('Looking up other user:', {
      channelId,
      channelData,
      otherUserId,
      otherUser,
      currentUserId: currentUser?.id
    });
    
    return otherUser;
  };

  const otherUser = getOtherUserFromChannel(currentChannelId);
  const channel = currentChannelId ? 
    dmChannelsData.find(c => c.dm_channels.id === currentChannelId)?.dm_channels 
    : null;

  console.log('Channel lookup:', {
    currentChannelId,
    otherUser,
    channel,
    dmChannelsData
  });

  return (
    <div className="flex flex-col space-y-2">
      <div className="flex items-center px-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 p-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown className={cn(
            "h-3 w-3 transition-transform",
            !isExpanded && "-rotate-90"
          )} />
        </Button>
        <span className="text-lg font-semibold ml-2">Direct Messages</span>
      </div>

      {isExpanded && (
        <ScrollArea className="flex-1">
          <div className="space-y-1 px-2">
            {sortedUsers.map((user) => {
              const isOnline = isUserOnline(user.last_active);
              const isSelf = user.id === currentUser?.id;
              const existingChannel = dmChannels.find(
                (channel) => channel.members?.some((member) => member.user_id === user.id)
              );

              // Check for unread messages in this channel
              const hasUnreadMessages = wsMessages.some(msg => 
                msg.channel_id === existingChannel?.id && 
                msg.user_id !== currentUser?.id &&
                new Date(msg.created_at) > new Date(existingChannel?.last_read || 0)
              );

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    if (!isSelf) {
                      if (existingChannel) {
                        handleSelectDM(existingChannel.id);
                      } else {
                        createDMMutation.mutate(user.id);
                      }
                    }
                  }}
                  className={cn(
                    "w-full text-left flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 group cursor-pointer",
                    existingChannel && selectedDM === existingChannel.id && "bg-accent"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {user.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center gap-2">
                        {user.username}
                        {isSelf && " (you)"}
                        {hasUnreadMessages && (
                          <span className="w-2 h-2 bg-primary rounded-full" />
                        )}
                      </span>
                      {isSelf && (
                        <span className="text-xs text-muted-foreground">
                          Note to self
                        </span>
                      )}
                    </div>
                  </div>
                  {!isSelf && (
                    <MessageSquare className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}

      <ThreadModal
        open={isThreadModalOpen}
        onOpenChange={setIsThreadModalOpen}
        parentMessage={{
          id: currentChannelId || '',
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
          content: '', 
          created_at: channel?.created_at ? new Date(channel.created_at) : new Date(),
          channel_id: currentChannelId || '',
          user_id: otherUser?.id || '',
          pinned_by: null,
          pinned_at: null,
          parent_id: null
        }}
        mode="dm"
      />
    </div>
  );
}