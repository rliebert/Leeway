import { useState } from "react";
import { useUser } from "@/hooks/use-user";
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
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { EditAIRobDialog } from "@/components/EditAIRobDialog";

export function EditProfileDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user, refreshUser } = useUser();
  const { toast } = useToast();
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isEditAIRobOpen, setIsEditAIRobOpen] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const data: any = { username, email, full_name: fullName };

      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await refreshUser();
      toast({ 
        description: "Profile updated successfully"
      });
      onClose();
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to update profile",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <AvatarUpload 
            userId={user?.id} 
            currentAvatar={user?.avatar_url}
            username={user?.username || ''}
            onAvatarUpdate={refreshUser}
          />
          <div className="flex justify-center">
            <Button 
              variant="link" 
              onClick={() => setIsChangePasswordOpen(true)}
              className="text-muted-foreground hover:text-primary"
            >
              Change Password
            </Button>
            {user?.is_admin && (
              <Button 
                variant="link" 
                onClick={() => setIsEditAIRobOpen(true)}
                className="text-muted-foreground hover:text-primary"
              >
                Edit AI Rob
              </Button>
            )}
          </div>
          <div className="grid gap-2">
            <label htmlFor="fullName">Full Name</label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="username">Username</label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
        <ChangePasswordDialog
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
        />
        <EditAIRobDialog
          isOpen={isEditAIRobOpen}
          onClose={() => setIsEditAIRobOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}