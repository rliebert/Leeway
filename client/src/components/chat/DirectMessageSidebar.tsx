import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, User, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DirectMessageChannel, User as UserType } from "@db/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DirectMessageSidebarProps {
  selectedDM: number | null;
  onSelectDM: (id: number) => void;
}

export default function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for existing DM channels
  const { data: dmChannels, isLoading: loadingChannels } = useQuery<DirectMessageChannel[]>({
    queryKey: ["/api/dm/channels"],
  });

  // Query for searching users
  const { data: searchResults, isLoading: loadingSearch } = useQuery<UserType[]>({
    queryKey: ["/api/dm/users/search", { query: searchQuery }],
    enabled: searchQuery.length > 0,
  });

  // Mutation for creating a new DM channel
  const createDMChannel = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch("/api/dm/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (newChannel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dm/channels"] });
      setDialogOpen(false);
      setSearchQuery("");
      onSelectDM(newChannel.id);
      toast({
        title: "Direct Message Created",
        description: `Started a conversation with ${newChannel.participants[0]?.username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-4 space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full justify-start">
            <Plus className="mr-2 h-4 w-4" />
            New Direct Message
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Direct Message</DialogTitle>
            <DialogDescription>
              Search for a user to start a conversation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
              autoFocus
            />
            <div className="space-y-2">
              {loadingSearch ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : searchResults?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No users found
                </p>
              ) : (
                searchResults?.map((user) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => createDMChannel.mutate(user.id)}
                    disabled={createDMChannel.isPending}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    {user.username}
                  </Button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* List of existing DM channels */}
      {loadingChannels ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : dmChannels?.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No conversations yet
        </p>
      ) : (
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="space-y-2">
            {dmChannels?.map((channel) => {
              const otherUser = channel.participants?.[0];
              if (!otherUser) return null;

              return (
                <Button
                  key={channel.id}
                  variant={selectedDM === channel.id ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
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
          </div>
        </ScrollArea>
      )}
    </div>
  );
}