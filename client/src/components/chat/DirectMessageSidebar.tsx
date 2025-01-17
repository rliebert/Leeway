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

interface DirectMessageSidebarProps {
  selectedDM: string | null;
  onSelectDM: (userId: string) => void;
}

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
  const [isExpanded, setIsExpanded] = useState(true);
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: dmChannels = [] } = useQuery<DMChannel[]>({
    queryKey: ["/api/dm/channels"],
  });

  const createDMMutation = useMutation({
    mutationFn: async (userId: string) => {
      try {
        // First check if DM channel exists
        const checkResponse = await fetch(`/api/dm/channels/${userId}`, {
          method: "GET",
          headers: { 
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        const responseData = await checkResponse.json();

        if (checkResponse.ok && responseData.id) {
          return responseData;
        }

        // If channel doesn't exist, create a new one
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
        onSelectDM(data.id);
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

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    if (!isSelf) {
                      if (existingChannel) {
                        onSelectDM(existingChannel.id);
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