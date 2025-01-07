import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Hash } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import type { Channel } from "@db/schema";

export default function Home() {
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [open, setOpen] = useState(false);
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const currentChannel = channels?.find(channel => channel.id === selectedChannel);

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="w-full border-b">
        <div className="max-w-[calc(100%-256px)] ml-auto p-4">
          <div 
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted cursor-pointer hover:bg-accent"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Search messages...</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <ChannelSidebar selectedChannel={selectedChannel} onSelectChannel={setSelectedChannel} />
        <div className="flex-1 flex flex-col">
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
          <Separator />
          <div className="p-4">
            <ChatInput channelId={selectedChannel} />
          </div>
        </div>
      </div>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search messages..." />
        <CommandList>
          {/* Search results will be implemented later */}
        </CommandList>
      </CommandDialog>
    </div>
  );
}