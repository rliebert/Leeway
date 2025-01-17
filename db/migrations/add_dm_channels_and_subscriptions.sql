-- Create DM channels table
CREATE TABLE dm_channels (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    initiator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- Create DM channel subscriptions table to manage participants
CREATE TABLE dm_channel_subscriptions (
    id SERIAL PRIMARY KEY,
    dm_channel_id INTEGER REFERENCES dm_channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(dm_channel_id, user_id)
);

-- Add indexes for better query performance
CREATE INDEX idx_dm_channel_subscriptions_channel ON dm_channel_subscriptions(dm_channel_id);
CREATE INDEX idx_dm_channel_subscriptions_user ON dm_channel_subscriptions(user_id);