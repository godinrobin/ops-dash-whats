import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body for optional user_id filter
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      targetUserId = body.userId || null;
    } catch {
      // No body or invalid JSON, process all users
    }

    console.log('=== FIX ORPHAN CONTACTS STARTED ===');
    console.log(`Target user: ${targetUserId || 'ALL USERS'}`);

    // Find all contacts with null instance_id
    let orphanQuery = supabaseClient
      .from('inbox_contacts')
      .select('id, user_id, phone, name, remote_jid')
      .is('instance_id', null);

    if (targetUserId) {
      orphanQuery = orphanQuery.eq('user_id', targetUserId);
    }

    const { data: orphanContacts, error: orphanError } = await orphanQuery;

    if (orphanError) {
      console.error('Error fetching orphan contacts:', orphanError);
      return new Response(JSON.stringify({ success: false, error: orphanError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${orphanContacts?.length || 0} orphan contacts`);

    const results = {
      total: orphanContacts?.length || 0,
      fixed: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[],
    };

    for (const contact of orphanContacts || []) {
      try {
        console.log(`\nProcessing orphan contact: ${contact.id} (phone: ${contact.phone})`);

        // Strategy 1: Find instance_id from existing messages for this contact
        const { data: messageWithInstance } = await supabaseClient
          .from('inbox_messages')
          .select('instance_id')
          .eq('contact_id', contact.id)
          .not('instance_id', 'is', null)
          .limit(1)
          .maybeSingle();

        if (messageWithInstance?.instance_id) {
          // Update contact with instance from message
          const { error: updateError } = await supabaseClient
            .from('inbox_contacts')
            .update({ instance_id: messageWithInstance.instance_id })
            .eq('id', contact.id);

          if (updateError) {
            console.error(`Error updating contact ${contact.id}:`, updateError);
            results.errors++;
            results.details.push({ contactId: contact.id, status: 'error', reason: updateError.message });
          } else {
            console.log(`Fixed contact ${contact.id} using message instance_id: ${messageWithInstance.instance_id}`);
            results.fixed++;
            results.details.push({ contactId: contact.id, status: 'fixed', source: 'message', instanceId: messageWithInstance.instance_id });

            // Also fix any flow sessions for this contact
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({ instance_id: messageWithInstance.instance_id })
              .eq('contact_id', contact.id)
              .is('instance_id', null);
          }
          continue;
        }

        // Strategy 2: If user has only one active instance, use that
        const { data: userInstances } = await supabaseClient
          .from('maturador_instances')
          .select('id, instance_name, status')
          .eq('user_id', contact.user_id)
          .eq('status', 'open');

        if (userInstances && userInstances.length === 1) {
          const singleInstance = userInstances[0];
          const { error: updateError } = await supabaseClient
            .from('inbox_contacts')
            .update({ instance_id: singleInstance.id })
            .eq('id', contact.id);

          if (updateError) {
            console.error(`Error updating contact ${contact.id}:`, updateError);
            results.errors++;
            results.details.push({ contactId: contact.id, status: 'error', reason: updateError.message });
          } else {
            console.log(`Fixed contact ${contact.id} using single active instance: ${singleInstance.id}`);
            results.fixed++;
            results.details.push({ contactId: contact.id, status: 'fixed', source: 'single_instance', instanceId: singleInstance.id });

            // Also fix any flow sessions for this contact
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({ instance_id: singleInstance.id })
              .eq('contact_id', contact.id)
              .is('instance_id', null);
          }
          continue;
        }

        // Strategy 3: Try to find instance from remote_jid match
        if (contact.remote_jid) {
          // Extract phone from remote_jid
          const phoneFromJid = contact.remote_jid.split('@')[0].replace(/\D/g, '');
          
          // Find instance with this phone number
          const { data: matchingInstance } = await supabaseClient
            .from('maturador_instances')
            .select('id')
            .eq('user_id', contact.user_id)
            .neq('phone_number', phoneFromJid) // Instance phone should NOT be the contact's phone
            .eq('status', 'open')
            .limit(1)
            .maybeSingle();

          if (matchingInstance) {
            const { error: updateError } = await supabaseClient
              .from('inbox_contacts')
              .update({ instance_id: matchingInstance.id })
              .eq('id', contact.id);

            if (updateError) {
              console.error(`Error updating contact ${contact.id}:`, updateError);
              results.errors++;
              results.details.push({ contactId: contact.id, status: 'error', reason: updateError.message });
            } else {
              console.log(`Fixed contact ${contact.id} using instance from user: ${matchingInstance.id}`);
              results.fixed++;
              results.details.push({ contactId: contact.id, status: 'fixed', source: 'user_instance', instanceId: matchingInstance.id });

              // Also fix any flow sessions for this contact
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({ instance_id: matchingInstance.id })
                .eq('contact_id', contact.id)
                .is('instance_id', null);
            }
            continue;
          }
        }

        // Could not determine instance - skip but mark any associated sessions as completed
        console.log(`Could not determine instance for contact ${contact.id} - marking sessions as completed`);
        
        await supabaseClient
          .from('inbox_flow_sessions')
          .update({ status: 'completed' })
          .eq('contact_id', contact.id)
          .is('instance_id', null);

        results.skipped++;
        results.details.push({ 
          contactId: contact.id, 
          status: 'skipped', 
          reason: 'no_instance_found',
          userInstances: userInstances?.length || 0 
        });

      } catch (contactError) {
        console.error(`Unexpected error processing contact ${contact.id}:`, contactError);
        results.errors++;
        results.details.push({ contactId: contact.id, status: 'error', reason: String(contactError) });
      }
    }

    // Also find and fix orphan flow sessions directly
    console.log('\n=== CHECKING ORPHAN FLOW SESSIONS ===');
    
    let orphanSessionsQuery = supabaseClient
      .from('inbox_flow_sessions')
      .select('id, contact_id, user_id, status')
      .is('instance_id', null)
      .eq('status', 'active');

    if (targetUserId) {
      orphanSessionsQuery = orphanSessionsQuery.eq('user_id', targetUserId);
    }

    const { data: orphanSessions } = await orphanSessionsQuery;

    console.log(`Found ${orphanSessions?.length || 0} orphan active sessions`);

    let sessionsFixed = 0;
    for (const session of orphanSessions || []) {
      // Try to get instance from contact
      const { data: contact } = await supabaseClient
        .from('inbox_contacts')
        .select('instance_id')
        .eq('id', session.contact_id)
        .maybeSingle();

      if (contact?.instance_id) {
        await supabaseClient
          .from('inbox_flow_sessions')
          .update({ instance_id: contact.instance_id })
          .eq('id', session.id);
        sessionsFixed++;
      } else {
        // Mark as completed since we can't fix it
        await supabaseClient
          .from('inbox_flow_sessions')
          .update({ status: 'completed' })
          .eq('id', session.id);
      }
    }

    console.log(`Fixed ${sessionsFixed} orphan sessions, marked ${(orphanSessions?.length || 0) - sessionsFixed} as completed`);

    console.log('\n=== FIX ORPHAN CONTACTS COMPLETED ===');
    console.log(`Total: ${results.total}, Fixed: ${results.fixed}, Skipped: ${results.skipped}, Errors: ${results.errors}`);

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      sessionsFixed,
      sessionsMarkedCompleted: (orphanSessions?.length || 0) - sessionsFixed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
