import React from "react";
import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import AuthPage from "@/pages/auth-page";
import DirectMessageView from "@/components/chat/DirectMessageView";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

function AuthenticatedApp() {
  const { user, isLoading } = useUser();
  const [selectedChannel, setSelectedChannel] = React.useState<string | null>(
    () => {
      return localStorage.getItem("channelSidebar.selectedChannel");
    },
  );

  React.useEffect(() => {
    if (selectedChannel) {
      localStorage.setItem("channelSidebar.selectedChannel", selectedChannel);
    }
  }, [selectedChannel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <WSProvider>
      <div className="h-screen">
        <Switch>
          <Route path="/">
            <Home
              selectedChannel={selectedChannel}
              onSelectChannel={setSelectedChannel}
            />
          </Route>
          <Route path="/dm/:channelId">
            {(params) => <DirectMessageView channelId={params.channelId} />}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </div>
    </WSProvider>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            The page you're looking for doesn't exist.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  return (
    <AuthenticatedApp />
  );
}

export default App;
