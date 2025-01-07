import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Plus, User } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import type { DirectMessageChannel } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DirectMessageSidebarProps {
  selectedDM: number | null;
  onSelectDM: (id: number) => void;
}

export default function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { user } = useUser();

  const { data: dmChannels } = useQuery<DirectMessageChannel[]>({
    queryKey: ["/api/dm/channels"],
    enabled: !!user,
  });

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
                <DropdownMenuItem>
                  <Plus className="mr-2 h-4 w-4" />
                  New Direct Message
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 mt-2">
          <div className="px-2">
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
        </CollapsibleContent>
      </Collapsible>
    </ScrollArea>
  );
}
