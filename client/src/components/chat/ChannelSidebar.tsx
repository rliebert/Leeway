import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { ChevronRight, Hash, MoreVertical, Plus, Pencil, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["/api/sections"],
  });

  const [channelFormData, setChannelFormData] = useState<{
    name: string;
    description?: string;
    section_id?: string | null;
  }>({
    name: "",
  });

  // Reset form when dialog closes
  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setChannelFormData({ name: "" });
      setEditingChannel(null);
    }
    setIsDialogOpen(open);
  };

  const handleEditChannel = (channel: Channel) => {
    setEditingChannel(channel);
    setChannelFormData({
      name: channel.name,
      description: channel.description || "",
      section_id: channel.section_id,
    });
    setIsDialogOpen(true);
  };

  const createChannelMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; section_id?: string | null }) => {
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
      setIsDialogOpen(false);
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Channel> }) => {
      const response = await fetch(`/api/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Channel updated successfully" });
      setIsDialogOpen(false);
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/channels/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Channel deleted successfully" });
    },
  });

  const handleSaveChannel = () => {
    if (!channelFormData.name.trim()) {
      toast({ variant: "destructive", description: "Channel name is required" });
      return;
    }

    if (editingChannel) {
      updateChannelMutation.mutate({
        id: editingChannel.id,
        data: channelFormData,
      });
    } else {
      createChannelMutation.mutate(channelFormData);
    }
  };

  const handleDeleteChannel = (channelId: string) => {
    if (window.confirm("Are you sure you want to delete this channel?")) {
      deleteChannelMutation.mutate(channelId);
      if (selectedChannel === channelId) {
        onSelectChannel("");
      }
    }
  };

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
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingChannel ? 'Edit Channel' : 'Create New Channel'}
              </DialogTitle>
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
              <Button onClick={handleSaveChannel} className="w-full">
                {editingChannel ? 'Update Channel' : 'Create Channel'}
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
                onEdit={() => handleEditChannel(channel)}
                onDelete={() => handleDeleteChannel(channel.id)}
                isCreator={channel.creator_id === user?.id}
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
                    onEdit={() => handleEditChannel(channel)}
                    onDelete={() => handleDeleteChannel(channel.id)}
                    isCreator={channel.creator_id === user?.id}
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
  onEdit: () => void;
  onDelete: () => void;
  isCreator: boolean;
}

function ChannelItem({ channel, isSelected, onSelect, onEdit, onDelete, isCreator }: ChannelItemProps) {
  return (
    <div
      className={`group flex items-center px-2 h-8 rounded-md cursor-pointer hover:bg-accent/50 ${
        isSelected ? 'bg-accent' : ''
      }`}
      onClick={() => onSelect(channel.id.toString())}
    >
      <Hash className="h-4 w-4 mr-2 text-muted-foreground" />
      <span className="flex-1">{channel.name}</span>
      {isCreator && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}