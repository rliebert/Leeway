import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash } from "lucide-react";
import leewayLogo from "@/assets/leeway-logo3.svg";
import { useUser } from "@/hooks/use-user";
import ChannelSidebar from "@/components/chat/ChannelSidebar";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import SearchMessages from "@/components/chat/SearchMessages";
import UserProfile from "@/components/UserProfile";
import type { Channel } from "@db/schema";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import ConnectionStatus from "@/components/chat/ConnectionStatus";


interface HomeProps {
  selectedChannel: string | null;
  onSelectChannel: (channelId: string) => void;
}

export default function Home({ selectedChannel: initialSelectedChannel, onSelectChannel }: HomeProps) {
  const { user, isLoading } = useUser();
  const [localSelectedChannel, setLocalSelectedChannel] = useState<string | null>(initialSelectedChannel);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  // Update local state when prop changes
  useEffect(() => {
    setLocalSelectedChannel(initialSelectedChannel);
  }, [initialSelectedChannel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin text-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="w-full border-b">
        <div className="flex items-center h-14">
          <div className="w-64 px-4 bg-sidebar flex items-center gap-2">
            <img src={leewayLogo} alt="Leeway" className="w-6 h-6" />
            <h1 className="font-bold text-xl text-sidebar-foreground">Leeway</h1>
          </div>
          <div className="flex-1 pr-2 pl-4 flex items-center">
            <div className="flex-1">
              <SearchMessages />
            </div>
            <ConnectionStatus />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex flex-col border-r bg-sidebar">
          <ChannelSidebar
            selectedChannel={localSelectedChannel || ""}
            onSelectChannel={onSelectChannel}
          />
          <UserProfile />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="border-b px-6 py-3">
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">
                {channels?.find((c) => c.id === localSelectedChannel)?.name}
              </h2>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <MessageList channelId={localSelectedChannel || ""} />
          </ScrollArea>
          <div className="px-4 py-3 border-t">
            <ChatInput channelId={localSelectedChannel || ""} />
          </div>
        </div>
      </div>
    </div>
  );
}