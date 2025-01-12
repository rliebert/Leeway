import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search as SearchIcon } from "lucide-react";
import type { Message, Channel } from "@db/schema";

interface SearchResult extends Message {
  channel: Channel;
}

export default function SearchMessages() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch] = useDebounce(searchTerm, 300);

  // Handle keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: searchResults, isLoading } = useQuery<SearchResult[]>({
    queryKey: ['messages', 'search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];

      const params = new URLSearchParams({ q: debouncedSearch });
      const response = await fetch(`/api/messages/search?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    enabled: debouncedSearch.length >= 2,
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted w-full max-w-lg hover:bg-accent/50 transition-colors"
      >
        <SearchIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Search messages...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search messages..." 
          value={searchTerm}
          onValueChange={setSearchTerm}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {searchResults && searchResults.length > 0 && (
            <CommandGroup heading="Messages">
              {searchResults.map((result) => (
                <CommandItem
                  key={result.id}
                  value={result.id.toString()}
                  className="flex flex-col items-start gap-1 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      {result.author?.username}
                    </span>
                    <span className="text-muted-foreground">
                      in #{result.channel.name}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {result.content}
                  </p>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}