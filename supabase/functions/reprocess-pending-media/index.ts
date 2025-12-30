import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INBOX_MEDIA_BUCKET = 'video-clips';

const guessExtension = (contentType: string | null, fallback: string): string => {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('image/')) {
    const ext = ct.split('image/')[1]?.split(';')[0] || 'jpg';
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  if (ct.includes('audio/')) {
    return ct.split('audio/')[1]?.split(';')[0] || fallback;
  }
  if (ct.includes('video/')) {
    return ct.split('video/')[1]?.split(';')[0] || fallback;
  }
  if (ct.includes('application/pdf')) return 'pdf';
  return fallback;
};

const fallbackExtFromType = (messageType: string): string => {
  switch (messageType) {
    case 'image': return 'jpg';
    case 'audio': return 'ogg';
    case 'video': return 'mp4';
    case 'sticker': return 'webp';
    case 'document': return 'bin';
    default: return 'bin';
  }
};

// Download media via Evolution API getBase64FromMediaMessage with retry
const downloadMediaViaEvolutionAPI = async (
  instanceName: string,
  remoteJid: string,
  messageId: string,
  convertToMp4: boolean = false
): Promise<{ base64: string; mimetype: string } | null> => {
  let baseUrl = Deno.env.get('EVOLUTION_BASE_URL') || '';
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  
  // Ensure baseUrl has protocol
  baseUrl = baseUrl.replace(/\/$/, '');
  if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  
  if (!baseUrl || !apiKey) {
    console.log('[EVOLUTION] No Evolution API config available');
    return null;
  }

  const maxRetries = 3;
  const delays = [1000, 2000, 4000]; // exponential backoff
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[EVOLUTION] Attempt ${attempt + 1}/${maxRetries}: instance=${instanceName}, messageId=${messageId}`);
      
      const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            key: {
              remoteJid: remoteJid,
              id: messageId,
            }
          },
          convertToMp4: convertToMp4,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[EVOLUTION] API error: status=${response.status}, body=${errorText.substring(0, 200)}`);
        
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, delays[attempt]));
          continue;
        }
        return null;
      }
      
      const result = await response.json();
      
      if (result.base64 && result.mimetype) {
        console.log(`[EVOLUTION] Success! mimetype=${result.mimetype}, size=${result.base64.length} chars`);
        return { base64: result.base64, mimetype: result.mimetype };
      }
      
      console.log(`[EVOLUTION] No base64 in response`);
      return null;
    } catch (err) {
      console.error(`[EVOLUTION] Attempt ${attempt + 1} error:`, err);
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  
  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const { userId, instanceId, limit = 50 } = body;

    console.log('[REPROCESS] Starting media reprocessing...');
    console.log(`[REPROCESS] Params: userId=${userId || 'all'}, instanceId=${instanceId || 'all'}, limit=${limit}`);

    // Build query to find messages with temporary URLs or pending media
    let query = supabaseClient
      .from('inbox_messages')
      .select(`
        id,
        user_id,
        contact_id,
        instance_id,
        remote_message_id,
        media_url,
        message_type,
        content
      `)
      .or('media_pending.eq.true,media_url.like.%mmg.whatsapp.net%,media_url.like.%cdn.whatsapp.net%')
      .not('media_url', 'like', '%supabase%')
      .not('message_type', 'eq', 'text')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (instanceId) {
      query = query.eq('instance_id', instanceId);
    }

    const { data: messages, error: queryError } = await query;

    if (queryError) {
      console.error('[REPROCESS] Query error:', queryError);
      return new Response(JSON.stringify({ success: false, error: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!messages || messages.length === 0) {
      console.log('[REPROCESS] No pending media found');
      return new Response(JSON.stringify({ success: true, processed: 0, message: 'No pending media found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[REPROCESS] Found ${messages.length} messages to process`);

    // Get contact info for each message
    const contactIds = [...new Set(messages.map(m => m.contact_id).filter(Boolean))];
    const { data: contacts } = await supabaseClient
      .from('inbox_contacts')
      .select('id, remote_jid, instance_id')
      .in('id', contactIds);
    
    const contactMap = new Map(contacts?.map(c => [c.id, c]) || []);

    // Get instance info for each unique instance_id
    const instanceIds = [...new Set(messages.map(m => m.instance_id).filter(Boolean))];
    const { data: instances } = await supabaseClient
      .from('maturador_instances')
      .select('id, instance_name, user_id')
      .in('id', instanceIds);

    const instanceMap = new Map(instances?.map(i => [i.id, i]) || []);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const results: { id: string; status: string; error?: string }[] = [];

    for (const message of messages) {
      processed++;
      const logPrefix = `[REPROCESS ${processed}/${messages.length}]`;
      
      try {
        const instance = instanceMap.get(message.instance_id);
        const contact = contactMap.get(message.contact_id);
        
        if (!instance || !contact) {
          console.log(`${logPrefix} Missing instance or contact data`);
          results.push({ id: message.id, status: 'skipped', error: 'Missing instance or contact' });
          failed++;
          continue;
        }

        const remoteJid = contact.remote_jid;
        const messageId = message.remote_message_id;
        const instanceName = instance.instance_name;

        if (!remoteJid || !messageId || !instanceName) {
          console.log(`${logPrefix} Missing required identifiers`);
          results.push({ id: message.id, status: 'skipped', error: 'Missing identifiers' });
          failed++;
          continue;
        }

        console.log(`${logPrefix} Processing: type=${message.message_type}, instance=${instanceName}`);

        // Try to download via Evolution API
        const convertToMp4 = message.message_type === 'video';
        const evolutionResult = await downloadMediaViaEvolutionAPI(
          instanceName,
          remoteJid,
          messageId,
          convertToMp4
        );

        if (!evolutionResult) {
          console.log(`${logPrefix} Failed to download from Evolution API`);
          results.push({ id: message.id, status: 'failed', error: 'Evolution API download failed' });
          failed++;
          continue;
        }

        // Decode base64 to ArrayBuffer
        const binaryString = atob(evolutionResult.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;
        const contentType = evolutionResult.mimetype;

        // Upload to storage
        const blob = new Blob([arrayBuffer], { type: contentType });
        const ext = guessExtension(contentType, fallbackExtFromType(message.message_type));
        const objectPath = `inbox-media/${message.user_id}/${message.instance_id}/${message.message_type}/${messageId}.${ext}`;

        console.log(`${logPrefix} Uploading to: ${objectPath}`);

        const { error: uploadError } = await supabaseClient
          .storage
          .from(INBOX_MEDIA_BUCKET)
          .upload(objectPath, blob, {
            contentType: contentType,
            upsert: true,
            cacheControl: '31536000',
          });

        if (uploadError) {
          console.error(`${logPrefix} Upload failed:`, uploadError);
          results.push({ id: message.id, status: 'failed', error: 'Upload failed' });
          failed++;
          continue;
        }

        // Get public URL
        const { data: urlData } = await supabaseClient.storage.from(INBOX_MEDIA_BUCKET).getPublicUrl(objectPath);
        const publicUrl = urlData?.publicUrl;

        if (!publicUrl) {
          console.error(`${logPrefix} Failed to get public URL`);
          results.push({ id: message.id, status: 'failed', error: 'No public URL' });
          failed++;
          continue;
        }

        // Update message with new URL and clear pending flag
        const { error: updateError } = await supabaseClient
          .from('inbox_messages')
          .update({
            media_url: publicUrl,
            media_pending: false,
          })
          .eq('id', message.id);

        if (updateError) {
          console.error(`${logPrefix} Failed to update message:`, updateError);
          results.push({ id: message.id, status: 'failed', error: 'Update failed' });
          failed++;
          continue;
        }

        console.log(`${logPrefix} SUCCESS: ${publicUrl}`);
        results.push({ id: message.id, status: 'success' });
        succeeded++;

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`${logPrefix} Error:`, errorMsg);
        results.push({ id: message.id, status: 'error', error: errorMsg });
        failed++;
      }
    }

    console.log(`[REPROCESS] Complete: processed=${processed}, succeeded=${succeeded}, failed=${failed}`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      succeeded,
      failed,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[REPROCESS] Fatal error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
