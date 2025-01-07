import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";

export default function Home() {
  const [selectedChannel, setSelectedChannel] = useState<number>(1);

  return (
    <div className="flex h-screen bg-background">
      <ChannelSidebar selectedChannel={selectedChannel} onSelectChannel={setSelectedChannel} />
      <div className="flex-1 flex flex-col">
        <ScrollArea className="flex-1">
          <MessageList channelId={selectedChannel} />
        </ScrollArea>
        <Separator />
        <div className="p-4">
          <ChatInput channelId={selectedChannel} />
        </div>
      </div>
    </div>
  );
}
