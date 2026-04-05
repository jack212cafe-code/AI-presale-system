CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  vendor_preferences jsonb NOT NULL DEFAULT '{"preferred": [], "disliked": []}',
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
