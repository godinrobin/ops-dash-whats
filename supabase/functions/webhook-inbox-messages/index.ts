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
      
      // Evolution API v2+ uses remoteJidAlt with @s.whatsapp.net format for actual phone
      // remoteJid may contain @lid format (internal ID) which is not a valid phone
      let jidForPhone = remoteJid;
      if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
        jidForPhone = remoteJidAlt;
        console.log(`Using remoteJidAlt for phone extraction: ${remoteJidAlt}`);
      } else if (remoteJidAlt && !remoteJid.includes('@s.whatsapp.net')) {
        // If remoteJid doesn't have @s.whatsapp.net, try remoteJidAlt
        jidForPhone = remoteJidAlt || remoteJid;
        console.log(`remoteJid format unusual (${remoteJid}), trying remoteJidAlt: ${remoteJidAlt}`);
      }
      
      const rawPhone = jidForPhone.split('@')[0];
      // Clean and validate phone number
      const phone = rawPhone.replace(/\D/g, '');
      
      console.log(`Phone extraction: remoteJid=${remoteJid}, remoteJidAlt=${remoteJidAlt}, extracted=${phone}`);
      
      // Validate phone is 10-15 digits
      if (!/^\d{10,15}$/.test(phone)) {
        console.log(`Skipping message with invalid phone: ${rawPhone}`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Invalid phone' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
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

      // Find the instance in our database
      const { data: instanceData, error: instanceError } = await supabaseClient
        .from('maturador_instances')
        .select('id, user_id')
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

      // Find or create contact - search by user_id + instance_id + phone
      // This allows SEPARATE chats per instance for the same phone number
      let { data: contact, error: contactError } = await supabaseClient
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', userId)
        .eq('instance_id', instanceId)
        .eq('phone', phone)
        .maybeSingle();

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
            name: pushName,
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
        // Update existing contact
        const updates: Record<string, any> = {
          last_message_at: new Date().toISOString(),
          // DO NOT update instance_id - it's now part of the unique key
        };
        
        // Only increment unread for inbound messages (not fromMe)
        if (!isFromMe) {
          updates.unread_count = (contact.unread_count || 0) + 1;
        }
        
        // Only update name if we have a valid pushName and contact doesn't have a name yet
        // or if the new pushName is different and valid
        if (pushName && pushName.trim() && (!contact.name || contact.name !== pushName)) {
          updates.name = pushName;
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
            console.log(`Updating contact ${contact.id} with remote_jid: ${remoteJidToStore}`);
          }
        }
        
        await supabaseClient
          .from('inbox_contacts')
          .update(updates)
          .eq('id', contact.id);
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
      
      // Save the message
      const { error: messageError } = await supabaseClient
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
        });

      if (messageError) {
        console.error('Error saving message:', messageError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to save message' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
        console.log('[FLOW DEBUG] Message has no text content, skipping flow trigger');
        return new Response(JSON.stringify({ success: true, noContent: true }), {
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
