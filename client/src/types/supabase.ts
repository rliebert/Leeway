export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          last_active_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          username: string
          avatar_url?: string | null
          last_active_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          avatar_url?: string | null
          last_active_at?: string | null
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: number
          content: string
          user_id: string
          channel_id: number
          parent_message_id: number | null
          attachments: {
            filename: string
            originalName: string
            mimetype: string
            size: number
            url: string
          }[] | null
          created_at: string
        }
        Insert: {
          content: string
          user_id: string
          channel_id: number
          parent_message_id?: number | null
          attachments?: {
            filename: string
            originalName: string
            mimetype: string
            size: number
            url: string
          }[] | null
          created_at?: string
        }
        Update: {
          content?: string
          user_id?: string
          channel_id?: number
          parent_message_id?: number | null
          attachments?: {
            filename: string
            originalName: string
            mimetype: string
            size: number
            url: string
          }[] | null
          created_at?: string
        }
      }
      channels: {
        Row: {
          id: number
          name: string
          description: string | null
          creator_id: string
          section_id: number
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          description?: string | null
          creator_id: string
          section_id: number
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          creator_id?: string
          section_id?: number
          position?: number
          created_at?: string
          updated_at?: string
        }
      }
      sections: {
        Row: {
          id: number
          name: string
          creator_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          creator_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          creator_id?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
