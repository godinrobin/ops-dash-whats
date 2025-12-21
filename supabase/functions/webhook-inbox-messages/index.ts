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

    const payload = await req.json();
    console.log('Webhook payload received:', JSON.stringify(payload, null, 2));

    // Evolution API sends different event types
    const event = payload.event || payload.type;
    const instance = payload.instance || payload.instanceName;
    const data = payload.data || payload;

    // Handle messages.upsert event (new incoming message)
    if (event === 'messages.upsert' || event === 'message' || event === 'MESSAGES_UPSERT') {
      const message = data.message || data;
      const key = message.key || {};
      
      // Only process incoming messages (not sent by us)
      if (key.fromMe) {
        console.log('Skipping outgoing message');
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const remoteJid = key.remoteJid || '';
      const rawPhone = remoteJid.split('@')[0];
      // Clean and validate phone number
      const phone = rawPhone.replace(/\D/g, '');
      const messageId = key.id;
      
      // Validate phone is 10-15 digits
      if (!/^\d{10,15}$/.test(phone)) {
        console.log(`Skipping message with invalid phone: ${rawPhone}`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Invalid phone' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Extract message content
      let content = '';
      let messageType = 'text';
      let mediaUrl = null;

      if (message.message?.conversation) {
        content = message.message.conversation;
      } else if (message.message?.extendedTextMessage?.text) {
        content = message.message.extendedTextMessage.text;
      } else if (message.message?.imageMessage) {
        messageType = 'image';
        content = message.message.imageMessage.caption || '';
        mediaUrl = message.message.imageMessage.url || null;
      } else if (message.message?.audioMessage) {
        messageType = 'audio';
        mediaUrl = message.message.audioMessage.url || null;
      } else if (message.message?.videoMessage) {
        messageType = 'video';
        content = message.message.videoMessage.caption || '';
        mediaUrl = message.message.videoMessage.url || null;
      } else if (message.message?.documentMessage) {
        messageType = 'document';
        content = message.message.documentMessage.fileName || '';
        mediaUrl = message.message.documentMessage.url || null;
      } else if (message.message?.stickerMessage) {
        messageType = 'sticker';
        mediaUrl = message.message.stickerMessage.url || null;
      }

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

      // Find or create contact
      let { data: contact, error: contactError } = await supabaseClient
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', userId)
        .eq('phone', phone)
        .single();

      if (contactError || !contact) {
        // Create new contact - only use pushName from inbound messages
        // message.pushName is correct since this is an inbound message (!key.fromMe)
        const pushName = message.pushName || null;
        
        const { data: newContact, error: insertError } = await supabaseClient
          .from('inbox_contacts')
          .insert({
            user_id: userId,
            instance_id: instanceId,
            phone,
            name: pushName,
            status: 'active',
            unread_count: 1,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating contact:', insertError);
          return new Response(JSON.stringify({ success: false, error: 'Failed to create contact' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        contact = newContact;
      } else {
        // Update existing contact: increment unread and update pushName if available
        // Only use pushName from the message (inbound), not from data root
        const pushName = message.pushName || null;
        const updates: Record<string, any> = {
          unread_count: (contact.unread_count || 0) + 1,
          last_message_at: new Date().toISOString(),
        };
        
        // Only update name if we have a valid pushName and contact doesn't have a name yet
        // or if the new pushName is different and valid
        if (pushName && pushName.trim() && (!contact.name || contact.name !== pushName)) {
          updates.name = pushName;
        }
        
        await supabaseClient
          .from('inbox_contacts')
          .update(updates)
          .eq('id', contact.id);
      }

      // Save the message
      const { error: messageError } = await supabaseClient
        .from('inbox_messages')
        .insert({
          contact_id: contact.id,
          instance_id: instanceId,
          user_id: userId,
          direction: 'inbound',
          message_type: messageType,
          content,
          media_url: mediaUrl,
          remote_message_id: messageId,
          status: 'delivered',
          is_from_flow: false,
        });

      if (messageError) {
        console.error('Error saving message:', messageError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to save message' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for active flows to trigger
      const { data: flows } = await supabaseClient
        .from('inbox_flows')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (flows && flows.length > 0 && content) {
        for (const flow of flows) {
          let shouldTrigger = false;

          if (flow.trigger_type === 'all') {
            shouldTrigger = true;
          } else if (flow.trigger_type === 'keyword' && flow.trigger_keywords) {
            const keywords = flow.trigger_keywords as string[];
            const lowerContent = content.toLowerCase();
            shouldTrigger = keywords.some(kw => lowerContent.includes(kw.toLowerCase()));
          }

          if (shouldTrigger) {
            console.log(`Triggering flow ${flow.name} for contact ${contact.id}`);
            
            // Check if there's already an active session for this flow and contact
            const { data: existingSession } = await supabaseClient
              .from('inbox_flow_sessions')
              .select('*')
              .eq('flow_id', flow.id)
              .eq('contact_id', contact.id)
              .eq('status', 'active')
              .single();

            if (!existingSession) {
              // Create new flow session
              await supabaseClient
                .from('inbox_flow_sessions')
                .insert({
                  flow_id: flow.id,
                  contact_id: contact.id,
                  instance_id: instanceId,
                  user_id: userId,
                  current_node_id: 'start-1',
                  variables: { lastMessage: content, contactName: contact.name || phone },
                  status: 'active',
                });
            }

            break; // Only trigger one flow
          }
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
