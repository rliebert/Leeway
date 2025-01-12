import { useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useWS } from "@/lib/ws";
import { useUser } from "@/hooks/use-user";
import { Smile, PaperclipIcon } from "lucide-react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { useState, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileUpload } from "./FileUpload";

interface ChatInputProps {
  channelId: string;
  parentMessageId?: string;
}

interface FormData {
  message: string;
}

export default function ChatInput({ channelId, parentMessageId }: ChatInputProps) {
  const { send } = useWS();
  const { user } = useUser();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<FormData>({
    defaultValues: {
      message: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    console.log('ChatInput: Submitting form with files:', files.map(f => f.name));
    const message = data?.message || "";
    if ((!message.trim() && files.length === 0) || !user || !channelId) return;

    try {
      // Upload files if any
      let attachments = [];
      if (files.length > 0) {
        console.log('ChatInput: Uploading files');
        const formData = new FormData();
        files.forEach((file) => {
          formData.append('files', file);
        });

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'File upload failed');
        }

        attachments = await response.json();
        console.log('ChatInput: Files uploaded successfully:', attachments);
      }

      // Send message through WebSocket
      console.log('ChatInput: Sending message with attachments:', attachments);
      
      send({
        type: "message",
        channelId: channelId.toString(),
        content: message.trim() || "(attachment)",
        parentId: parentMessageId,
        attachments: attachments.map((attachment: any) => ({
          url: attachment.url,
          originalName: attachment.originalName,
          mimetype: attachment.mimetype,
          file_size: attachment.size,
          path: attachment.path
        })),
      });

      // Reset form state
      form.reset();
      setFiles([]);
      setShowEmojiPicker(false);
    } catch (error) {
      console.error('Error sending message with attachments:', error);
      alert('Failed to send message with attachments. Please try again.');
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = form.getValues("message") || "";

    const newValue = 
      currentValue.substring(0, start) + 
      emojiData.emoji + 
      currentValue.substring(end);

    form.setValue("message", newValue, { 
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });

    // Set cursor position after emoji
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emojiData.emoji.length;
      }
    }, 0);
  };

  const handleFileSelect = (selectedFiles: File[]) => {
    console.log('ChatInput: Handling file selection:', selectedFiles.map(f => f.name));
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const handleFileRemove = (index: number) => {
    console.log('ChatInput: Removing file at index:', index);
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <FileUpload
          files={files}
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
        />
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
        <div className="flex-1 flex gap-2">
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
              >
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-full p-0" 
              side="top" 
              align="start"
            >
              <EmojiPicker
                onEmojiClick={onEmojiClick}
                width="100%"
                height="350px"
              />
            </PopoverContent>
          </Popover>
          <Textarea
            {...form.register("message")}
            ref={(e) => {
              form.register("message").ref(e);
              textareaRef.current = e;
            }}
            placeholder={parentMessageId ? "Reply to thread..." : "Type your message..."}
            className="resize-none min-h-[2.75rem] py-2.5"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                form.handleSubmit(onSubmit)();
              }
            }}
          />
          {files.length === 0 && (
            <>
              <input
                type="file"
                id="file-upload"
                multiple
                className="hidden"
                onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || []);
                  handleFileSelect(selectedFiles);
                }}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <PaperclipIcon className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
        <Button type="submit" size="sm" className="h-11">Send</Button>
      </form>
    </div>
  );
}