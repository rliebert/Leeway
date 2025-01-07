import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, MessageSquare, User } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { SelectUser } from "@db/schema";
import { useUser } from "@/hooks/use-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DirectMessageSidebarProps {
  selectedDM: number | null;
  onSelectDM: (id: number) => void;
}

export default function DirectMessageSidebar({ selectedDM, onSelectDM }: DirectMessageSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { user: currentUser } = useUser();

  // Fetch all users
  const { data: users = [] } = useQuery<SelectUser[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser,
  });

  // Create DM channel mutation
  const createDMMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch("/api/dm/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      onSelectDM(data.id);
      return data;
    },
  });

  return (
    <ScrollArea className="flex-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center px-4">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0"
            >
              <svg
                className={cn(
                  "h-3 w-3 transition-transform fill-current",
                  !isOpen && "-rotate-90"
                )}
                viewBox="0 0 24 24"
              >
                <path d="M12 21L2 6h20L12 21z" />
              </svg>
            </Button>
          </CollapsibleTrigger>
          <div className="flex-1">
            <Button
              variant="ghost"
              className="px-2 font-semibold text-lg"
            >
              Users
            </Button>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 mt-2">
          <div className="px-2 space-y-1">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-accent group"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 relative">
                    <AvatarImage src={user.avatar || undefined} />
                    <AvatarFallback>
                      {user.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                    {/* Online status indicator */}
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                  </Avatar>
                  <span className="font-medium">
                    {user.username}
                    {user.id === currentUser?.id && " (You)"}
                  </span>
                </div>
                {user.id !== currentUser?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => createDMMutation.mutate(user.id)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </ScrollArea>
  );
}