import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, ChevronDown, Plus, Settings, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel } from "@db/schema";
import { useUser } from "@/hooks/use-user";

interface ChannelSidebarProps {
  selectedChannel: number;
  onSelectChannel: (id: number) => void;
}

interface ChannelFormData {
  name: string;
  description?: string;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: ChannelSidebarProps) {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });
  const [isOpen, setIsOpen] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState<ChannelFormData>({ name: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const selectedChannelData = channels?.find(channel => channel.id === selectedChannel);

  const createChannelMutation = useMutation({
    mutationFn: async (data: ChannelFormData) => {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setShowCreateDialog(false);
      setFormData({ name: "" });
      toast({ description: "Channel created successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ChannelFormData }) => {
      const response = await fetch(`/api/channels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setShowEditDialog(false);
      setEditingChannel(null);
      setFormData({ name: "" });
      toast({ description: "Channel updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/channels/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Channel deleted successfully" });
      // Select first available channel after deletion
      const remainingChannels = channels?.filter(c => c.id !== selectedChannel);
      if (remainingChannels?.length) {
        onSelectChannel(remainingChannels[0].id);
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const handleCreateChannel = () => {
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Channel name is required",
      });
      return;
    }
    createChannelMutation.mutate(formData);
  };

  const handleUpdateChannel = () => {
    if (!editingChannel) return;
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Channel name is required",
      });
      return;
    }
    updateChannelMutation.mutate({ id: editingChannel.id, data: formData });
  };

  const handleDeleteChannel = (channelId: number) => {
    if (confirm("Are you sure you want to delete this channel? This action cannot be undone.")) {
      deleteChannelMutation.mutate(channelId);
    }
  };

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
                  <span>Channels</span>
                  <ChevronDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => {
                  setFormData({ name: "" });
                  setShowCreateDialog(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Channel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Selected channel always visible */}
        {!isOpen && selectedChannelData && (
          <div className="px-2">
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
              <div key={channel.id} className="group relative">
                <Button
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
                {channel.creator?.id === user?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 h-8 w-8"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => {
                        setEditingChannel(channel);
                        setFormData({
                          name: channel.name,
                          description: channel.description || "",
                        });
                        setShowEditDialog(true);
                      }}>
                        <Settings className="mr-2 h-4 w-4" />
                        Edit Channel
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteChannel(channel.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Channel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {/* Create Channel Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Channel</DialogTitle>
            <DialogDescription>
              Add a new channel to your server
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Channel Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. announcements"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What's this channel about?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChannel}>
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Channel Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Channel</DialogTitle>
            <DialogDescription>
              Modify channel settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Channel Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateChannel}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}