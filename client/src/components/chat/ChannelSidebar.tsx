import { useQuery } from "@tanstack/react-query";
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
    <div className="w-64 border-r bg-sidebar">
      <ScrollArea className="h-full">
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex justify-between items-center p-4 font-semibold text-lg"
            >
              Channels
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", {
                  "transform rotate-180": isOpen,
                })}
              />
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
                    selectedChannel === channel.id && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                  onClick={() => onSelectChannel(channel.id)}
                >
                  <Hash className="h-4 w-4" />
                  {channel.name}
                </Button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>
    </div>
  );
}