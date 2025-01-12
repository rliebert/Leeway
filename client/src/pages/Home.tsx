import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Hash, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import leewayLogo from "@/assets/leeway-logo3.svg";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUser } from "@/hooks/use-user";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import UserProfile from "@/components/UserProfile";
import type { Channel, Message } from "@db/schema";
import { useDebouncedCallback } from "use-debounce";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface SearchResult extends Message {
  user?: {
    username: string;
  };
  channel?: {
    name: string;
  };
}

interface HomeProps {
  selectedChannel: string | null;
  onSelectChannel: (channelId: string) => void;
}

export default function Home({ selectedChannel: initialSelectedChannel, onSelectChannel }: HomeProps) {
  const { user, isLoading } = useUser();
  const [selectedDM, setSelectedDM] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelectedChannel, setLocalSelectedChannel] = useState<string | null>(initialSelectedChannel);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  const { data: searchResults } = useQuery<SearchResult[]>({
    queryKey: [`/api/messages/search`, { query: searchQuery }],
    enabled: searchQuery.length > 0 && !!user,
  });

  // Update local state when prop changes
  useEffect(() => {
    setLocalSelectedChannel(initialSelectedChannel);
  }, [initialSelectedChannel]);

  const currentChannel = channels?.find(
    channel => channel.id.toString() === localSelectedChannel
  );

  const handleSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
  }, 300);

  const handleSelectChannel = (channelId: string) => {
    setLocalSelectedChannel(channelId);
    onSelectChannel(channelId);
    setSelectedDM(null);
  };

  const handleSelectDM = (dmId: string) => {
    setSelectedDM(dmId);
    setLocalSelectedChannel(null);
    onSelectChannel('');
  };

  // Initialize selected channel if none is selected
  useEffect(() => {
    if (channels?.length && !localSelectedChannel) {
      const firstChannel = channels[0].id.toString();
      handleSelectChannel(firstChannel);
    }
  }, [channels, localSelectedChannel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="w-full border-b">
        <div className="flex items-center">
          <div className="w-64 p-4">
            <div className="flex items-center gap-2">
              <img src={leewayLogo} alt="Leeway Logo" className="w-6 h-6" />
              <h1 className="font-bold text-xl">Leeway</h1>
            </div>
          </div>
          <div className="flex-1 p-4">
            <div 
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted cursor-pointer hover:bg-accent mr-4"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Search messages...</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex flex-col border-r bg-sidebar">
          <ChannelSidebar 
            selectedChannel={localSelectedChannel || ''} 
            selectedDM={selectedDM}
            onSelectChannel={handleSelectChannel} 
            onSelectDM={handleSelectDM}
          />
          <UserProfile />
        </div>
        <div className="flex-1 flex flex-col">
          {selectedDM ? (
            <div>DM View - Not implemented yet</div>
          ) : (
            <>
              <div className="border-b px-6 py-3">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold text-lg">{currentChannel?.name}</h2>
                </div>
                {currentChannel?.description && (
                  <p className="text-sm text-muted-foreground mt-1">{currentChannel.description}</p>
                )}
              </div>
              <ScrollArea className="flex-1">
                <MessageList 
                  channelId={localSelectedChannel ? parseInt(localSelectedChannel, 10) : 0} 
                />
              </ScrollArea>
              <div className="px-4 py-3 border-t">
                <ChatInput 
                  channelId={localSelectedChannel ? parseInt(localSelectedChannel, 10) : 0} 
                />
              </div>
            </>
          )}
        </div>
      </div>
      <CommandDialog 
        open={open} 
        onOpenChange={setOpen}
      >
        <DialogTitle className="sr-only">Search Messages</DialogTitle>
        <DialogDescription className="sr-only">
          Search for messages across all channels
        </DialogDescription>
        <CommandInput 
          placeholder="Search messages..." 
          onValueChange={handleSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {searchResults && searchResults.length > 0 && (
            <CommandGroup heading="Messages">
              {searchResults.map((message) => (
                <CommandItem
                  key={message.id}
                  onSelect={() => handleSelectChannel(message.channelId.toString())}
                  className="flex flex-col items-start gap-1"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{message.user?.username}</span>
                    <span className="text-muted-foreground">
                      in #{message.channel?.name}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {message.content}
                  </p>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </div>
  );
}