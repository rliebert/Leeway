import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface AvatarUploadProps {
  userId: number;
  currentAvatar?: string | null;
  username: string;
  onAvatarUpdate: (newAvatarUrl: string) => void;
}

export function AvatarUpload({ userId, currentAvatar, username, onAvatarUpdate }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        description: "Please upload an image file",
      });
      return;
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        description: "File size should be less than 5MB",
      });
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    setIsUploading(true);
    try {
      const response = await fetch(`/api/users/${userId}/avatar`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // Create a temporary URL for the uploaded file
      const avatarUrl = URL.createObjectURL(file);
      onAvatarUpdate(avatarUrl);

      toast({
        description: "Avatar updated successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to update avatar",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="h-24 w-24">
        <AvatarImage src={currentAvatar || undefined} />
        <AvatarFallback>{username[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm"
          disabled={isUploading}
          onClick={() => document.getElementById('avatar-upload')?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {isUploading ? "Uploading..." : "Upload Avatar"}
        </Button>
        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
