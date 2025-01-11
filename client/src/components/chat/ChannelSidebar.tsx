import { useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, ChevronDown, Plus, Settings, Trash2, ChevronRight, MoreVertical } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section, User } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useLocation } from "wouter";

interface ChannelFormData {
  name: string;
  description?: string;
  section_id?: string | null;
}

interface SectionFormData {
  name: string;
}

interface Props {
  selectedChannel: string;
  selectedDM: string | null;
  onSelectChannel: (channelId: string) => void;
  onSelectDM: (dmId: string) => void;
}

export default function ChannelSidebar({
  selectedChannel,
  selectedDM,
  onSelectChannel,
  onSelectDM,
}: Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const [isChannelsOpen, setIsChannelsOpen] = useLocalStorage('channelSidebar.isChannelsOpen', true);
  const [openSections, setOpenSections] = useLocalStorage<Record<string, boolean>>('channelSidebar.openSections', {});

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["/api/sections"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateSectionDialog, setShowCreateSectionDialog] = useState(false);
  const [showEditSectionDialog, setShowEditSectionDialog] = useState(false);
  const [channelFormData, setChannelFormData] = useState<ChannelFormData>({ name: "" });
  const [sectionFormData, setSectionFormData] = useState<SectionFormData>({ name: "" });

  const channelsBySection = channels?.reduce((acc, channel) => {
    const sectionId = channel.section_id?.toString() || 'unsectioned';
    if (!acc[sectionId]) {
      acc[sectionId] = [];
    }
    acc[sectionId].push(channel);
    return acc;
  }, {} as Record<string, Channel[]>) || {};

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
      toast({ description: "Channel created successfully" });
      setShowCreateDialog(false);
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ChannelFormData }) => {
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
      toast({ description: "Channel updated successfully" });
      setShowEditDialog(false);
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/channels/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ description: "Channel deleted successfully" });
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
      toast({ description: "Section created successfully" });
      setShowCreateSectionDialog(false);
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SectionFormData }) => {
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
      toast({ description: "Section updated successfully" });
      setShowEditSectionDialog(false);
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sections/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sections"] });
      toast({ description: "Section deleted successfully" });
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
    updateChannelMutation.mutate({
      id: editingChannel.id.toString(),
      data: channelFormData
    });
  };

  const handleDeleteChannel = (channelId: string) => {
    if (confirm("Are you sure you want to delete this channel?")) {
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
    updateSectionMutation.mutate({
      id: editingSection.id.toString(),
      data: sectionFormData
    });
  };

  const handleDeleteSection = (sectionId: string) => {
    if (confirm("Are you sure you want to delete this section?")) {
      deleteSectionMutation.mutate(sectionId);
    }
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const sourceId = result.draggableId;
    const destinationDroppableId = result.destination.droppableId;

    if (destinationDroppableId !== result.source.droppableId) {
      const newSectionId = destinationDroppableId === "unsectioned" ? null : destinationDroppableId;

      fetch(`/api/channels/${sourceId}/section`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: newSectionId }),
      })
        .then(response => {
          if (!response.ok) throw new Error(response.statusText);
          queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
          toast({ description: "Channel moved successfully" });
        })
        .catch(() => {
          toast({
            variant: "destructive",
            description: "Failed to move channel",
          });
        });
    }
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const renderChannelList = (channelList: Channel[], droppableId: string) => (
    <Droppable droppableId={droppableId}>
      {(provided) => (
        <div
          {...provided.droppableProps}
          ref={provided.innerRef}
          className="space-y-[1px]"
        >
          {channelList.map((channel, index) => (
            <Draggable
              key={channel.id}
              draggableId={channel.id.toString()}
              index={index}
              isDragDisabled={!user}
            >
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  className="group"
                >
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      className={cn(
                        "flex-1 justify-start gap-2 py-1",
                        channel.id.toString() === selectedChannel && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => onSelectChannel(channel.id.toString())}
                    >
                      <Hash className="h-4 w-4" />
                      {channel.name}
                    </Button>
                    {user && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setEditingChannel(channel);
                            setChannelFormData({
                              name: channel.name,
                              description: channel.description || "",
                              section_id: channel.section_id?.toString()
                            });
                            setShowEditDialog(true);
                          }}>
                            <Settings className="mr-2 h-4 w-4" />
                            Edit Channel
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteChannel(channel.id.toString())}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Channel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <ScrollArea className="flex-1">
        <div className="px-2">
          <Collapsible open={isChannelsOpen} onOpenChange={setIsChannelsOpen}>
            <div className="flex items-center p-2">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0"
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 transition-transform",
                      isChannelsOpen && "rotate-90"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <div className="flex-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="px-2 font-semibold text-lg group relative inline-flex items-center p-2"
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

            {!isChannelsOpen && selectedChannel && channels?.some(c => c.id.toString() === selectedChannel) && (
              <div className="mt-[1px] pl-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 py-1 bg-accent text-accent-foreground"
                  onClick={() => onSelectChannel(selectedChannel)}
                >
                  <Hash className="h-4 w-4" />
                  {channels.find(c => c.id.toString() === selectedChannel)?.name}
                </Button>
              </div>
            )}

            <CollapsibleContent className="mt-[1px] space-y-[1px]">
              {channelsBySection.unsectioned?.length > 0 && (
                <div className="pl-4 space-y-[1px]">
                  {renderChannelList(channelsBySection.unsectioned, "unsectioned")}
                </div>
              )}

              {sections?.map((section) => {
                const sectionChannels = channelsBySection[section.id.toString()] || [];
                const isSelected = selectedChannel && sectionChannels.some(c => c.id.toString() === selectedChannel);
                const selectedChannelData = isSelected ? sectionChannels.find(c => c.id.toString() === selectedChannel) : null;

                return (
                  <div key={section.id} className="mt-[1px]">
                    <Collapsible
                      open={openSections[section.id.toString()]}
                      onOpenChange={() => toggleSection(section.id.toString())}
                    >
                      <div className="flex items-center pl-4 p-2 group">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 transition-transform",
                                openSections[section.id.toString()] && "rotate-90"
                              )}
                            />
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
                                <MoreVertical className="h-4 w-4" />
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
                                onClick={() => handleDeleteSection(section.id.toString())}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Section
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      {!openSections[section.id.toString()] && selectedChannelData && (
                        <div className="mt-[1px] pl-4">
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 py-1 bg-accent text-accent-foreground"
                            onClick={() => onSelectChannel(selectedChannel)}
                          >
                            <Hash className="h-4 w-4" />
                            {selectedChannelData.name}
                          </Button>
                        </div>
                      )}

                      <CollapsibleContent>
                        <div className="pl-4 mt-[1px] space-y-[1px]">
                          {renderChannelList(sectionChannels, section.id.toString())}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

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
                {sections && (
                  <div>
                    <Label htmlFor="section">Section (optional)</Label>
                    <Select
                      value={channelFormData.section_id || ""}
                      onValueChange={(value) => setChannelFormData(prev => ({
                        ...prev,
                        section_id: value || null
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No section</SelectItem>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id.toString()}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={channelFormData.description}
                    onChange={(e) => setChannelFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                {sections && (
                  <div>
                    <Label htmlFor="edit-section">Section</Label>
                    <Select
                      value={channelFormData.section_id || ""}
                      onValueChange={(value) => setChannelFormData(prev => ({
                        ...prev,
                        section_id: value || null
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No section</SelectItem>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id.toString()}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                    onChange={(e) => setSectionFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Development"
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
                    onChange={(e) => setSectionFormData(prev => ({ ...prev, name: e.target.value }))}
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
        </div>
      </ScrollArea>
    </DragDropContext>
  );
}