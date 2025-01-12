import { useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Channel, Section } from "@db/schema";
import { useUser } from "@/hooks/use-user";

// Form data types
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
  onSelectChannel: (channelId: string) => void;
}

export default function ChannelSidebar({
  selectedChannel,
  onSelectChannel,
}: Props) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [channelFormData, setChannelFormData] = useState<ChannelFormData>({
    name: "",
  });
  const [sectionFormData, setSectionFormData] = useState<SectionFormData>({
    name: "",
  });
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["/api/sections"],
  });

  // Create/update channel mutation
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
    if (editingChannel) {
      updateChannelMutation.mutate({
        id: editingChannel.id.toString(),
        data: channelFormData,
      });
      setEditingChannel(null); // Clear editing state
    }
  };

  const handleDeleteChannel = (channelId: string) => {
    if (confirm("Are you sure you want to delete this channel?")) {
      deleteChannelMutation.mutate(channelId);
    }
  };

  // JSX for the sidebar UI
  return (
    <div>
      <h2>Channels</h2>
      {channels?.map((channel) => (
        <div key={channel.id}>
          <span>{channel.name}</span>
          <Button
            onClick={() => {
              setEditingChannel(channel);
              setChannelFormData({
                name: channel.name,
                description: channel.description || "",
                section_id: channel.section_id
                  ? channel.section_id.toString()
                  : null,
              });
            }}
          >
            Edit
          </Button>
          <Button onClick={() => handleDeleteChannel(channel.id.toString())}>
            Delete
          </Button>
        </div>
      ))}

      {/* Channel creation form */}
      <h3>Add Channel</h3>
      <input
        type="text"
        placeholder="Channel Name"
        value={channelFormData.name}
        onChange={(e) =>
          setChannelFormData({ ...channelFormData, name: e.target.value })
        }
      />
      <Button onClick={handleCreateChannel}>Save</Button>

      {/* Editing the selected channel */}
      {editingChannel && (
        <div>
          <h3>Edit Channel: {editingChannel.name}</h3>
          <input
            type="text"
            placeholder="Channel Name"
            value={channelFormData.name}
            onChange={(e) =>
              setChannelFormData({ ...channelFormData, name: e.target.value })
            }
          />
          <Button onClick={handleUpdateChannel}>Update</Button>
        </div>
      )}
    </div>
  );
}
