
-- Add creator_id and recipient_id columns
ALTER TABLE dm_channels 
ADD COLUMN creator_id UUID REFERENCES users(id),
ADD COLUMN recipient_id UUID REFERENCES users(id);

-- Add unique constraint for creator/recipient pair
ALTER TABLE dm_channels 
ADD CONSTRAINT unique_dm_pair UNIQUE (creator_id, recipient_id);
