import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[INSTANCE-RENEWALS] Starting expired instance cleanup...');

    // Find all expired instances
    const { data: expiredSubs, error: fetchError } = await supabase
      .from('instance_subscriptions')
      .select('id, instance_id, user_id, expires_at')
      .lt('expires_at', new Date().toISOString())
      .eq('is_free', false);

    if (fetchError) {
      console.error('[INSTANCE-RENEWALS] Error fetching expired subscriptions:', fetchError);
      throw fetchError;
    }

    if (!expiredSubs || expiredSubs.length === 0) {
      console.log('[INSTANCE-RENEWALS] No expired instances found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No expired instances',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[INSTANCE-RENEWALS] Found ${expiredSubs.length} expired subscriptions`);

    const results = [];

    for (const sub of expiredSubs) {
      try {
        // Get instance details
        const { data: instance, error: instError } = await supabase
          .from('maturador_instances')
          .select('instance_name')
          .eq('id', sub.instance_id)
          .single();

        if (instError || !instance) {
          console.log(`[INSTANCE-RENEWALS] Instance ${sub.instance_id} not found, cleaning up subscription`);
          // Just delete the subscription if instance doesn't exist
          await supabase
            .from('instance_subscriptions')
            .delete()
            .eq('id', sub.id);
          results.push({ instanceId: sub.instance_id, status: 'subscription_cleaned' });
          continue;
        }

        console.log(`[INSTANCE-RENEWALS] Processing expired instance: ${instance.instance_name}`);

        // Cascade delete related data
        // 1. Delete inbox messages
        const { error: msgError } = await supabase
          .from('inbox_messages')
          .delete()
          .eq('instance_id', sub.instance_id);
        
        if (msgError) console.error(`[INSTANCE-RENEWALS] Error deleting messages:`, msgError);

        // 2. Delete inbox flow sessions
        const { error: sessError } = await supabase
          .from('inbox_flow_sessions')
          .delete()
          .eq('instance_id', sub.instance_id);
        
        if (sessError) console.error(`[INSTANCE-RENEWALS] Error deleting sessions:`, sessError);

        // 3. Delete inbox contacts
        const { error: contactError } = await supabase
          .from('inbox_contacts')
          .delete()
          .eq('instance_id', sub.instance_id);
        
        if (contactError) console.error(`[INSTANCE-RENEWALS] Error deleting contacts:`, contactError);

        // 4. Delete maturador conversations
        const { error: convError } = await supabase
          .from('maturador_conversations')
          .delete()
          .eq('instance_id', sub.instance_id);
        
        if (convError) console.error(`[INSTANCE-RENEWALS] Error deleting conversations:`, convError);

        // 5. Delete subscription record
        const { error: subDelError } = await supabase
          .from('instance_subscriptions')
          .delete()
          .eq('id', sub.id);
        
        if (subDelError) console.error(`[INSTANCE-RENEWALS] Error deleting subscription:`, subDelError);

        // 6. Delete the instance from UazAPI (fetch credentials from database)
        try {
          const { data: apiConfig } = await supabase
            .from('whatsapp_api_config')
            .select('uazapi_base_url, uazapi_api_token')
            .single();
          
          const uazapiUrl = apiConfig?.uazapi_base_url?.replace(/\/$/, '');
          const uazapiToken = apiConfig?.uazapi_api_token;
          
          if (uazapiUrl && uazapiToken) {
            console.log(`[INSTANCE-RENEWALS] Deleting instance from UazAPI: ${instance.instance_name}`);
            const deleteResp = await fetch(`${uazapiUrl}/instance/delete/${instance.instance_name}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${uazapiToken}`,
              },
            });
            console.log(`[INSTANCE-RENEWALS] UazAPI delete response: ${deleteResp.status}`);
          } else {
            console.warn(`[INSTANCE-RENEWALS] UazAPI credentials not found in whatsapp_api_config`);
          }
        } catch (uazError) {
          console.error(`[INSTANCE-RENEWALS] Error deleting from UazAPI:`, uazError);
        }

        // 7. Delete the instance record
        const { error: instDelError } = await supabase
          .from('maturador_instances')
          .delete()
          .eq('id', sub.instance_id);
        
        if (instDelError) console.error(`[INSTANCE-RENEWALS] Error deleting instance:`, instDelError);

        results.push({ 
          instanceId: sub.instance_id, 
          instanceName: instance.instance_name,
          status: 'deleted' 
        });

        console.log(`[INSTANCE-RENEWALS] Successfully deleted expired instance: ${instance.instance_name}`);

      } catch (err) {
        console.error(`[INSTANCE-RENEWALS] Error processing instance ${sub.instance_id}:`, err);
        results.push({ instanceId: sub.instance_id, status: 'error', error: String(err) });
      }
    }

    console.log(`[INSTANCE-RENEWALS] Completed. Processed: ${results.length}`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[INSTANCE-RENEWALS] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
