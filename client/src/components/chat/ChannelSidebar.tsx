import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { ChevronRight, Hash, MoreVertical, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  selectedChannel: string;
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["/api/sections"],
  });

  const [channelFormData, setChannelFormData] = useState<{
    name: string;
    description?: string;
    section_id?: number;
  }>({
    name: "",
  });

  const handleCreateChannel = () => {
    if (!channelFormData.name.trim()) {
      toast({ variant: "destructive", description: "Channel name is required" });
      return;
    }
    createChannelMutation.mutate(channelFormData);
    setChannelFormData({ name: "" });
    setIsDialogOpen(false);
  };

  const createChannelMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; section_id?: number }) => {
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

  const channelsBySection = channels?.reduce((acc, channel) => {
    const sectionId = channel.section_id || 'uncategorized';
    if (!acc[sectionId]) {
      acc[sectionId] = [];
    }
    acc[sectionId].push(channel);
    return acc;
  }, {} as Record<string | number, Channel[]>);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12">
        <div 
          className="flex items-center flex-1 cursor-pointer hover:bg-accent/50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronRight className={`h-4 w-4 mr-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          <span className="font-medium">Channels</span>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Channel Name</Label>
                <Input
                  id="name"
                  value={channelFormData.name}
                  onChange={(e) => setChannelFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. announcements"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={channelFormData.description || ''}
                  onChange={(e) => setChannelFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What's this channel about?"
                />
              </div>
              <Button onClick={handleCreateChannel} className="w-full">
                Create Channel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isExpanded && (
        <ScrollArea className="flex-1">
          <div className="px-1 py-2">
            {/* Uncategorized channels */}
            {channelsBySection?.uncategorized?.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isSelected={selectedChannel === channel.id.toString()}
                onSelect={onSelectChannel}
              />
            ))}

            {/* Sections with their channels */}
            {sections?.map((section) => (
              <div key={section.id} className="mt-4">
                <div className="flex items-center px-2 mb-1">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  <span className="text-sm font-medium">{section.name}</span>
                </div>
                {channelsBySection?.[section.id]?.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isSelected={selectedChannel === channel.id.toString()}
                    onSelect={onSelectChannel}
                  />
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

interface ChannelItemProps {
  channel: Channel;
  isSelected: boolean;
  onSelect: (channelId: string) => void;
}

function ChannelItem({ channel, isSelected, onSelect }: ChannelItemProps) {
  return (
    <div
      className={`group flex items-center px-2 h-8 rounded-md cursor-pointer hover:bg-accent/50 ${
        isSelected ? 'bg-accent' : ''
      }`}
      onClick={() => onSelect(channel.id.toString())}
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
  );
}