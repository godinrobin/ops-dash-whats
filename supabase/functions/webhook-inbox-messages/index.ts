import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to log ingest events for debugging
const logIngestEvent = async (
  supabaseClient: any,
  data: {
    instanceId?: string;
    userId?: string;
    reason: string;
    phonePrefix?: string;
    remoteJid?: string;
    phoneSource?: string;
    ctwaSource?: string;
    payloadHash?: string;
    payloadSnippet?: any;
    eventType?: 'skip' | 'error';
  }
) => {
  try {
    await supabaseClient.from('ads_lead_ingest_logs').insert({
      instance_id: data.instanceId || null,
      user_id: data.userId || null,
      reason: data.reason,
      phone_prefix: data.phonePrefix || null,
      remote_jid: data.remoteJid || null,
      phone_source: data.phoneSource || null,
      ctwa_source: data.ctwaSource || null,
      payload_hash: data.payloadHash || null,
      payload_snippet: data.payloadSnippet || null,
      event_type: data.eventType || 'skip',
    });
    console.log(`[INGEST-LOG] Recorded: ${data.reason}`);
  } catch (err) {
    console.error('[INGEST-LOG] Failed to record:', err);
  }
};
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log request metadata for debugging
    const requestUrl = req.url;
    const requestMethod = req.method;
    const forwardedFor = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    
    console.log('=== WEBHOOK REQUEST RECEIVED ===');
    console.log(`URL: ${requestUrl}`);
    console.log(`Method: ${requestMethod}`);
    console.log(`IP: ${forwardedFor}`);
    console.log(`User-Agent: ${userAgent}`);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawBody = await req.text();
    console.log('Raw request body:', rawBody);
    
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse JSON payload:', parseError);
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Webhook payload parsed:', JSON.stringify(payload, null, 2));

    // Evolution API sends different event types
    const event = payload.event || payload.type;
    const instance = payload.instance || payload.instanceName;
    const data = payload.data || payload;

    // Handle messages.upsert event (new incoming message)
    if (event === 'messages.upsert' || event === 'message' || event === 'MESSAGES_UPSERT') {
      // Evolution API v2 structure: data.key contains remoteJid/remoteJidAlt, data.message contains content
      // Fallback to old structure (data.message.key) for backwards compatibility
      const key = data.key || data.message?.key || {};
      const messageId = key.id;
      const isFromMe = key.fromMe === true;
      
      // Check if this outgoing message was sent by our platform
      if (isFromMe && messageId) {
        const { data: existingMessage } = await supabaseClient
          .from('inbox_messages')
          .select('id')
          .eq('remote_message_id', messageId)
          .maybeSingle();
        
        if (existingMessage) {
          console.log('Skipping outgoing message sent by platform:', messageId);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'sent_by_platform' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        console.log('Processing outgoing message from external source (WhatsApp Web/Mobile):', messageId);
      }

      const remoteJid = key.remoteJid || '';
      const remoteJidAlt = key.remoteJidAlt || '';
      
      console.log(`Message JIDs: remoteJid=${remoteJid}, remoteJidAlt=${remoteJidAlt}`);
      
      // Skip group messages (@g.us)
      if (remoteJid.includes('@g.us') || remoteJidAlt?.includes('@g.us')) {
        console.log('Skipping group message');
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'group_message' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Find valid phone from multiple sources
      // Priority: remoteJid > remoteJidAlt > participant > participantAlt > contextInfo
      // ONLY accept @s.whatsapp.net format - reject @lid (internal IDs)
      let jidForPhone = '';
      let phoneSource = '';
      
      // Get participant fields (used in ads/group-like messages)
      const participant = key.participant || '';
      const participantAlt = key.participantAlt || '';
      
      // Get contextInfo fields (often contains real phone for ad messages)
      const contextInfo = data.contextInfo || {};
      const contextParticipant = contextInfo.participant || '';
      
      // Get sender field (some Evolution versions use this for ads)
      const sender = payload.sender || '';
      
      // Get data.sender field (alternative location in some API versions)
      const dataSender = data.sender || '';
      
      // Get pushName for last-resort phone extraction (some rare cases)
      const pushNameRaw = data.pushName || '';
      const pushNamePhone = pushNameRaw.match(/^\+?(\d{10,15})$/)?.[1] || '';
      
      console.log(`[AD-DEBUG] Checking all JID sources:`);
      console.log(`  remoteJid=${remoteJid}`);
      console.log(`  remoteJidAlt=${remoteJidAlt}`);
      console.log(`  participant=${participant}`);
      console.log(`  participantAlt=${participantAlt}`);
      console.log(`  contextInfo.participant=${contextParticipant}`);
      console.log(`  payload.sender=${sender}`);
      console.log(`  data.sender=${dataSender}`);
      console.log(`  pushName=${pushNameRaw} (extracted phone: ${pushNamePhone})`);
      console.log(`  addressingMode=${key.addressingMode || 'none'}`);
      
      // Helper function to validate and extract JID
      const isValidPhoneJid = (jid: string): boolean => {
        if (!jid) return false;
        if (!jid.includes('@s.whatsapp.net')) return false;
        const phone = jid.split('@')[0].replace(/\D/g, '');
        // Must be 10-15 digits (international phone numbers)
        return phone.length >= 10 && phone.length <= 15;
      };
      
      // 1. Try remoteJid with @s.whatsapp.net
      if (isValidPhoneJid(remoteJid)) {
        jidForPhone = remoteJid;
        phoneSource = 'remoteJid';
      } 
      // 2. Try remoteJidAlt with @s.whatsapp.net
      else if (isValidPhoneJid(remoteJidAlt)) {
        jidForPhone = remoteJidAlt;
        phoneSource = 'remoteJidAlt';
      }
      // 3. Try participant (for ads/group-like messages where remoteJid is @lid)
      else if (isValidPhoneJid(participant)) {
        jidForPhone = participant;
        phoneSource = 'participant';
      }
      // 4. Try participantAlt (commonly used for Facebook ad messages)
      else if (isValidPhoneJid(participantAlt)) {
        jidForPhone = participantAlt;
        phoneSource = 'participantAlt';
      }
      // 5. Try contextInfo.participant (another source for ad messages)
      else if (isValidPhoneJid(contextParticipant)) {
        jidForPhone = contextParticipant;
        phoneSource = 'contextInfo.participant';
      }
      // 6. Try data.sender (some Evolution versions put it here)
      else if (isValidPhoneJid(dataSender)) {
        jidForPhone = dataSender;
        phoneSource = 'data.sender';
      }
      // 7. Try payload.sender (fallback for some Evolution versions)
      else if (isValidPhoneJid(sender)) {
        jidForPhone = sender;
        phoneSource = 'payload.sender';
      }
      
      // If we have @lid remoteJid but no valid phone yet, this is likely an ad message
      // Log extra debug info to help diagnose
      if (!jidForPhone && remoteJid.includes('@lid')) {
        console.log(`[AD-MESSAGE] Detected @lid message (likely from ad/CTWA), searching for phone...`);
        console.log(`  Full data object keys: ${Object.keys(data).join(', ')}`);
        console.log(`  Full key object: ${JSON.stringify(key)}`);
        console.log(`  Full contextInfo: ${JSON.stringify(contextInfo)}`);
        
        // Try to find phone in any nested field
        const findPhoneInObject = (obj: any, path: string = ''): string | null => {
          if (!obj || typeof obj !== 'object') return null;
          
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string' && v.includes('@s.whatsapp.net') && isValidPhoneJid(v)) {
              console.log(`[AD-MESSAGE] Found phone at ${path}.${k}: ${v}`);
              return v;
            }
            if (typeof v === 'object' && v !== null) {
              const found = findPhoneInObject(v, `${path}.${k}`);
              if (found) return found;
            }
          }
          return null;
        };
        
        const foundPhone = findPhoneInObject(data, 'data');
        if (foundPhone) {
          jidForPhone = foundPhone;
          phoneSource = 'deep_search';
          console.log(`[AD-MESSAGE] Deep search found phone: ${foundPhone}`);
        }
      }
      
      // 8. Last resort: try to extract phone from pushName if it looks like a phone number
      if (!jidForPhone && pushNamePhone) {
        jidForPhone = `${pushNamePhone}@s.whatsapp.net`;
        phoneSource = 'pushName_extracted';
        console.log(`[AD-MESSAGE] Last resort: extracted phone from pushName: ${pushNamePhone}`);
      }
      
      // If still no valid JID found, log detailed info and skip
      if (!jidForPhone) {
        // Generate a hash of the payload for later analysis
        const payloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
        const hashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        
        console.error(`[CRITICAL-SKIP] No valid phone found - hash: ${hashHex}`);
        console.error(`[CRITICAL-SKIP] All sources checked:`);
        console.error(`  remoteJid=${remoteJid}`);
        console.error(`  remoteJidAlt=${remoteJidAlt}`);
        console.error(`  participant=${participant}`);
        console.error(`  participantAlt=${participantAlt}`);
        console.error(`  contextParticipant=${contextParticipant}`);
        console.error(`  sender=${sender}`);
        console.error(`  dataSender=${dataSender}`);
        console.error(`  pushName=${pushNameRaw}`);
        console.error(`  addressingMode=${key.addressingMode || 'none'}`);
        console.error(`  Full payload: ${JSON.stringify(payload).substring(0, 2000)}`);
        
        // Log to database for UI diagnosis
        await logIngestEvent(supabaseClient, {
          reason: 'no_valid_phone_jid',
          remoteJid: remoteJid || remoteJidAlt || 'none',
          phoneSource: 'none',
          payloadHash: hashHex,
          payloadSnippet: { remoteJid, remoteJidAlt, participant, participantAlt, addressingMode: key.addressingMode },
          eventType: 'skip',
        });
        
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: 'no_valid_phone_jid',
          hash: hashHex,
          debug: { remoteJid, remoteJidAlt, participant, participantAlt, contextParticipant, sender, dataSender, pushName: pushNameRaw, addressingMode: key.addressingMode }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log(`[PHONE] Using ${phoneSource} for phone extraction: ${jidForPhone}`);
      
      const rawPhone = jidForPhone.split('@')[0];
      // Clean and validate phone number
      const phone = rawPhone.replace(/\D/g, '');
      
      console.log(`Phone extraction: jidForPhone=${jidForPhone}, extracted=${phone}`);
      
      // Validate phone is 10-15 digits (international numbers can have up to 15 digits per E.164)
      if (!/^\d{10,15}$/.test(phone)) {
        console.log(`Skipping message with invalid phone length: ${rawPhone} (${phone.length} digits)`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'invalid_phone_length' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Phone validation: Accept any valid E.164 format (10-15 digits)
      // No country prefix restriction - accept international numbers from all countries
      console.log(`[PHONE] Validated international phone: ${phone} (${phone.length} digits, prefix: ${phone.substring(0, 3)})`);
      
      // Store phone source for debugging
      const debugPhoneInfo = { phone, phoneSource, length: phone.length, prefix: phone.substring(0, 3) };
      
      // Extract message content - Evolution API v2 structure
      // data.message contains the actual message object with conversation/extendedTextMessage/etc
      const msgContent = data.message || {};
      let content = '';
      let messageType = 'text';
      let mediaUrl = null;

      if (msgContent.conversation) {
        content = msgContent.conversation;
      } else if (msgContent.extendedTextMessage?.text) {
        content = msgContent.extendedTextMessage.text;
      } else if (msgContent.imageMessage) {
        messageType = 'image';
        content = msgContent.imageMessage.caption || '';
        mediaUrl = msgContent.imageMessage.url || null;
      } else if (msgContent.audioMessage) {
        messageType = 'audio';
        mediaUrl = msgContent.audioMessage.url || null;
      } else if (msgContent.videoMessage) {
        messageType = 'video';
        content = msgContent.videoMessage.caption || '';
        mediaUrl = msgContent.videoMessage.url || null;
      } else if (msgContent.documentMessage) {
        messageType = 'document';
        content = msgContent.documentMessage.fileName || '';
        mediaUrl = msgContent.documentMessage.url || null;
      } else if (msgContent.stickerMessage) {
        messageType = 'sticker';
        mediaUrl = msgContent.stickerMessage.url || null;
      }
      
      // pushName is at data root level in Evolution API v2
      const pushName = data.pushName || null;

      console.log(`Processing message from ${phone}: ${messageType} - ${content?.substring(0, 50)}`);

      // Find the instance in our database (including label and phone for pushName validation)
      const { data: instanceData, error: instanceError } = await supabaseClient
        .from('maturador_instances')
        .select('id, user_id, label, instance_name, phone_number')
        .eq('instance_name', instance)
        .single();

      if (instanceError || !instanceData) {
        console.log('Instance not found:', instance);
        return new Response(JSON.stringify({ success: false, error: 'Instance not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userId = instanceData.user_id;
      const instanceId = instanceData.id;
      
      // Get instance identifiers to check for suspicious pushName
      const normalizeComparable = (value: string): string => {
        return value
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z]/g, '');
      };

      const instanceLabelNorm = normalizeComparable(instanceData.label || '');
      const instanceNameNorm = normalizeComparable(instanceData.instance_name || '');

      // Function to check if pushName is suspicious (matches instance name/label)
      const isSuspiciousPushName = (name: string | null): boolean => {
        if (!name) return true;
        const nameNorm = normalizeComparable(name);
        if (!nameNorm) return true;

        // Check if pushName matches/contains instance label/name (normalized)
        if (instanceLabelNorm && (nameNorm === instanceLabelNorm || nameNorm.includes(instanceLabelNorm) || instanceLabelNorm.includes(nameNorm))) {
          console.log(`Suspicious pushName detected: "${name}" matches instance label "${instanceData.label}"`);
          return true;
        }
        if (instanceNameNorm && (nameNorm === instanceNameNorm || nameNorm.includes(instanceNameNorm) || instanceNameNorm.includes(nameNorm))) {
          console.log(`Suspicious pushName detected: "${name}" matches instance name "${instanceData.instance_name}"`);
          return true;
        }
        return false;
      };

      // Validate pushName - only use it if it's not suspicious
      const validPushName = pushName && !isSuspiciousPushName(pushName) ? pushName : null;

      // Find or create contact - search by user_id + instance_id + phone
      // This allows SEPARATE chats per instance for the same phone number
      let { data: contact, error: contactError } = await supabaseClient
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', userId)
        .eq('instance_id', instanceId)
        .eq('phone', phone)
        .maybeSingle();

      // === HEALING: Check for orphan contact with null instance_id ===
      if (!contact) {
        const { data: orphanContact } = await supabaseClient
          .from('inbox_contacts')
          .select('*')
          .eq('user_id', userId)
          .is('instance_id', null)
          .eq('phone', phone)
          .maybeSingle();
        
        if (orphanContact) {
          console.log(`[HEALING] Found orphan contact ${orphanContact.id} with null instance_id, adopting to instance ${instanceId}`);
          
          // Determine the best remote_jid to store
          let remoteJidToStore = remoteJid;
          if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
            remoteJidToStore = remoteJidAlt;
          } else if (!remoteJid.includes('@s.whatsapp.net') && remoteJidAlt) {
            remoteJidToStore = remoteJidAlt;
          }
          
          // Update the orphan contact with instance_id
          await supabaseClient
            .from('inbox_contacts')
            .update({ 
              instance_id: instanceId,
              remote_jid: remoteJidToStore || orphanContact.remote_jid
            })
            .eq('id', orphanContact.id);
          
          contact = { ...orphanContact, instance_id: instanceId, remote_jid: remoteJidToStore || orphanContact.remote_jid };
          console.log(`[HEALING] Orphan contact ${contact.id} adopted successfully`);
        }
      }

      if (!contact) {
        // Determine the best remote_jid to store (prefer remoteJidAlt if it's a valid @s.whatsapp.net)
        let remoteJidToStore = remoteJid;
        if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
          remoteJidToStore = remoteJidAlt;
        } else if (!remoteJid.includes('@s.whatsapp.net') && remoteJidAlt) {
          remoteJidToStore = remoteJidAlt;
        }

        // Create new contact using upsert to handle race conditions
        const { data: newContact, error: insertError } = await supabaseClient
          .from('inbox_contacts')
          .upsert({
            user_id: userId,
            instance_id: instanceId,
            phone,
            name: validPushName,
            status: 'active',
            unread_count: 1,
            last_message_at: new Date().toISOString(),
            remote_jid: remoteJidToStore,
          }, {
            onConflict: 'user_id,instance_id,phone',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating contact:', insertError);
          // Try to fetch existing contact in case of race condition
          const { data: existingContact } = await supabaseClient
            .from('inbox_contacts')
            .select('*')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('phone', phone)
            .single();
          
          if (existingContact) {
            contact = existingContact;
          } else {
            return new Response(JSON.stringify({ success: false, error: 'Failed to create contact' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          contact = newContact;
          console.log(`Created contact with remote_jid: ${remoteJidToStore}`);
        }
      } else {
        // Update existing contact - BUT NOT last_message_at yet (will update after message is saved)
        const updates: Record<string, any> = {};
        
        // Only increment unread for inbound messages (not fromMe)
        if (!isFromMe) {
          updates.unread_count = (contact.unread_count || 0) + 1;
        }
        
        // Only update name if we have a valid (non-suspicious) pushName and contact doesn't have a name yet
        // or if the new pushName is different and valid
        if (validPushName && validPushName.trim() && (!contact.name || contact.name !== validPushName)) {
          updates.name = validPushName;
        }

        // Update remote_jid if not already set
        if (!contact.remote_jid) {
          let remoteJidToStore = remoteJid;
          if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
            remoteJidToStore = remoteJidAlt;
          } else if (!remoteJid.includes('@s.whatsapp.net') && remoteJidAlt) {
            remoteJidToStore = remoteJidAlt;
          }
          if (remoteJidToStore) {
            updates.remote_jid = remoteJidToStore;
            console.log(`[WEBHOOK] Updating contact ${contact.id} with remote_jid: ${remoteJidToStore}`);
          }
        }
        
        // Only update if there are changes (don't update last_message_at here)
        if (Object.keys(updates).length > 0) {
          await supabaseClient
            .from('inbox_contacts')
            .update(updates)
            .eq('id', contact.id);
        }
      }

      // Determine message direction based on fromMe flag
      const direction = isFromMe ? 'outbound' : 'inbound';
      
      // For outbound messages (isFromMe), check if this message was already saved by the flow processor
      if (isFromMe && messageId) {
        const { data: existingFlowMessage } = await supabaseClient
          .from('inbox_messages')
          .select('id')
          .eq('remote_message_id', messageId)
          .maybeSingle();
        
        if (existingFlowMessage) {
          console.log('Skipping duplicate outbound message (already saved by flow):', messageId);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already_exists' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Check if message with this remote_message_id already exists
      if (messageId) {
        const { data: existingMsg } = await supabaseClient
          .from('inbox_messages')
          .select('id')
          .eq('remote_message_id', messageId)
          .maybeSingle();
        
        if (existingMsg) {
          console.log('[WEBHOOK] Message already exists, skipping:', messageId);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate_message' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Save the message using insert
      const { data: savedMessage, error: messageError } = await supabaseClient
        .from('inbox_messages')
        .insert({
          contact_id: contact.id,
          instance_id: instanceId,
          user_id: userId,
          direction,
          message_type: messageType,
          content,
          media_url: mediaUrl,
          remote_message_id: messageId,
          status: isFromMe ? 'sent' : 'delivered',
          is_from_flow: false,
        })
        .select('id')
        .maybeSingle();

      if (messageError) {
        // If it's a duplicate error, just log and continue
        if (messageError.code === '23505') {
          console.log('[WEBHOOK] Duplicate message (race condition), skipping:', messageId);
        } else {
          console.error('[WEBHOOK] Error saving message:', messageError);
          return new Response(JSON.stringify({ success: false, error: 'Failed to save message' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Only update contact's last_message_at AFTER message was saved successfully
      if (savedMessage) {
        await supabaseClient
          .from('inbox_contacts')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', contact.id);
        console.log('[WEBHOOK] Message saved successfully, contact last_message_at updated');
      }

      // === ADS LEAD TRACKING ===
      // Check if this WhatsApp number is being monitored for ads leads
      if (!isFromMe) {
        try {
          const { data: monitoredNumber } = await supabaseClient
            .from('ads_whatsapp_numbers')
            .select('id, user_id')
            .eq('instance_id', instanceId)
            .eq('is_active', true)
            .maybeSingle();

          if (monitoredNumber) {
            console.log(`[ADS LEAD] Monitored number found for instance ${instanceId}`);
            
            // Extract ctwa_clid from message content (Click-to-WhatsApp tracking ID)
            // Format: ctwa_clid=XXXXXXXX or referral data
            let ctwaClid: string | null = null;
            let fbclid: string | null = null;
            
            let ctwaSource = 'none';
            let fbclidSource = 'none';
            
            // === ENHANCED CTWA/FBCLID EXTRACTION ===
            // 1. Check structured fields first (most reliable for CTWA ads)
            const referral = data.contextInfo?.externalAdReply || data.message?.contextInfo?.externalAdReply || {};
            const messageContextInfo = data.message?.extendedTextMessage?.contextInfo || data.message?.contextInfo || {};
            const externalAdReply = messageContextInfo.externalAdReply || {};
            
            // Try to extract from referral/externalAdReply (Meta's official structure)
            if (referral.containsAutoReply !== undefined || externalAdReply.sourceUrl) {
              console.log(`[ADS LEAD] Found externalAdReply structure:`, JSON.stringify({ referral, externalAdReply }));
            }
            
            // Extract source_url from various locations
            const sourceUrls = [
              referral.sourceUrl,
              externalAdReply.sourceUrl,
              messageContextInfo.sourceUrl,
              data.contextInfo?.sourceUrl,
            ].filter(Boolean);
            
            // Parse URLs for tracking parameters
            for (const url of sourceUrls) {
              try {
                const urlObj = new URL(url);
                const params = urlObj.searchParams;
                
                if (!ctwaClid && params.get('ctwa_clid')) {
                  ctwaClid = params.get('ctwa_clid');
                  ctwaSource = 'url_param';
                  console.log(`[ADS LEAD] Extracted ctwa_clid from URL: ${ctwaClid}`);
                }
                if (!fbclid && params.get('fbclid')) {
                  fbclid = params.get('fbclid');
                  fbclidSource = 'url_param';
                  console.log(`[ADS LEAD] Extracted fbclid from URL: ${fbclid}`);
                }
              } catch (e) {
                // Invalid URL, skip
              }
            }
            
            // 2. Check for referral data (Facebook Ads referral structure)
            const referralData = data.referral || data.message?.referral || messageContextInfo.referral || {};
            if (!ctwaClid && referralData.ctwa_clid) {
              ctwaClid = referralData.ctwa_clid;
              ctwaSource = 'referral_data';
              console.log(`[ADS LEAD] Extracted ctwa_clid from referral: ${ctwaClid}`);
            }
            if (!fbclid && referralData.fbclid) {
              fbclid = referralData.fbclid;
              fbclidSource = 'referral_data';
              console.log(`[ADS LEAD] Extracted fbclid from referral: ${fbclid}`);
            }
            
            // 3. Check for headline/body that might contain tracking info
            const adTitle = referral.title || externalAdReply.title || '';
            const adBody = referral.body || externalAdReply.body || '';
            
            // 4. Deep search in entire data object for ctwa_clid
            if (!ctwaClid) {
              const findCtwaInObject = (obj: any, path: string = ''): string | null => {
                if (!obj || typeof obj !== 'object') return null;
                for (const [k, v] of Object.entries(obj)) {
                  if (k === 'ctwa_clid' && typeof v === 'string') {
                    console.log(`[ADS LEAD] Deep search found ctwa_clid at ${path}.${k}`);
                    return v;
                  }
                  if (typeof v === 'object' && v !== null) {
                    const found = findCtwaInObject(v, `${path}.${k}`);
                    if (found) return found;
                  }
                }
                return null;
              };
              const deepCtwa = findCtwaInObject(data, 'data');
              if (deepCtwa) {
                ctwaClid = deepCtwa;
                ctwaSource = 'deep_search';
              }
            }
            
            // 5. Fallback: Check message content (text) for tracking IDs
            if (!ctwaClid) {
              const ctwaMatch = content?.match(/ctwa_clid[=:]\s*([a-zA-Z0-9_-]+)/i);
              if (ctwaMatch) {
                ctwaClid = ctwaMatch[1];
                ctwaSource = 'message_content';
                console.log(`[ADS LEAD] Extracted ctwa_clid from content: ${ctwaClid}`);
              }
            }
            
            if (!fbclid) {
              const fbclidMatch = content?.match(/fbclid[=:]\s*([a-zA-Z0-9_-]+)/i);
              if (fbclidMatch) {
                fbclid = fbclidMatch[1];
                fbclidSource = 'message_content';
                console.log(`[ADS LEAD] Extracted fbclid from content: ${fbclid}`);
              }
            }
            
            console.log(`[ADS LEAD] Final extraction: ctwa_clid=${ctwaClid || 'none'} (source: ${ctwaSource}), fbclid=${fbclid || 'none'} (source: ${fbclidSource})`);
            
            // Store extraction metadata for debugging
            const extractionMeta = { ctwaSource, fbclidSource, adTitle: adTitle?.substring(0, 50), adBody: adBody?.substring(0, 50) };
            
            // Check if lead already exists
            const { data: existingLead } = await supabaseClient
              .from('ads_whatsapp_leads')
              .select('id')
              .eq('phone', phone)
              .eq('whatsapp_number_id', monitoredNumber.id)
              .maybeSingle();

            if (!existingLead) {
              // Create new lead
              const { error: leadError } = await supabaseClient
                .from('ads_whatsapp_leads')
                .insert({
                  user_id: monitoredNumber.user_id,
                  phone,
                  name: validPushName,
                  whatsapp_number_id: monitoredNumber.id,
                  instance_id: instanceId,
                  ctwa_clid: ctwaClid,
                  fbclid: fbclid,
                  first_message: content?.substring(0, 500),
                  first_contact_at: new Date().toISOString(),
                });

              if (leadError) {
                console.error('[ADS LEAD] Error creating lead:', leadError);
              } else {
                console.log(`[ADS LEAD] New lead created for phone ${phone}`);
              }
            } else {
              console.log(`[ADS LEAD] Lead already exists for phone ${phone}`);
            }
          }
        } catch (leadTrackingError) {
          console.error('[ADS LEAD] Error in lead tracking:', leadTrackingError);
          // Don't fail the whole webhook if lead tracking fails
        }
      }

      // Skip flow processing for outbound messages (sent from WhatsApp Web/Mobile)
      if (isFromMe) {
        console.log('Outbound message saved successfully (from WhatsApp Web/Mobile)');
        return new Response(JSON.stringify({ success: true, outbound: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if flow is paused for this contact - skip all flow processing
      if (contact.flow_paused === true) {
        console.log(`Flow is paused for contact ${contact.id}, skipping all flow processing`);
        return new Response(JSON.stringify({ success: true, flowPaused: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // === FLOW SESSION HANDLING ===
      // First, check for active flow sessions waiting for input (waitInput or menu)
      const { data: activeSession } = await supabaseClient
        .from('inbox_flow_sessions')
        .select('*, flow:inbox_flows(*)')
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .order('last_interaction', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        const flowNodes = (activeSession.flow?.nodes || []) as Array<{ id: string; type: string; data: Record<string, unknown> }>;
        const currentNode = flowNodes.find((n: { id: string }) => n.id === activeSession.current_node_id);
        
        // Check if session is currently being processed (locked)
        if (activeSession.processing) {
          const lockAge = activeSession.processing_started_at 
            ? Date.now() - new Date(activeSession.processing_started_at).getTime() 
            : 0;
          
          // If lock is not stale (less than 60 seconds), skip processing
          if (lockAge < 60000) {
            console.log(`Session ${activeSession.id} is locked (${lockAge}ms), skipping to prevent duplicate processing`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'session_locked' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          console.log(`Session ${activeSession.id} has stale lock (${lockAge}ms), proceeding`);
        }
        
        // Check if the current node is waiting for input
        if (currentNode && (currentNode.type === 'waitInput' || currentNode.type === 'menu')) {
          console.log(`Found active session ${activeSession.id} waiting for input at node ${currentNode.id}`);
          
          // Check if message is media without text content - if so, IGNORE it and keep waiting
          const isMediaMessage = ['image', 'audio', 'video', 'document', 'sticker'].includes(messageType);
          const hasTextContent = content && content.trim().length > 0;
          
          if (isMediaMessage && !hasTextContent) {
            console.log(`[WAIT_INPUT] Ignoring media message (${messageType}) without caption - flow continues waiting for text input`);
            return new Response(JSON.stringify({ 
              success: true, 
              skipped: true, 
              reason: 'ignored_media_while_waiting_input',
              messageType,
              sessionId: activeSession.id
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          console.log(`[WAIT_INPUT] Valid input received: ${messageType} with content: "${content?.substring(0, 50)}"`);
          
          // Cancel any pending timeout job for this session
          const { error: cancelError } = await supabaseClient
            .from('inbox_flow_delay_jobs')
            .update({ 
              status: 'done',
              updated_at: new Date().toISOString()
            })
            .eq('session_id', activeSession.id)
            .eq('status', 'scheduled');
          
          if (cancelError) {
            console.error('Error canceling timeout job:', cancelError);
          } else {
            console.log('Timeout job canceled (if any)');
          }
          
          // Clear timeout_at from session
          await supabaseClient
            .from('inbox_flow_sessions')
            .update({ timeout_at: null })
            .eq('id', activeSession.id);
          
          // Process the user's input and continue the flow
          try {
            const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
            const processResponse = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ sessionId: activeSession.id, userInput: content }),
            });
            
            if (!processResponse.ok) {
              const errorText = await processResponse.text();
              console.error('Error processing user input:', errorText);
            } else {
              console.log('User input processed, flow continued');
            }
          } catch (flowError) {
            console.error('Error calling process-inbox-flow for input:', flowError);
          }
          
          // Don't trigger new flows since we're continuing an existing one
          console.log('Message processed successfully (continuing flow)');
          return new Response(JSON.stringify({ success: true, flowContinued: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Check if there's already ANY active session for this contact
      // This prevents duplicate flows from triggering
      const { data: allActiveSessions } = await supabaseClient
        .from('inbox_flow_sessions')
        .select('id, started_at, current_node_id, flow_id')
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      // Auto-correction: if there are multiple active sessions, keep only the most recent one
      if (allActiveSessions && allActiveSessions.length > 1) {
        console.log(`Found ${allActiveSessions.length} active sessions for contact ${contact.id}, cleaning up duplicates`);
        const [mostRecent, ...duplicates] = allActiveSessions;
        
        // Mark duplicates as completed
        for (const dup of duplicates) {
          await supabaseClient
            .from('inbox_flow_sessions')
            .update({ status: 'completed' })
            .eq('id', dup.id);
          console.log(`Marked duplicate session ${dup.id} as completed`);
        }
      }

      const anyActiveSession = allActiveSessions?.[0];

      if (anyActiveSession) {
        const sessionAge = Date.now() - new Date(anyActiveSession.started_at).getTime();
        // If there's an active session (regardless of age), don't trigger new flow
        // This prevents duplicate flows when user sends multiple messages quickly
        // The existing session will handle the messages through waitInput/menu nodes
        console.log(`Active session ${anyActiveSession.id} exists (${sessionAge}ms old, at node: ${anyActiveSession.current_node_id})`);
        
        // Only allow new flow trigger if session is older than 1 hour (stale session)
        if (sessionAge < 3600000) {
          console.log(`Skipping flow trigger - active session exists and is not stale`);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'active_session_exists' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          console.log(`Session is stale (${sessionAge}ms), marking as completed and allowing new flow`);
          await supabaseClient
            .from('inbox_flow_sessions')
            .update({ status: 'completed' })
            .eq('id', anyActiveSession.id);
        }
      }

      // Check for recently completed sessions to prevent flow restart
      // If a flow completed recently (within 1 hour), don't trigger the same flow again
      const { data: recentlyCompletedSession } = await supabaseClient
        .from('inbox_flow_sessions')
        .select('id, flow_id, status')
        .eq('contact_id', contact.id)
        .eq('status', 'completed')
        .order('last_interaction', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const completedFlowId = recentlyCompletedSession?.flow_id;

      // Check for active flows to trigger (only if no active session is waiting for input)
      const { data: flows, error: flowsError } = await supabaseClient
        .from('inbox_flows')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      console.log(`[FLOW DEBUG] Found ${flows?.length || 0} active flows for user ${userId}`);
      if (flowsError) {
        console.error('[FLOW DEBUG] Error fetching flows:', flowsError);
      }

      if (!flows || flows.length === 0) {
        console.log('[FLOW DEBUG] No active flows found, message saved without flow trigger');
        return new Response(JSON.stringify({ success: true, noActiveFlows: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!content || content.trim() === '') {
        console.log('[FLOW DEBUG] Message has no text content (type=' + messageType + '), skipping keyword flow trigger');
        console.log('[FLOW DEBUG] Note: Media messages (audio, image, video) without text won\'t trigger keyword-based flows');
        return new Response(JSON.stringify({ success: true, noContent: true, messageType }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Count total messages from this contact to determine if this is first message
      const { count: messageCount } = await supabaseClient
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contact.id)
        .eq('direction', 'inbound');
      
      const isFirstMessage = (messageCount || 0) <= 1;
      console.log(`[FLOW DEBUG] Contact ${contact.id} message count: ${messageCount}, isFirstMessage: ${isFirstMessage}`);

      for (const flow of flows) {
        console.log(`[FLOW DEBUG] Checking flow "${flow.name}" (id: ${flow.id})`);
        console.log(`[FLOW DEBUG] - trigger_type: ${flow.trigger_type}`);
        console.log(`[FLOW DEBUG] - trigger_keywords: ${JSON.stringify(flow.trigger_keywords)}`);
        console.log(`[FLOW DEBUG] - assigned_instances: ${JSON.stringify(flow.assigned_instances)}`);
        console.log(`[FLOW DEBUG] - current instanceId: ${instanceId}`);
        
        let shouldTrigger = false;

        // Check if this flow is assigned to specific instances
        const assignedInstances = flow.assigned_instances as string[] || [];
        if (assignedInstances.length > 0 && !assignedInstances.includes(instanceId)) {
          console.log(`[FLOW DEBUG] Flow "${flow.name}" NOT assigned to instance ${instanceId}, skipping`);
          continue;
        }
        console.log(`[FLOW DEBUG] Flow "${flow.name}" instance check PASSED`);

        // IMPORTANT: Check if this flow was already completed for this contact
        // This prevents the flow from restarting after it finishes
        if (completedFlowId === flow.id) {
          console.log(`[FLOW DEBUG] Flow "${flow.name}" already completed for contact ${contact.id}, skipping`);
          continue;
        }
        console.log(`[FLOW DEBUG] Flow "${flow.name}" completion check PASSED (completedFlowId: ${completedFlowId})`);

        if (flow.trigger_type === 'all') {
          // For 'all' trigger type, only trigger on FIRST message to prevent looping
          if (isFirstMessage) {
            shouldTrigger = true;
            console.log(`[FLOW DEBUG] Flow "${flow.name}" triggered (trigger_type: all, first message)`);
          } else {
            console.log(`[FLOW DEBUG] Flow "${flow.name}" skipped - trigger_type 'all' only on first message`);
          }
        } else if (flow.trigger_type === 'keyword') {
          const keywords = flow.trigger_keywords as string[] || [];
          if (keywords.length === 0) {
            console.log(`[FLOW DEBUG] Flow "${flow.name}" has NO keywords configured, skipping`);
            continue;
          }
          const lowerContent = content.toLowerCase();
          console.log(`[FLOW DEBUG] Checking keywords: ${JSON.stringify(keywords)} against content: "${lowerContent}"`);
          for (const kw of keywords) {
            const match = lowerContent.includes(kw.toLowerCase());
            console.log(`[FLOW DEBUG] - keyword "${kw}" match: ${match}`);
            if (match) {
              shouldTrigger = true;
              console.log(`[FLOW DEBUG] Flow "${flow.name}" TRIGGERED by keyword "${kw}"`);
              break;
            }
          }
          if (!shouldTrigger) {
            console.log(`[FLOW DEBUG] Flow "${flow.name}" no keyword match`);
          }
        } else {
          console.log(`[FLOW DEBUG] Flow "${flow.name}" has unknown trigger_type: ${flow.trigger_type}`);
        }

        if (shouldTrigger) {
            // Check if this is a media message and flow has pause_on_media enabled
            // Only pause for image or document (PDF), NOT for video or audio
            if ((messageType === 'image' || messageType === 'document') && flow.pause_on_media === true) {
              console.log(`Media message (${messageType}) received and flow ${flow.name} has pause_on_media enabled`);
              
              // Pause the flow for this contact
              await supabaseClient
                .from('inbox_contacts')
                .update({ flow_paused: true })
                .eq('id', contact.id);
              
              console.log(`Flow paused for contact ${contact.id} due to media message`);
              
              // Don't trigger the flow, just pause
              return new Response(JSON.stringify({ success: true, flowPausedByMedia: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            
            console.log(`[FLOW DEBUG] *** TRIGGERING FLOW "${flow.name}" for contact ${contact.id} ***`);
            
            // Use upsert with ON CONFLICT to prevent duplicate active sessions
            // The unique index idx_inbox_flow_sessions_unique_active ensures only one active session per flow+contact
            const sessionPayload = {
              flow_id: flow.id,
              contact_id: contact.id,
              instance_id: instanceId,
              user_id: userId,
              current_node_id: 'start-1',
              variables: { 
                nome: contact.name || '',
                telefone: phone,
                resposta: '',
                lastMessage: content,
                contactName: contact.name || phone,
                ultima_mensagem: content,
              },
              status: 'active',
              processing: false,
              processing_started_at: null,
            };
            console.log(`[FLOW DEBUG] Session payload:`, JSON.stringify(sessionPayload));
            
            const { data: newSession, error: sessionError } = await supabaseClient
              .from('inbox_flow_sessions')
              .upsert(sessionPayload, {
                onConflict: 'flow_id,contact_id',
                ignoreDuplicates: false,
              })
              .select()
              .single();

            // Execute the flow immediately after creating/updating session
            if (newSession && !sessionError) {
              console.log(`[FLOW DEBUG] Session created successfully: ${newSession.id}`);
              console.log(`[FLOW DEBUG] Executing flow for session ${newSession.id}`);
              try {
                const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-inbox-flow`;
                console.log(`[FLOW DEBUG] Calling process-inbox-flow at: ${processUrl}`);
                const processResponse = await fetch(processUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({ sessionId: newSession.id }),
                });
                
                if (!processResponse.ok) {
                  const errorText = await processResponse.text();
                  console.error('[FLOW DEBUG] Error executing flow:', errorText);
                } else {
                  const responseText = await processResponse.text();
                  console.log(`[FLOW DEBUG] Flow executed successfully, response: ${responseText}`);
                }
              } catch (flowError) {
                console.error('[FLOW DEBUG] Error calling process-inbox-flow:', flowError);
              }
            } else if (sessionError) {
              console.error('[FLOW DEBUG] Error creating/upserting session:', sessionError);
              console.error('[FLOW DEBUG] Session error details:', JSON.stringify(sessionError));
              
              // If upsert failed due to unique constraint, try to find existing session
              if (sessionError.code === '23505') {
                console.log('Session already exists (unique constraint), fetching existing session');
                const { data: existingSession } = await supabaseClient
                  .from('inbox_flow_sessions')
                  .select('id')
                  .eq('flow_id', flow.id)
                  .eq('contact_id', contact.id)
                  .eq('status', 'active')
                  .single();
                
                if (existingSession) {
                  console.log(`Using existing session ${existingSession.id}`);
                }
              }
            }

            break; // Only trigger one flow
          }
        }
      

      console.log('Message processed successfully');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle message status updates (sent, delivered, read)
    if (event === 'messages.update' || event === 'MESSAGES_UPDATE') {
      console.log('Processing message status update');
      
      const updates = Array.isArray(data) ? data : [data];
      
      for (const update of updates) {
        const key = update.key || {};
        const remoteMessageId = key.id;
        const status = update.update?.status;
        
        if (!remoteMessageId || !status) {
          console.log('Missing remoteMessageId or status in update:', update);
          continue;
        }
        
        // Map Evolution API status to our status
        let newStatus = 'sent';
        if (status === 'DELIVERY_ACK' || status === 2 || status === 'delivered') {
          newStatus = 'delivered';
        } else if (status === 'READ' || status === 3 || status === 'read') {
          newStatus = 'read';
        } else if (status === 'PLAYED' || status === 4) {
          newStatus = 'read';
        } else if (status === 'SERVER_ACK' || status === 1 || status === 'sent') {
          newStatus = 'sent';
        }
        
        console.log(`Updating message ${remoteMessageId} status to ${newStatus}`);
        
        // Update message status in database
        const { error: updateError } = await supabaseClient
          .from('inbox_messages')
          .update({ status: newStatus })
          .eq('remote_message_id', remoteMessageId);
          
        if (updateError) {
          console.error('Error updating message status:', updateError);
        } else {
          console.log(`Message ${remoteMessageId} status updated to ${newStatus}`);
        }
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle connection status updates
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data.state || data.status;
      console.log(`Connection update for ${instance}: ${state}`);
      
      // Update instance status
      const newStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
      
      await supabaseClient
        .from('maturador_instances')
        .update({ status: newStatus })
        .eq('instance_name', instance);

      // AUTO-CONFIGURE WEBHOOK when instance connects
      if (state === 'open') {
        console.log(`[AUTO-WEBHOOK] Instance ${instance} connected, ensuring webhook is configured`);
        
        try {
          // Get instance and user info
          const { data: instanceData } = await supabaseClient
            .from('maturador_instances')
            .select('user_id')
            .eq('instance_name', instance)
            .single();

          if (instanceData) {
            // Get user's Evolution API config
            const { data: config } = await supabaseClient
              .from('maturador_config')
              .select('*')
              .eq('user_id', instanceData.user_id)
              .maybeSingle();

            if (config) {
              const EVOLUTION_BASE_URL = config.evolution_base_url.replace(/\/$/, '');
              const EVOLUTION_API_KEY = config.evolution_api_key;
              const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-inbox-messages`;

              // Configure webhook with multiple payload formats
              const payloads = [
                {
                  url: webhookUrl,
                  enabled: true,
                  webhookByEvents: false,
                  webhookBase64: false,
                  events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
                },
                {
                  webhook: {
                    url: webhookUrl,
                    enabled: true,
                    webhookByEvents: false,
                    events: ["messages.upsert", "messages.update", "connection.update", "send.message"]
                  }
                },
                {
                  url: webhookUrl,
                  enabled: true,
                  events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
                }
              ];

              for (const payload of payloads) {
                try {
                  const setRes = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instance}`, {
                    method: 'POST',
                    headers: {
                      apikey: EVOLUTION_API_KEY,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                  });

                  if (setRes.ok) {
                    console.log(`[AUTO-WEBHOOK] Webhook configured successfully for ${instance}`);
                    break;
                  }
                } catch (webhookError) {
                  console.log(`[AUTO-WEBHOOK] Payload attempt failed for ${instance}:`, webhookError);
                }
              }
            }
          }
        } catch (autoWebhookError) {
          console.error(`[AUTO-WEBHOOK] Error configuring webhook for ${instance}:`, autoWebhookError);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle send message acknowledgment
    if (event === 'send.message' || event === 'SEND_MESSAGE') {
      console.log('Processing send message acknowledgment');
      
      const key = data.key || {};
      const remoteMessageId = key.id;
      
      if (remoteMessageId) {
        // Update message status to sent
        await supabaseClient
          .from('inbox_messages')
          .update({ 
            status: 'sent',
            remote_message_id: remoteMessageId 
          })
          .eq('remote_message_id', remoteMessageId);
          
        console.log(`Send message acknowledged: ${remoteMessageId}`);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Unhandled event type: ${event}`);
    return new Response(JSON.stringify({ success: true, event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
