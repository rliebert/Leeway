import { ChangeEvent, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  files: File[];
  maxFiles?: number;
  maxSize?: number; // in bytes
}

export function FileUpload({
  onFileSelect,
  onFileRemove,
  files,
  maxFiles = 10,
  maxSize = 5 * 1024 * 1024, // 5MB default
}: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    console.log('FileUpload: handleFileChange triggered');
    const selectedFiles = Array.from(e.target.files || []);
    console.log('FileUpload: Selected files:', selectedFiles.map(f => f.name));
    setError(null);

    // Check file count
    if (files.length + selectedFiles.length > maxFiles) {
      console.log('FileUpload: Max files limit exceeded');
      setError(`You can only upload up to ${maxFiles} files at once`);
      return;
    }

    // Check file sizes
    const oversizedFiles = selectedFiles.filter(file => file.size > maxSize);
    if (oversizedFiles.length > 0) {
      console.log('FileUpload: Files exceed size limit:', oversizedFiles.map(f => f.name));
      setError(`Some files exceed the ${maxSize / (1024 * 1024)}MB limit`);
      return;
    }

    try {
      // Create FormData and append files
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      // Upload files
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const uploadedFiles = await response.json();
      console.log('FileUpload: Files uploaded successfully:', uploadedFiles);

      onFileSelect(selectedFiles);
      toast({
        description: "Files uploaded successfully",
      });
    } catch (error) {
      console.error('FileUpload: Upload failed:', error);
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to upload files",
      });
    }

    e.target.value = ''; // Reset input
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
        >
          Select Files
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-muted rounded-md p-2 text-sm"
            >
              <span className="truncate max-w-[200px]">{file.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 rounded-full"
                onClick={() => {
                  console.log('FileUpload: Removing file:', file.name);
                  onFileRemove(index);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}