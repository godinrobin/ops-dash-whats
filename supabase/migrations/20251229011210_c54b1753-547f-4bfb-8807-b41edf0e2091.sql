-- Step 1: Remove duplicates from inbox_messages by keeping the most recent entry per remote_message_id
-- First, identify and delete duplicates (keep the one with most recent created_at or highest id)
WITH duplicates AS (
  SELECT id, remote_message_id,
         ROW_NUMBER() OVER (PARTITION BY remote_message_id ORDER BY created_at DESC, id DESC) as rn
  FROM inbox_messages
  WHERE remote_message_id IS NOT NULL
)
DELETE FROM inbox_messages
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Create a partial unique index on remote_message_id (only for non-null values)
-- This allows upsert with onConflict: 'remote_message_id' to work properly
-- while still allowing multiple NULL values
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_remote_message_id_unique 
ON inbox_messages (remote_message_id) 
WHERE remote_message_id IS NOT NULL;