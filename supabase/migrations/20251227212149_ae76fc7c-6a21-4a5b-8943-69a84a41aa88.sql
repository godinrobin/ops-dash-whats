-- Delete messages associated with invalid contacts (phone > 15 digits or @lid stored)
DELETE FROM inbox_messages 
WHERE contact_id IN (
  SELECT id FROM inbox_contacts 
  WHERE LENGTH(phone) > 15 
     OR remote_jid LIKE '%@lid'
);

-- Delete invalid contacts
DELETE FROM inbox_contacts 
WHERE LENGTH(phone) > 15 
   OR remote_jid LIKE '%@lid';