-- Add dm_channel_id column to messages table
ALTER TABLE messages 
  ADD COLUMN dm_channel_id UUID REFERENCES dm_channels(id),
  ALTER COLUMN channel_id DROP NOT NULL;

-- Add index for dm_channel_id
CREATE INDEX idx_messages_dm_channel_id ON messages(dm_channel_id); 