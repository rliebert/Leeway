import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, MessageSquare } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { User, DMChannel } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

interface DirectMessageSidebarProps {
  selectedDM: number | null;
  onSelectDM: (id: number) => void;
}

export default function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { user: currentUser } = useUser();
  const { toast } = useToast();

  // Fetch all users
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser,
  });

  // Fetch all DM channels
  const { data: dmChannels = [] } = useQuery<DMChannel[]>({
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
    onError: (error) => {
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

  // Helper function to get DM channel with a user
  const getDMChannelWithUser = (userId: number) => {
    return dmChannels.find(
      channel => 
        (channel.user1Id === userId && channel.user2Id === currentUser?.id) ||
        (channel.user1Id === currentUser?.id && channel.user2Id === userId)
    );
  };

  return (
    <ScrollArea className="flex-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center px-4">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0"
            >
              <ChevronDown className={cn(
                "h-3 w-3 transition-transform",
                !isOpen && "-rotate-90"
              )} />
            </Button>
          </CollapsibleTrigger>
          <div className="flex-1">
            <h2 className="px-2 font-semibold text-lg">
              Users
            </h2>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 mt-2">
          <div className="px-2 space-y-1">
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
                    <span className="font-medium">
                      {user.username}
                      {user.id === currentUser?.id && " (You)"}
                    </span>
                  </div>
                  {user.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        const existingChannel = getDMChannelWithUser(user.id);
                        if (existingChannel) {
                          onSelectDM(existingChannel.id);
                        } else {
                          createDMMutation.mutate(user.id);
                        }
                      }}
                    >
                      <MessageSquare className={cn(
                        "h-4 w-4",
                        getDMChannelWithUser(user.id)?.id === selectedDM ? "text-primary" : "text-muted-foreground"
                      )} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </ScrollArea>
  );
}