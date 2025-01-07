import { useWS } from "@/lib/ws";
import { Badge } from "@/components/ui/badge";
import { WifiOff, Wifi } from "lucide-react";

export default function ConnectionStatus() {
  const { connected } = useWS();

  return (
    <Badge 
      variant={connected ? "secondary" : "destructive"}
      className="flex items-center gap-1.5"
    >
      {connected ? (
        <>
          <Wifi className="h-3 w-3" />
          Connected
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          Disconnected
        </>
      )}
    </Badge>
  );
}
