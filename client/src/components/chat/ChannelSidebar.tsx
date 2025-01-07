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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section } from "@db/schema";
import { useUser } from "@/hooks/use-user";

interface ChannelSidebarProps {
  selectedChannel: number;
  onSelectChannel: (id: number) => void;
}

interface ChannelFormData {
  name: string;
  description?: string;
}

interface SectionFormData {
  name: string;
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: ChannelSidebarProps) {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });
  const { data: sections } = useQuery<Section[]>({
    queryKey: ["/api/sections"],
  });

  const [isChannelsOpen, setIsChannelsOpen] = useState(true);
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateSectionDialog, setShowCreateSectionDialog] = useState(false);
  const [showEditSectionDialog, setShowEditSectionDialog] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [channelFormData, setChannelFormData] = useState<ChannelFormData>({ name: "" });
  const [sectionFormData, setSectionFormData] = useState<SectionFormData>({ name: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const selectedChannelData = channels?.find(channel => channel.id === selectedChannel);

  // Group channels by section
  const channelsBySection = channels?.reduce((acc, channel) => {
    const sectionId = channel.sectionId || 'unsectioned';
    if (!acc[sectionId]) {
      acc[sectionId] = [];
    }
    acc[sectionId].push(channel);
    return acc;
  }, {} as Record<string | number, Channel[]>) || {};

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
      setChannelFormData({ name: "" });
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
      setChannelFormData({ name: "" });
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

  const createSectionMutation = useMutation({
    mutationFn: async (data: SectionFormData) => {
      const response = await fetch("/api/sections", {
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
      queryClient.invalidateQueries({ queryKey: ["/api/sections"] });
      setShowCreateSectionDialog(false);
      setSectionFormData({ name: "" });
      toast({ description: "Section created successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: SectionFormData }) => {
      const response = await fetch(`/api/sections/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/sections"] });
      setShowEditSectionDialog(false);
      setEditingSection(null);
      setSectionFormData({ name: "" });
      toast({ description: "Section updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/sections/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Section deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const updateChannelSectionMutation = useMutation({
    mutationFn: async ({ channelId, sectionId }: { channelId: number; sectionId: number | null }) => {
      const response = await fetch(`/api/channels/${channelId}/section`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Channel moved successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const handleCreateChannel = () => {
    if (!channelFormData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Channel name is required",
      });
      return;
    }
    createChannelMutation.mutate(channelFormData);
  };

  const handleUpdateChannel = () => {
    if (!editingChannel) return;
    if (!channelFormData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Channel name is required",
      });
      return;
    }
    updateChannelMutation.mutate({ id: editingChannel.id, data: channelFormData });
  };

  const handleDeleteChannel = (channelId: number) => {
    if (confirm("Are you sure you want to delete this channel? This action cannot be undone.")) {
      deleteChannelMutation.mutate(channelId);
    }
  };

  const handleCreateSection = () => {
    if (!sectionFormData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Section name is required",
      });
      return;
    }
    createSectionMutation.mutate(sectionFormData);
  };

  const handleUpdateSection = () => {
    if (!editingSection) return;
    if (!sectionFormData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Section name is required",
      });
      return;
    }
    updateSectionMutation.mutate({ id: editingSection.id, data: sectionFormData });
  };

  const handleDeleteSection = (sectionId: number) => {
    if (confirm("Are you sure you want to delete this section? Channels in this section will be moved to Unsectioned.")) {
      deleteSectionMutation.mutate(sectionId);
    }
  };

  const handleMoveChannel = (channelId: number, sectionId: number | null) => {
    updateChannelSectionMutation.mutate({ channelId, sectionId });
  };

  const toggleSection = (sectionId: number | string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const renderChannelList = (channelList: Channel[], sectionId?: number) => {
    return channelList.map((channel) => (
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
                setChannelFormData({
                  name: channel.name,
                  description: channel.description || "",
                });
                setShowEditDialog(true);
              }}>
                <Settings className="mr-2 h-4 w-4" />
                Edit Channel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Select
                  value={channel.sectionId?.toString() || ""}
                  onValueChange={(value) => handleMoveChannel(channel.id, value ? parseInt(value) : null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Move to section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unsectioned</SelectItem>
                    {sections?.map((section) => (
                      <SelectItem key={section.id} value={section.id.toString()}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
    ));
  };

  return (
    <ScrollArea className="flex-1">
      {/* Main Channels Collapsible */}
      <Collapsible open={isChannelsOpen} onOpenChange={setIsChannelsOpen}>
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
                  !isChannelsOpen && "-rotate-90"
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
                  setChannelFormData({ name: "" });
                  setShowCreateDialog(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Channel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSectionFormData({ name: "" });
                  setShowCreateSectionDialog(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Selected channel always visible */}
        {!isChannelsOpen && selectedChannelData && (
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

        {/* Channels in collapsible content */}
        <CollapsibleContent className="space-y-4">
          {/* Unsectioned channels */}
          {channelsBySection.unsectioned?.length > 0 && (
            <div className="px-2">
              <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
                CHANNELS
              </div>
              {renderChannelList(channelsBySection.unsectioned)}
            </div>
          )}

          {/* Sections with their channels */}
          {sections?.map((section) => {
            const sectionChannels = channelsBySection[section.id] || [];
            if (sectionChannels.length === 0) return null;

            return (
              <div key={section.id} className="px-2">
                <Collapsible
                  open={openSections[section.id]}
                  onOpenChange={() => toggleSection(section.id)}
                >
                  <div className="flex items-center px-2 group">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0"
                      >
                        <svg
                          className={cn(
                            "h-3 w-3 transition-transform fill-current",
                            !openSections[section.id] && "-rotate-90"
                          )}
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 21L2 6h20L12 21z" />
                        </svg>
                      </Button>
                    </CollapsibleTrigger>
                    <span className="text-xs font-semibold text-muted-foreground ml-2 flex-1">
                      {section.name.toUpperCase()}
                    </span>
                    {section.creator?.id === user?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          >
                            <Settings className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            setEditingSection(section);
                            setSectionFormData({ name: section.name });
                            setShowEditSectionDialog(true);
                          }}>
                            <Settings className="mr-2 h-4 w-4" />
                            Edit Section
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteSection(section.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Section
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <CollapsibleContent className="mt-1">
                    {renderChannelList(sectionChannels, section.id)}
                  </CollapsibleContent>
                </Collapsible>
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
                value={channelFormData.name}
                onChange={(e) => setChannelFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. announcements"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={channelFormData.description}
                onChange={(e) => setChannelFormData(prev => ({ ...prev, description: e.target.value }))}
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
                value={channelFormData.name}
                onChange={(e) => setChannelFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={channelFormData.description}
                onChange={(e) => setChannelFormData(prev => ({ ...prev, description: e.target.value }))}
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

      {/* Create Section Dialog */}
      <Dialog open={showCreateSectionDialog} onOpenChange={setShowCreateSectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Section</DialogTitle>
            <DialogDescription>
              Add a new section to organize your channels
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="section-name">Section Name</Label>
              <Input
                id="section-name"
                value={sectionFormData.name}
                onChange={(e) => setSectionFormData({ name: e.target.value })}
                placeholder="e.g. Important"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSectionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSection}>
              Create Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Section Dialog */}
      <Dialog open={showEditSectionDialog} onOpenChange={setShowEditSectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>
              Modify section settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-section-name">Section Name</Label>
              <Input
                id="edit-section-name"
                value={sectionFormData.name}
                onChange={(e) => setSectionFormData({ name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditSectionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSection}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}