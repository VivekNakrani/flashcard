-- Create stories table
CREATE TABLE IF NOT EXISTS stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    deck_name TEXT NOT NULL,
    title_de TEXT,
    title_en TEXT,
    level TEXT,
    r2_key TEXT,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, deck_name)
);

-- Index for listing stories by user
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
