# Leeway Database Schema

## Users Table (public.users)
- id: serial (primary key)
- username: text (unique, not null)
- password: text (not null) - Stores hashed passwords using scrypt for Passport.js local auth

## Sections Table (public.sections)
- id: serial (primary key)
- name: text (not null)
- creator_id: integer REFERENCES users.id
- created_at: timestamp

## Channels Table (public.channels)
- id: serial (primary key)
- name: text (unique, not null)
- description: text
- section_id: integer REFERENCES sections.id
- creator_id: integer REFERENCES users.id
- created_at: timestamp

## Messages Table (public.messages)
- id: serial (primary key)
- channel_id: integer REFERENCES channels.id
- user_id: integer REFERENCES users.id
- content: text (not null)
- created_at: timestamp
- updated_at: timestamp
- parent_id: integer REFERENCES messages.id - For thread replies

## File Attachments Table (public.file_attachments)
- id: serial (primary key)
- message_id: integer REFERENCES messages.id
- file_url: text (not null)
- file_name: text (not null)
- file_type: text (not null)
- file_size: integer (not null)
- created_at: timestamp

## Direct Messages Table (public.direct_messages)
- id: serial (primary key)
- sender_id: integer REFERENCES users.id
- recipient_id: integer REFERENCES users.id
- content: text (not null)
- created_at: timestamp

## DM Channels Table (public.dm_channels)
- id: serial (primary key)
- name: text (unique, not null)
- description: text
- creator_id: integer REFERENCES users.id
- created_at: timestamp
- order_index: integer (not null, default 0)

## Channel Subscriptions Table (public.channel_subscriptions)
- id: serial (primary key)
- user_id: integer REFERENCES users.id
- channel_id: integer REFERENCES channels.id
- dm_channel_id: integer REFERENCES dm_channels.id
- subscribed_at: timestamp

## Authentication Notes
- Using Passport.js local strategy for authentication
- Passwords are hashed using scrypt before storage
- Session management through Express session with MemoryStore
- Session data persisted server-side, client receives session ID cookie

## Database Notes
- All primary keys use auto-incrementing serial type
- Timestamps default to current time
- Foreign key constraints enforced at database level
- Indexes automatically created for primary and foreign keys
- Database URL provided through environment variables

## Relationships
- Users can create multiple sections and channels
- Sections can contain multiple channels
- Channels belong to one section (optional)
- Messages belong to one channel and one user
- Direct messages connect two users (sender and recipient)
- File attachments belong to one message
- Messages can have parent messages (for threads)

## Security Considerations
- Passwords never stored in plain text
- Session data stored server-side
- Database connections use SSL/TLS
- Foreign key constraints prevent orphaned records