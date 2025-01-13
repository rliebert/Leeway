import { useWS } from "@/lib/ws";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WifiOff, Wifi, Bug } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-user";

export default function ConnectionStatus() {
  const { connected, error, toggleDebug, isDebugEnabled } = useWS();
  const { user } = useUser();

  const isAdmin = user?.role === 'admin';

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

      {isAdmin && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isDebugEnabled ? "secondary" : "ghost"}
                size="sm"
                className={`h-8 w-8 p-0 transition-colors ${
                  isDebugEnabled ? 'text-amber-500 debug-mode-active hover:bg-amber-500/20' : ''
                }`}
                onClick={toggleDebug}
              >
                <Bug className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                <Bug className="h-3 w-3" />
                {isDebugEnabled ? 'Disable Debug Mode' : 'Enable Debug Mode'}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}