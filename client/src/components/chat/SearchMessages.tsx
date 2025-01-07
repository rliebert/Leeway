import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Search as SearchIcon, MessageSquare } from "lucide-react";
import type { Message, Channel } from "@db/schema";
import { useLocation } from "wouter";

interface SearchResult extends Message {
  channel: Channel;
}

export default function SearchMessages() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch] = useDebounce(searchTerm, 300);
  const [, setLocation] = useLocation();

  const { data: searchResults, isLoading } = useQuery<SearchResult[]>({
    queryKey: ['/api/messages/search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        return [];
      }

      const queryParams = new URLSearchParams({ query: debouncedSearch });
      const response = await fetch(`/api/messages/search?${queryParams}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 400) {
          console.error('Search failed:', await response.text());
          return [];
        }
        throw new Error('Search failed');
      }

      return response.json();
    },
    enabled: debouncedSearch.length >= 2,
  });

  const handleResultClick = (channelId: number, messageId: number) => {
    setLocation(`/channels/${channelId}`);
    setTimeout(() => {
      const messageElement = document.getElementById(`message-${messageId}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: "smooth" });
        messageElement.classList.add("highlight-message");
        setTimeout(() => messageElement.classList.remove("highlight-message"), 2000);
      }
    }, 100);
  };

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search messages..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {debouncedSearch.length >= 2 && (
        <Card className="absolute top-full mt-2 w-full z-50 p-2">
          <ScrollArea className="max-h-[300px]">
            {isLoading ? (
              <p className="text-sm text-muted-foreground p-2">Searching...</p>
            ) : !searchResults || searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No results found</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result.channelId, result.id)}
                    className="w-full text-left p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <MessageSquare className="h-3 w-3" />
                      <span>#{result.channel.name}</span>
                      <span>·</span>
                      <span>{result.user?.username}</span>
                    </div>
                    <p className="text-sm truncate">{result.content}</p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}