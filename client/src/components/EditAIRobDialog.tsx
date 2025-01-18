
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AvatarUpload } from "@/components/AvatarUpload";

export function EditAIRobDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [aiRobUsername, setAiRobUsername] = useState("ai.rob");
  const [aiRobEmail, setAiRobEmail] = useState("ai.rob@leeway.app");
  const [aiRobStatus, setAiRobStatus] = useState("🤖 AI Assistant");
  const [aiRobFullName, setAiRobFullName] = useState("AI Rob");

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/ai-rob", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: aiRobUsername,
          email: aiRobEmail,
          status: aiRobStatus,
          full_name: aiRobFullName,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast({ 
        description: "AI Rob profile updated successfully"
      });
      onClose();
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to update AI Rob profile",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit AI Rob</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <AvatarUpload 
            userId="ai.rob"
            currentAvatar="/uploads/ai-rob-avatar.png"
            username="ai.rob"
            onAvatarUpdate={() => {
              // Force refresh the page to show updated avatar
              window.location.reload();
            }}
          />
          <div className="grid gap-2">
            <label htmlFor="aiRobFullName">Full Name</label>
            <Input
              id="aiRobFullName"
              value={aiRobFullName}
              onChange={(e) => setAiRobFullName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="aiRobUsername">Username</label>
            <Input
              id="aiRobUsername"
              value={aiRobUsername}
              onChange={(e) => setAiRobUsername(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="aiRobEmail">Email</label>
            <Input
              id="aiRobEmail"
              type="email"
              value={aiRobEmail}
              onChange={(e) => setAiRobEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="aiRobStatus">Status</label>
            <Input
              id="aiRobStatus"
              value={aiRobStatus}
              onChange={(e) => setAiRobStatus(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
