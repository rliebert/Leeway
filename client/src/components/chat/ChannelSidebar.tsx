import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { ChevronDown, ChevronRight, Hash, MoreVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Props {
  selectedChannel: string;
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isCreateSectionOpen, setIsCreateSectionOpen] = useState(false);

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
    setIsCreateChannelOpen(false);
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
      <div className="flex items-center px-3 h-12">
        <div className="flex items-center flex-1 group">
          <Button
            variant="ghost"
            size="sm"
            className="p-0 hover:bg-transparent"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 mr-1" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-1" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="px-2 hover:bg-accent/50 font-medium"
              >
                Channels
                <ChevronDown className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setIsCreateChannelOpen(true)}>
                Create New Channel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsCreateSectionOpen(true)}>
                Create New Section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
      <Dialog open={isCreateChannelOpen} onClose={() => setIsCreateChannelOpen(false)}>
        <DialogHeader>
          <DialogTitle>Create New Channel</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <Label htmlFor="name">Name</Label>
          <Input id="name" type="text" value={channelFormData.name} onChange={(e) => setChannelFormData({...channelFormData, name: e.target.value})} />
          <Button onClick={handleCreateChannel}>Create</Button>
        </DialogContent>
      </Dialog>
      {/* Add Create Section Dialog here -  This is placeholder,  you need to implement this part based on your existing create section form.*/}
      <Dialog open={isCreateSectionOpen} onClose={() => setIsCreateSectionOpen(false)}>
          {/* Add your Create Section Form Here */}
      </Dialog>
    </div>
  );
}