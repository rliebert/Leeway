import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@db/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { ChevronRightSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  onSelectUser: (userId: string) => void;
  selectedUserId?: string;
}

export default function DirectMessageSidebar({ onSelectUser, selectedUserId }: Props) {
  const { user } = useUser();
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  return (
    <div className="relative mt-8">
      <div className="flex items-center justify-between h-10 group">
        <div className="flex items-center flex-1 pl-[5px]">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 p-0 hover:bg-transparent"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronRightSquare 
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            />
          </Button>
          <span className="text-lg font-semibold ml-2">Direct Messages</span>
        </div>
      </div>

      {/* Users List */}
      {isExpanded && (
        <ScrollArea className="ml-4 space-y-1">
          {users?.filter(u => u.id !== user?.id).map((otherUser) => (
            <div
              key={otherUser.id}
              className={`flex items-center px-3 h-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md ${
                selectedUserId === otherUser.id ? 'bg-blue-50 dark:bg-blue-900/50' : ''
              }`}
              onClick={() => onSelectUser(otherUser.id)}
            >
              <Avatar className="h-6 w-6 mr-2">
                <AvatarImage src={otherUser.avatar_url || undefined} />
                <AvatarFallback>
                  {otherUser.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 text-sm">{otherUser.username}</span>
            </div>
          ))}
        </ScrollArea>
      )}
    </div>
  );
}