import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Plus, User, Search, Loader2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DirectMessageChannel, User as UserType } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "use-debounce";

interface DirectMessageSidebarProps {
  selectedDM: number | null;
  onSelectDM: (id: number) => void;
}

export default function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showNewDMDialog, setShowNewDMDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dmChannels, isLoading: loadingChannels } = useQuery<DirectMessageChannel[]>({
    queryKey: ["/api/dm/channels"],
    enabled: !!user,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery<UserType[]>({
    queryKey: ["/api/dm/users/search", { query: debouncedQuery }],
    enabled: !!debouncedQuery && showNewDMDialog,
  });

  const createDMMutation = useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dm/channels"] });
      setShowNewDMDialog(false);
      setSearchQuery("");
      toast({ description: "Direct message channel created" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const handleCreateDM = async (userId: number) => {
    try {
      await createDMMutation.mutateAsync(userId);
    } catch (error) {
      console.error("Failed to create DM:", error);
    }
  };

  return (
    <>
      <ScrollArea className="flex-1">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center px-4">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
              >
                <svg
                  className={cn(
                    "h-3 w-3 transition-transform fill-current",
                    !isOpen && "-rotate-90"
                  )}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 21L2 6h20L12 21z" />
                </svg>
              </Button>
            </CollapsibleTrigger>
            <div className="flex-1 flex">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="px-2 font-semibold text-lg group relative inline-flex items-center"
                  >
                    <span>Direct Messages</span>
                    <ChevronDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => setShowNewDMDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Direct Message
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <CollapsibleContent className="space-y-4 mt-2">
            {loadingChannels ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <div className="px-2">
                {/* Add self-message option if not already in DM list */}
                {!dmChannels?.some(channel => 
                  channel.participants?.some(p => p.id === user?.id) &&
                  channel.participants?.length === 1
                ) && (
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2",
                      selectedDM === user?.id && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => handleCreateDM(user!.id)}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user?.avatar || undefined} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    {user?.username} (You)
                  </Button>
                )}

                {dmChannels?.map((channel) => {
                  const otherUser = channel.participants?.find(p => p.id !== user?.id);
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
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>

      <Dialog open={showNewDMDialog} onOpenChange={setShowNewDMDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Direct Message</DialogTitle>
            <DialogDescription>
              Search for a user to start a conversation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
            </div>
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
                searchResults?.map((searchUser) => (
                  <Button
                    key={searchUser.id}
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => handleCreateDM(searchUser.id)}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={searchUser.avatar || undefined} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    {searchUser.username}
                    {searchUser.id === user?.id && " (You)"}
                  </Button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}