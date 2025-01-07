import { useState } from "react";
import DirectMessageSidebar from "./DirectMessageSidebar";
import ChannelSidebar from "./ChannelSidebar";

interface SidebarProps {
  selectedDM: number | null;
  onSelectDM: (id: number) => void;
  selectedChannel: number | null;
  onSelectChannel: (id: number) => void;
}

export default function Sidebar({
  selectedDM,
  onSelectDM,
  selectedChannel,
  onSelectChannel,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <ChannelSidebar 
          selectedChannel={selectedChannel}
          onSelectChannel={onSelectChannel}
        />
      </div>
      <DirectMessageSidebar
        selectedDM={selectedDM}
        onSelectDM={onSelectDM}
      />
    </div>
  );
}
