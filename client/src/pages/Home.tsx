import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Hash, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import DirectMessageSidebar from "@/components/chat/DirectMessageSidebar";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import UserProfile from "@/components/UserProfile";
import type { Channel, Message } from "@db/schema";
import { useDebouncedCallback } from "use-debounce";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ConnectionStatus from "@/components/chat/ConnectionStatus";

interface SearchResult extends Message {
  user?: {
    username: string;
  };
  channel?: {
    name: string;
  };
}

export default function Home() {
  const { user, isLoading } = useUser();
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [selectedDM, setSelectedDM] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  const { data: searchResults } = useQuery<SearchResult[]>({
    queryKey: [`/api/messages/search`, { query: searchQuery }],
    enabled: searchQuery.length > 0 && !!user,
  });

  const currentChannel = channels?.find(channel => channel.id === selectedChannel);

  const handleSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
  }, 300);

  const handleSelectChannel = (channelId: number) => {
    setSelectedChannel(channelId);
    setSelectedDM(null);
  };

  const handleSelectDM = (dmId: number) => {
    setSelectedDM(dmId);
    setSelectedChannel(-1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; // Auth handled by App.tsx
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="w-full border-b">
        <div className="flex items-center">
          <div className="w-64 p-4">
            <h1 className="font-bold text-xl">Leeway</h1>
          </div>
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between">
              <div 
                onClick={() => setOpen(true)}
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-muted cursor-pointer hover:bg-accent mr-4"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Search messages...</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
              <ConnectionStatus />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex flex-col border-r bg-sidebar">
          <ChannelSidebar selectedChannel={selectedChannel} onSelectChannel={handleSelectChannel} />
          <DirectMessageSidebar selectedDM={selectedDM} onSelectDM={handleSelectDM} />
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
                <MessageList channelId={selectedChannel} />
              </ScrollArea>
              <div className="px-4 py-3 border-t">
                <ChatInput channelId={selectedChannel} />
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
                  onSelect={() => handleSelectChannel(message.channelId)}
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