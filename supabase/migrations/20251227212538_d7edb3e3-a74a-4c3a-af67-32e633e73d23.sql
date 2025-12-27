-- Delete messages for invalid contacts first (contacts with more than 13 digits are invalid)
DELETE FROM inbox_messages 
WHERE contact_id IN (
  SELECT id FROM inbox_contacts 
  WHERE LENGTH(phone) > 13
     OR LENGTH(phone) < 10
     OR remote_jid IS NULL
);

-- Delete invalid contacts (phone numbers with more than 13 digits are not real phone numbers)
DELETE FROM inbox_contacts 
WHERE LENGTH(phone) > 13
   OR LENGTH(phone) < 10
   OR remote_jid IS NULL;