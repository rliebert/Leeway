import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, ChevronRight, ChevronDown } from "lucide-react";
import type { Channel } from "@db/schema";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center gap-2 p-4 font-semibold text-lg group"
          >
            <div className="flex items-center gap-2 relative">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 transition-transform" />
              ) : (
                <ChevronRight className="h-4 w-4 transition-transform" />
              )}
              <span>Channels</span>
              <ChevronDown 
                className={cn(
                  "h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity absolute -right-6",
                  { "rotate-180": !isOpen }
                )} 
              />
            </div>
          </Button>
        </CollapsibleTrigger>
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