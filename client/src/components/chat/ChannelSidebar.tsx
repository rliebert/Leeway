import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, ChevronDown } from "lucide-react";
import type { Channel } from "@db/schema";
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

interface ChannelSidebarProps {
  selectedChannel: number;
  onSelectChannel: (id: number) => void;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: ChannelSidebarProps) {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });
  const [isOpen, setIsOpen] = useState(true);

  const selectedChannelData = channels?.find(channel => channel.id === selectedChannel);

  return (
    <ScrollArea className="flex-1">
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
                <span>Channels</span>
                <ChevronDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem>
                Create New Channel
              </DropdownMenuItem>
              <DropdownMenuItem>
                Create New Section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Selected channel always visible */}
        {!isOpen && selectedChannelData && (
          <div className="px-2 mt-2">
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2",
                "bg-accent text-accent-foreground"
              )}
              onClick={() => onSelectChannel(selectedChannelData.id)}
            >
              <Hash className="h-4 w-4" />
              {selectedChannelData.name}
            </Button>
          </div>
        )}

        {/* Other channels in collapsible content */}
        <CollapsibleContent className="px-2">
          {channels?.map((channel) => {
            if (!isOpen && channel.id === selectedChannel) {
              return null; // Skip selected channel as it's shown above
            }
            return (
              <Button
                key={channel.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-2",
                  channel.id === selectedChannel && "bg-accent text-accent-foreground"
                )}
                onClick={() => onSelectChannel(channel.id)}
              >
                <Hash className="h-4 w-4" />
                {channel.name}
              </Button>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </ScrollArea>
  );
}