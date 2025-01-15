import type { User } from "@db/schema";

export interface FileAttachment {
  id: string;
  url: string;
  originalName: string;
  mimetype: string;
  file_size: number;
}

export interface Message {
  id: string;
  content: string;
  user_id: string;
  channel_id: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  pinned_by: string | null;
  pinned_at: string | null;
  author?: User;
  attachments?: FileAttachment[];
  type?: 'message' | 'message_deleted' | 'message_edited';
  messageId?: string; // For deletion events
}

export interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'message' | 'typing' | 'ping' | 'pong' | 'connected' | 'message_deleted' | 'message_edited' | 'debug_mode' | 'message_ack' | 'message_history' | 'error';
  channelId?: string;
  content?: string;
  parentId?: string;
  messageId?: string;
  attachments?: FileAttachment[];
  enabled?: boolean;
  message?: Message;
  messages?: Message[];
}