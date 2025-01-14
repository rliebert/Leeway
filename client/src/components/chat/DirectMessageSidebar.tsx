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
  onSelectDM: (id: string) => void;
}

export default function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // First try to get existing DM channel
  const getDMChannel = async (userId: string) => {
    try {
      const response = await fetch(`/api/dm/channels/user/${userId}`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }

      // If no channel exists (404) or other error, return null
      return null;
    } catch (error) {
      console.error('Error getting DM channel:', error);
      return null;
    }
  };

  // Create new DM channel if needed
  const createDMChannel = async (userId: string) => {
    const response = await fetch("/api/dm/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  };

  const handleDMClick = async (userId: string) => {
    if (userId === currentUser?.id) return; // Don't handle self-DMs for now

    try {
      // First try to get existing channel
      let channel = await getDMChannel(userId);

      // If no channel exists, create one
      if (!channel) {
        channel = await createDMChannel(userId);
      }

      // Handle the channel result
      if (channel?.id) {
        onSelectDM(channel.id);
        const newUrl = `/dm/${channel.id}`;
        if (window.location.pathname !== newUrl) {
          window.history.pushState({}, '', newUrl);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/dm/channels"] });
      }
    } catch (error) {
      console.error('Error handling DM:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open DM",
        variant: "destructive",
      });
    }
  };

  function isUserOnline(last_active: Date | null): boolean {
    if (!last_active) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(last_active) > fiveMinutesAgo;
  }

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
    <ScrollArea className="flex-1">
      <div className="p-2">
        <div className="flex items-center px-2 mb-2">
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
          <div className="space-y-1">
            {sortedUsers.map((user) => {
              const isOnline = isUserOnline(user.last_active);
              const isSelf = user.id === currentUser?.id;

              return (
                <div
                  key={user.id}
                  onClick={() => handleDMClick(user.id)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 group cursor-pointer",
                    selectedDM === user.id && "bg-accent"
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDMClick(user.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}