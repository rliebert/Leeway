import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, ChevronDown, TriangleRight } from "lucide-react";
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
import { useState } from "react";

interface ChannelSidebarProps {
  selectedChannel: number;
  onSelectChannel: (id: number) => void;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: ChannelSidebarProps) {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });
  const [isOpen, setIsOpen] = useState(true);

  return (
    <ScrollArea className="flex-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <div className="flex items-center px-4">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0"
            >
              <TriangleRight 
                className={cn(
                  "h-3 w-3 transition-transform fill-current",
                  isOpen && "rotate-90"
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="px-2 font-semibold text-lg flex-1 justify-start group"
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
        <CollapsibleContent>
          <div className="px-2">
            {channels?.map((channel) => (
              <Button
                key={channel.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-2",
                  selectedChannel === channel.id && "bg-accent text-accent-foreground"
                )}
                onClick={() => onSelectChannel(channel.id)}
                style={{
                  display: !isOpen && selectedChannel !== channel.id ? 'none' : undefined
                }}
              >
                <Hash className="h-4 w-4" />
                {channel.name}
              </Button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </ScrollArea>
  );
}