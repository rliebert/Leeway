import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash } from "lucide-react";
import type { Channel } from "@db/schema";

interface ChannelSidebarProps {
  selectedChannel: number;
  onSelectChannel: (id: number) => void;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: ChannelSidebarProps) {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  return (
    <div className="w-64 border-r bg-sidebar">
      <div className="p-4 font-semibold text-lg border-b">Channels</div>
      <ScrollArea className="h-[calc(100vh-65px)]">
        <div className="p-2">
          {channels?.map((channel) => (
            <Button
              key={channel.id}
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2",
                selectedChannel === channel.id && "bg-sidebar-accent"
              )}
              onClick={() => onSelectChannel(channel.id)}
            >
              <Hash className="h-4 w-4" />
              {channel.name}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
