import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fixed Evolution API credentials
const EVOLUTION_BASE_URL = 'https://api.chatwp.xyz';
const EVOLUTION_API_KEY = '157e8ba13b2a576199d483ea5f0eb7c3';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, ...params } = await req.json();
    console.log(`Maturador action: ${action}`, params);

    // Helper function to call Evolution API
    const callEvolution = async (endpoint: string, method: string = 'GET', body?: any) => {
      const url = `${EVOLUTION_BASE_URL}${endpoint}`;
      console.log(`Calling Evolution API: ${method} ${url}`);
      
      const options: RequestInit = {
        method,
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const responseText = await response.text();
      
      console.log(`Evolution API response status: ${response.status}`);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      if (!response.ok) {
        console.error('Evolution API error:', data);
        throw new Error(data.message || data.error || `Evolution API error: ${response.status}`);
      }

      return data;
    };

    let result;

    switch (action) {
      case 'test-connection': {
        try {
          const response = await fetch(`${EVOLUTION_BASE_URL}/instance/fetchInstances`, {
            method: 'GET',
            headers: {
              'apikey': EVOLUTION_API_KEY,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Evolution API error:', errorText);
            return new Response(JSON.stringify({ 
              success: false, 
              error: `Erro na Evolution API: ${response.status}` 
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const data = await response.json();
          return new Response(JSON.stringify({ 
            success: true, 
            instances: Array.isArray(data) ? data.length : 0 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Connection test error:', error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Não foi possível conectar à Evolution API' 
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'create-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create instance in Evolution API
        result = await callEvolution('/instance/create', 'POST', {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        });

        // Save instance to database
        const { error: insertError } = await supabaseClient
          .from('maturador_instances')
          .insert({
            user_id: user.id,
            instance_name: instanceName,
            status: 'disconnected',
            qrcode: result.qrcode?.base64 || null,
          });

        if (insertError) {
          console.error('Insert instance error:', insertError);
        }

        break;
      }

      case 'connect-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/connect/${instanceName}`, 'GET');

        // Update QR code in database
        if (result.base64) {
          await supabaseClient
            .from('maturador_instances')
            .update({ qrcode: result.base64, status: 'connecting' })
            .eq('instance_name', instanceName)
            .eq('user_id', user.id);
        }

        break;
      }

      case 'get-qrcode': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/connect/${instanceName}`, 'GET');
        
        // Update QR code in database
        if (result.base64) {
          await supabaseClient
            .from('maturador_instances')
            .update({ qrcode: result.base64 })
            .eq('instance_name', instanceName)
            .eq('user_id', user.id);
        }

        break;
      }

      case 'check-status': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/connectionState/${instanceName}`, 'GET');

        // Update status in database
        const newStatus = result.instance?.state === 'open' ? 'connected' : 'disconnected';
        await supabaseClient
          .from('maturador_instances')
          .update({ 
            status: newStatus,
            last_seen: newStatus === 'connected' ? new Date().toISOString() : null,
          })
          .eq('instance_name', instanceName)
          .eq('user_id', user.id);

        break;
      }

      case 'fetch-instances': {
        result = await callEvolution('/instance/fetchInstances', 'GET');
        break;
      }

      case 'logout-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/logout/${instanceName}`, 'DELETE');

        // Update status in database
        await supabaseClient
          .from('maturador_instances')
          .update({ status: 'disconnected', qrcode: null })
          .eq('instance_name', instanceName)
          .eq('user_id', user.id);

        break;
      }

      case 'delete-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/delete/${instanceName}`, 'DELETE');

        // Delete from database
        await supabaseClient
          .from('maturador_instances')
          .delete()
          .eq('instance_name', instanceName)
          .eq('user_id', user.id);

        break;
      }

      case 'send-message': {
        const { instanceName, number, text, conversationId, fromInstanceId, toInstanceId } = params;
        if (!instanceName || !number || !text) {
          return new Response(JSON.stringify({ error: 'Número, destinatário e texto são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/message/sendText/${instanceName}`, 'POST', {
          number,
          text,
        });

        // Save message to database
        if (conversationId && fromInstanceId && toInstanceId) {
          await supabaseClient
            .from('maturador_messages')
            .insert({
              user_id: user.id,
              conversation_id: conversationId,
              from_instance_id: fromInstanceId,
              to_instance_id: toInstanceId,
              body: text,
              status: 'sent',
            });
        }

        break;
      }

      case 'restart-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome do número é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/restart/${instanceName}`, 'PUT');
        break;
      }

      case 'run-conversation': {
        const { conversationId } = params;
        if (!conversationId) {
          return new Response(JSON.stringify({ error: 'ID da conversa é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch conversation
        const { data: conversation, error: convError } = await supabaseClient
          .from('maturador_conversations')
          .select('*')
          .eq('id', conversationId)
          .eq('user_id', user.id)
          .single();

        if (convError || !conversation) {
          return new Response(JSON.stringify({ error: 'Conversa não encontrada' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!conversation.is_active) {
          return new Response(JSON.stringify({ error: 'Conversa está pausada' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch both instances
        const { data: instanceA } = await supabaseClient
          .from('maturador_instances')
          .select('*')
          .eq('id', conversation.chip_a_id)
          .single();

        const { data: instanceB } = await supabaseClient
          .from('maturador_instances')
          .select('*')
          .eq('id', conversation.chip_b_id)
          .single();

        if (!instanceA || !instanceB) {
          return new Response(JSON.stringify({ error: 'Números não encontrados' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (instanceA.status !== 'connected' || instanceB.status !== 'connected') {
          return new Response(JSON.stringify({ error: 'Ambos os números precisam estar conectados' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check daily limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { count: todayCount } = await supabaseClient
          .from('maturador_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .gte('created_at', today.toISOString());

        if ((todayCount || 0) >= conversation.daily_limit) {
          return new Response(JSON.stringify({ error: 'Limite diário atingido', dailyLimitReached: true }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get topics for messages
        const topics = Array.isArray(conversation.topics) ? conversation.topics : [];
        const topicMessages = [
          "Oi, tudo bem?",
          "E aí, beleza?",
          "Opa, como você está?",
          "Fala aí!",
          "Bom dia! Como vai?",
          "Boa tarde! Tudo certo?",
          "E aí, firmeza?",
          "Opa! Sumido(a) hein",
          "Oi! Quanto tempo!",
          "Tudo bem por aí?",
        ];

        // Add topic-based messages
        topics.forEach((topic: string) => {
          topicMessages.push(`O que você acha sobre ${topic.toLowerCase()}?`);
          topicMessages.push(`Viu as novidades sobre ${topic.toLowerCase()}?`);
          topicMessages.push(`Você gosta de ${topic.toLowerCase()}?`);
        });

        // Send messages
        const messagesSent = [];
        const messagesPerRound = Math.min(conversation.messages_per_round, conversation.daily_limit - (todayCount || 0));

        for (let i = 0; i < messagesPerRound; i++) {
          const isAToB = i % 2 === 0;
          const fromInstance = isAToB ? instanceA : instanceB;
          const toInstance = isAToB ? instanceB : instanceA;
          const message = topicMessages[Math.floor(Math.random() * topicMessages.length)];

          try {
            // Format phone number
            const toNumber = toInstance.phone_number?.replace(/\D/g, '') || '';
            if (!toNumber) {
              console.log(`Skipping message: ${toInstance.instance_name} has no phone number`);
              continue;
            }

            const sendResult = await callEvolution(`/message/sendText/${fromInstance.instance_name}`, 'POST', {
              number: toNumber,
              text: message,
            });

            // Save to database
            await supabaseClient
              .from('maturador_messages')
              .insert({
                user_id: user.id,
                conversation_id: conversationId,
                from_instance_id: fromInstance.id,
                to_instance_id: toInstance.id,
                body: message,
                status: 'sent',
              });

            messagesSent.push({ from: fromInstance.instance_name, to: toInstance.instance_name, message });

            // Random delay between messages
            const delay = Math.floor(Math.random() * (conversation.max_delay_seconds - conversation.min_delay_seconds + 1)) + conversation.min_delay_seconds;
            await new Promise(resolve => setTimeout(resolve, delay * 1000));

          } catch (error) {
            console.error(`Error sending message:`, error);
          }
        }

        result = { success: true, messagesSent: messagesSent.length, messages: messagesSent };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in maturador-evolution:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
