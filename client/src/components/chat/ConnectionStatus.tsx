import { useWS } from "@/lib/ws";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WifiOff, Wifi, Bug } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function ConnectionStatus() {
  const { connected, error, toggleDebug, isDebugEnabled } = useWS();

  return (
    <div className="flex items-center gap-2">
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

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${isDebugEnabled ? 'text-amber-500' : ''}`}
              onClick={toggleDebug}
            >
              <Bug className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isDebugEnabled ? 'Disable Debug Logs' : 'Enable Debug Logs'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}