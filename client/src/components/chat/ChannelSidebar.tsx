import { useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { ChevronRight, Hash, MoreVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  selectedChannel: string;
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const [channelFormData, setChannelFormData] = useState<{ name: string; description?: string }>({
    name: "",
  });

  const handleCreateChannel = () => {
    if (!channelFormData.name.trim()) {
      toast({ variant: "destructive", description: "Channel name is required" });
      return;
    }
    createChannelMutation.mutate(channelFormData);
    setChannelFormData({ name: "" });
  };

  const createChannelMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Channel created successfully" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div 
        className="flex items-center px-3 h-12 cursor-pointer hover:bg-accent/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronRight className={`h-4 w-4 mr-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span className="font-medium">Channels</span>
      </div>

      {isExpanded && (
        <ScrollArea className="flex-1">
          <div className="px-1 py-2">
            {channels?.map((channel) => (
              <div
                key={channel.id}
                className={`group flex items-center px-2 h-8 rounded-md cursor-pointer hover:bg-accent/50 ${
                  selectedChannel === channel.id.toString() ? 'bg-accent' : ''
                }`}
                onClick={() => onSelectChannel(channel.id.toString())}
              >
                <Hash className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="flex-1">{channel.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}