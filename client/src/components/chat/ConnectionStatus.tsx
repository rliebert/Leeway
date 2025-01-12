
import { useWS } from "@/lib/ws";
import { Badge } from "@/components/ui/badge";
import { WifiOff, Wifi } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function ConnectionStatus() {
  const { connected, error } = useWS();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge 
            variant={connected ? "secondary" : "destructive"}
            className="flex items-center gap-1.5 cursor-help"
          >
            {connected ? (
              <>
                <Wifi className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                {error ? "Error" : "Disconnected"}
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {error ? `Error: ${error}` : connected ? "Connected" : "Disconnected"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
