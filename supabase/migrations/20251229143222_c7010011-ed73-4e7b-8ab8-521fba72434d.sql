-- Backfill remote_jid for existing contacts that don't have it set
-- For contacts with normal phone numbers (10-15 digits), set remote_jid as phone@s.whatsapp.net
-- For contacts with LID-like identifiers (>15 digits), set remote_jid as phone@lid

UPDATE public.inbox_contacts
SET remote_jid = phone || '@s.whatsapp.net'
WHERE remote_jid IS NULL
  AND LENGTH(phone) >= 10
  AND LENGTH(phone) <= 15
  AND phone ~ '^\d+$';

UPDATE public.inbox_contacts
SET remote_jid = phone || '@lid'
WHERE remote_jid IS NULL
  AND LENGTH(phone) > 15
  AND phone ~ '^\d+$';