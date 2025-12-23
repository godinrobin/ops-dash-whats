-- Add unique constraint on inbox_tags to allow proper upsert
ALTER TABLE inbox_tags 
ADD CONSTRAINT inbox_tags_user_id_name_key UNIQUE (user_id, name);