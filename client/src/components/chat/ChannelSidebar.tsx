import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, ChevronDown, User, MessageSquare } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { DirectMessageChannel, User as UserType } from "@db/schema";
import { useUser } from "@/hooks/use-user";

interface ChannelSidebarProps {
  selectedChannel: number;
  selectedDM: number | null;
  onSelectChannel: (id: number) => void;
  onSelectDM: (id: number) => void;
}

export default function ChannelSidebar({
  selectedChannel,
  selectedDM,
  onSelectChannel,
  onSelectDM,
}: ChannelSidebarProps) {
  const { user: currentUser } = useUser();
  const { toast } = useToast();
  const [isDMsOpen, setIsDMsOpen] = useState(true);
  const [isUsersOpen, setIsUsersOpen] = useState(true);

  // Fetch users
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser,
  });

  const { data: dmChannels } = useQuery<DirectMessageChannel[]>({
    queryKey: ["/api/dm/channels"],
    enabled: !!currentUser,
  });

  // Create DM channel mutation
  const createDMMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch("/api/dm/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      onSelectDM(data.id);
      return data;
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create chat",
        variant: "destructive",
      });
    },
  });

  // Helper function to check if user is online (active in last 5 minutes)
  function isUserOnline(lastActiveAt: Date | null): boolean {
    if (!lastActiveAt) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastActiveAt) > fiveMinutesAgo;
  }

  // Sort users: online users first, then alphabetically by username
  const sortedUsers = [...users].sort((a, b) => {
    const aIsOnline = isUserOnline(a.lastActiveAt);
    const bIsOnline = isUserOnline(b.lastActiveAt);

    if (aIsOnline && !bIsOnline) return -1;
    if (!aIsOnline && bIsOnline) return 1;

    return a.username.localeCompare(b.username);
  });

  return (
    <div className="w-64 border-r bg-card">
      <ScrollArea className="h-full p-2">
        {/* DMs Section */}
        <Collapsible open={isDMsOpen} onOpenChange={setIsDMsOpen} className="mb-4">
          <div className="flex items-center px-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
              >
                <ChevronDown className={cn(
                  "h-3 w-3 transition-transform",
                  !isDMsOpen && "-rotate-90"
                )} />
              </Button>
            </CollapsibleTrigger>
            <div className="flex-1">
              <h2 className="px-2 font-semibold text-lg flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Direct Messages
              </h2>
            </div>
          </div>

          <CollapsibleContent className="space-y-1 mt-2">
            {dmChannels?.map((channel) => {
              const otherUser = channel.participants?.find(p => p.id !== currentUser?.id);
              if (!otherUser) return null;

              return (
                <Button
                  key={channel.id}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-2",
                    channel.id === selectedDM && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => onSelectDM(channel.id)}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={otherUser.avatar || undefined} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  {otherUser.username}
                </Button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        {/* Users Section */}
        <Collapsible open={isUsersOpen} onOpenChange={setIsUsersOpen}>
          <div className="flex items-center px-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
              >
                <ChevronDown className={cn(
                  "h-3 w-3 transition-transform",
                  !isUsersOpen && "-rotate-90"
                )} />
              </Button>
            </CollapsibleTrigger>
            <div className="flex-1">
              <h2 className="px-2 font-semibold text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                Users
              </h2>
            </div>
          </div>

          <CollapsibleContent className="space-y-1 mt-2">
            {sortedUsers.map((user) => {
              const isOnline = isUserOnline(user.lastActiveAt);

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-accent group"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar || undefined} />
                        <AvatarFallback>
                          {user.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                      )}
                    </div>
                    <span className="font-medium text-sm truncate">
                      {user.username}
                      {user.id === currentUser?.id && " (You)"}
                    </span>
                  </div>
                  {user.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      onClick={() => createDMMutation.mutate(user.id)}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>
    </div>
  );
}