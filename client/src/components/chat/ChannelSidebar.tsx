import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { sections, type Channel, type Section, type User } from "@db/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { ChevronRightSquare, ChevronRight, Hash, MoreVertical, Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  selectedChannel: string;
  onSelectChannel: (channelId: string) => void;
}

// Add interface for channelsBySection
interface ChannelsBySection {
  uncategorized: Channel[];
  [key: string]: Channel[];
}

export default function ChannelSidebar({ selectedChannel, onSelectChannel }: Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isChannelsExpanded, setIsChannelsExpanded] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [channelFormData, setChannelFormData] = useState<Partial<Channel>>({});
  const [sectionName, setSectionName] = useState('');
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    select: (channels) => {
      if (!channels) return [];
      // Only get regular channels
      return channels.filter(channel => 
        channel.type === 'channel' && 
        !channel.name?.startsWith('dm-')
      );
    }
  });

  useEffect(() => {
    if (!selectedChannel && channels.length > 0) {
      const lastChannel = localStorage.getItem('lastSelectedChannel');
      const defaultChannel = channels.find(c => c.id === lastChannel) || channels[0];
      onSelectChannel(defaultChannel.id);
    }
  }, [selectedChannel, channels, onSelectChannel]);

  function handleDialogChange(open: boolean) {
    setIsDialogOpen(open);
    if (!open) {
      setEditingChannel(null);
      setChannelFormData({});
    }
  }

  function handleSaveChannel(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    // TODO: Implement channel save/update mutation
    const isEditing = !!editingChannel;
    const mutation = isEditing ? updateChannelMutation : createChannelMutation;
    
    mutation.mutate(channelFormData, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setChannelFormData({});
        setEditingChannel(null);
      }
    });
  }

  function handleCreateSection(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    // TODO: Implement section creation mutation
    createSectionMutation.mutate({ name: sectionName }, {
      onSuccess: () => {
        setIsSectionDialogOpen(false);
        setSectionName('');
      }
    });
  }

  function handleEditChannel(channel: Channel) {
    setEditingChannel(channel);
    setChannelFormData(() => ({ ...channel }));
    setIsDialogOpen(true);
  }

  function handleDeleteChannel(id: string) {
    // TODO: Implement delete mutation
    if (confirm('Are you sure you want to delete this channel?')) {
      deleteChannelMutation.mutate(id);
    }
  }

  function toggleSection(id: string) {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }

  // Add mutations
  const createChannelMutation = useMutation<Channel, Error, Partial<Channel>>({
    mutationFn: async (data) => {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/channels'] })
  });

  const updateChannelMutation = useMutation<Channel, Error, Partial<Channel>>({
    mutationFn: async (data) => {
      const res = await fetch(`/api/channels/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/channels'] })
  });

  const deleteChannelMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/channels/${id}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/channels'] })
  });

  const createSectionMutation = useMutation<Section, Error, { name: string }>({
    mutationFn: async (data) => {
      const res = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/sections'] })
  });

  // Add query for sections if not already present
  const { data: sections } = useQuery<Section[]>({
    queryKey: ['/api/sections']
  });

  // Add channelsBySection organization
  const channelsBySection = channels?.reduce((acc: ChannelsBySection, channel: Channel) => {
    if (!channel.section_id) {
      acc.uncategorized = [...(acc.uncategorized || []), channel];
    } else {
      acc[channel.section_id] = [...(acc[channel.section_id] || []), channel];
    }
    return acc;
  }, { uncategorized: [] });

  // Assuming the API or state management already separates these, you should only be fetching regular channels here.
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="relative">
        <div
          className="flex items-center justify-between px-3 h-10 group"
        >
          <div className="flex items-center flex-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 p-0 hover:bg-transparent"
              onClick={() => setIsChannelsExpanded(!isChannelsExpanded)}
            >
              <ChevronRightSquare className={`h-4 w-4 transition-transform ${isChannelsExpanded ? 'rotate-90' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-6 px-2 hover:bg-accent group flex items-center gap-1"
                >
                  <span className="text-lg font-semibold">Channels</span>
                  <ChevronDown className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Channel
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setIsSectionDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingChannel ? 'Edit Channel' : 'Create New Channel'}
              </DialogTitle>
              <DialogDescription>
                {editingChannel 
                  ? 'Edit the channel details below.' 
                  : 'Create a new channel for team communication.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Channel Name</Label>
                <Input
                  id="name"
                  value={channelFormData?.name || ''}
                  onChange={(e) => setChannelFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. announcements"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={channelFormData?.description || ''}
                  onChange={(e) => setChannelFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What's this channel about?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="section">Section</Label>
                <Select
                  value={channelFormData.section_id || ''}
                  onValueChange={(value) => 
                    setChannelFormData(prev => ({ 
                      ...prev, 
                      section_id: value === 'none' ? null : value 
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {sections?.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveChannel} className="w-full">
                {editingChannel ? 'Update Channel' : 'Create Channel'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Section</DialogTitle>
              <DialogDescription>
                Create a new section to organize your channels.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sectionName">Section Name</Label>
                <Input
                  id="sectionName"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  placeholder="e.g. Projects"
                />
              </div>
              <Button onClick={handleCreateSection} className="w-full">
                Create Section
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pt-1 space-y-4">
          {/* Channels Section */}
          {isChannelsExpanded && (
            <div className="ml-4">
              {channelsBySection?.uncategorized?.map((channel: Channel) => (
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
          )}

          {/* Sections with their channels */}
          {sections?.map((section) => (
            <div key={section.id} className="mt-3">
              <div 
                className="flex items-center pl-[11px] pr-2 mb-1 cursor-pointer hover:bg-accent/50 rounded-md"
                onClick={() => toggleSection(section.id)}
              >
                <ChevronRight 
                  className={`h-4 w-4 mr-1 transition-transform ${
                    expandedSections[section.id] ? 'rotate-90' : ''
                  }`} 
                />
                <span className="text-sm font-medium">{section.name}</span>
              </div>
              <div className="ml-6">
                {channelsBySection?.[section.id]?.map((channel: Channel) => 
                  (expandedSections[section.id] || channel.id.toString() === selectedChannel) &&
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      isSelected={selectedChannel === channel.id.toString()}
                      onSelect={onSelectChannel}
                      onEdit={() => handleEditChannel(channel)}
                      onDelete={() => handleDeleteChannel(channel.id)}
                      isCreator={channel.creator_id === user?.id}
                    />
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
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
  const { user } = useUser();
  return (
    <div
      className={`group flex items-center px-3 h-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/50' : ''
      }`}
      onClick={() => {
  onSelect(channel.id.toString());
  window.history.pushState({}, '', '/');
}}
    >
      <Hash className="h-4 w-4 mr-2 text-gray-500" />
      <span className="flex-1 text-sm">{channel.name}</span>
      {(channel.creator_id === user?.id || user?.is_admin) && (
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