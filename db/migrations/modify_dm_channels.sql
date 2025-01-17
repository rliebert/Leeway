-- Migration to update the dm_channels table

-- First, drop existing table if it exists to handle type changes
DROP TABLE IF EXISTS channel_subscriptions;
DROP TABLE IF EXISTS dm_channels;

-- Recreate dm_channels with correct UUID type
CREATE TABLE IF NOT EXISTS dm_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiator_id UUID REFERENCES users(id),
    invited_user_id UUID REFERENCES users(id),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create channel_subscriptions table
CREATE TABLE IF NOT EXISTS channel_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    channel_id UUID REFERENCES channels(id),
    dm_channel_id UUID REFERENCES dm_channels(id),
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint for initiator/invited pair
ALTER TABLE dm_channels ADD CONSTRAINT unique_dm_pair 
UNIQUE (initiator_id, invited_user_id); 