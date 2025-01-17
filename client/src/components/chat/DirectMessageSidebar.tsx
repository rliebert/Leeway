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
import { useLocation } from "wouter";

interface DirectMessageSidebarProps {
  selectedDM: string | null;
  onSelectDM: (userId: string) => void;
}

// Update interface for DM Channel to match API response
interface DMChannel {
  id: string;
  created_at: string;
  members: {
    user_id: string;
    channel_id: string;
    created_at: string;
  }[];
}

function isUserOnline(lastActive: string | null) {
  if (!lastActive) return false;
  const lastActiveDate = new Date(lastActive);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastActiveDate > fiveMinutesAgo;
}

export function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  console.log("[DM] DirectMessageSidebar rendering with props:", { selectedDM, onSelectDM });
  const [isExpanded, setIsExpanded] = useState(true);
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: dmChannels = [] } = useQuery<DMChannel[]>({
    queryKey: ["/api/dm/channels"],
    onSuccess: (data) => {
      console.log('[DM] Channels response:', data);
    }
  });

  const createDMMutation = useMutation({
    mutationFn: async (userId: string) => {
      console.log("[DM] Starting mutation with userId:", userId);
      
      try {
        // First check if DM channel exists
        const checkResponse = await fetch(`https://44735494-6dfc-48b8-8b7b-57eeb25441a5-00-707pakz1pob.kirk.replit.dev/api/channels/dm/${userId}`, {
          method: "GET",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
        });
        
        console.log("[DM] Check response:", {
          status: checkResponse.status,
          headers: Object.fromEntries(checkResponse.headers.entries())
        });
        
        const checkText = await checkResponse.text();
        console.log("[DM] Check response text:", checkText);
        
        // If channel exists, parse and return it
        if (checkResponse.ok && !checkText.startsWith('<!doctype')) {
          try {
            const existingChannel = JSON.parse(checkText);
            console.log("[DM] Found existing channel:", existingChannel);
            return existingChannel;
          } catch (e) {
            console.error("[DM] Failed to parse existing channel:", e);
          }
        }
        
        // If not found or invalid response, create new channel
        const channelName = `dm-${currentUser?.id}-${userId}`.split('-').sort().join('-');
        
        const payload = { 
          type: "dm",
          invitedUserId: userId,
          name: channelName
        };
        console.log("[DM] Creating new channel with payload:", payload);
        
        const createResponse = await fetch("https://44735494-6dfc-48b8-8b7b-57eeb25441a5-00-707pakz1pob.kirk.replit.dev/api/channels", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        
        const responseText = await createResponse.text();
        console.log("[DM] Create response:", {
          status: createResponse.status,
          headers: Object.fromEntries(createResponse.headers.entries()),
          body: responseText
        });
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error("[DM] Failed to parse response:", e);
          throw new Error("Server returned invalid JSON");
        }
        
        if (!createResponse.ok) {
          throw new Error(data.error || "Failed to create channel");
        }
        
        return data;
      } catch (error) {
        console.error("[DM] Request error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("[DM] Success with data:", data);
      if (data?.id) {
        onSelectDM(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/dm/channels"] });
      } else {
        console.error("[DM] Success but no channel ID in response:", data);
      }
    },
    onError: (error: Error) => {
      console.error("[DM] Error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create DM channel",
        variant: "destructive",
      });
    }
  });

  // Sort users and ensure current user is first
  const sortedUsers = [...users].filter(Boolean);
  if (currentUser) {
    const currentUserIndex = sortedUsers.findIndex(u => u.id === currentUser.id);
    if (currentUserIndex !== -1) {
      const [user] = sortedUsers.splice(currentUserIndex, 1);
      sortedUsers.unshift(user);
    }
  }

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
              console.log("[DM] Rendering user:", user.id);
              const isOnline = isUserOnline(user.last_active);
              const isSelf = user.id === currentUser?.id;
              const existingChannel = dmChannels.find(
                (channel) => channel.members?.some((member) => member.user_id === user.id)
              );

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    console.log("[DM] User clicked:", user.id);
                    if (!isSelf) {
                      if (existingChannel) {
                        console.log("[DM] Using existing channel:", existingChannel.id);
                        onSelectDM(existingChannel.id);
                      } else {
                        console.log("[DM] Creating new channel for user:", user.id);
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
                      <span className="font-medium">
                        {user.username}
                        {isSelf && " (you)"}
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
    </div>
  );
}