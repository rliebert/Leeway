ALTER TABLE dm_channels 
DROP COLUMN name,
DROP COLUMN description,

-- Add unique constraint for creator/recipient pair
ALTER TABLE dm_channels ADD CONSTRAINT unique_dm_pair 
UNIQUE (creator_id, recipient_id); 