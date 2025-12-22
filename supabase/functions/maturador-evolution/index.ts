import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Evolution API credentials from environment
const EVOLUTION_BASE_URL = 'https://api.chatwp.xyz';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

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
      if (body) console.log('Evolution API request body:', JSON.stringify(body));

      const options: RequestInit = {
        method,
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const responseText = await response.text();

      console.log(`Evolution API response status: ${response.status}`);

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      if (!response.ok) {
        console.error('Evolution API error:', {
          status: response.status,
          error: response.statusText,
          endpoint,
          response: data,
        });

        const err = new Error(
          (data?.message && Array.isArray(data.message) ? data.message.join(' | ') : data?.message) ||
            data?.error ||
            `Evolution API error: ${response.status}`
        ) as Error & { status?: number; details?: any; endpoint?: string };
        err.status = response.status;
        err.details = data;
        err.endpoint = endpoint;
        throw err;
      }

      return data;
    };

    // Helper to extract phone number from Evolution instance data
    const extractPhoneFromInstance = (instanceData: any): string | null => {
      // Log the full structure for debugging
      console.log('Instance data structure:', JSON.stringify(instanceData, null, 2));
      
      // Try multiple paths where phone might be stored
      const possiblePaths = [
        // Most common fields
        instanceData?.ownerJid,
        instanceData?.instance?.ownerJid,
        instanceData?.number,
        instanceData?.instance?.number,

        // Older/alternate shapes
        instanceData?.instance?.owner,
        instanceData?.owner,
        instanceData?.instance?.wuid,
        instanceData?.wuid,
        instanceData?.profileNumber,
        instanceData?.instance?.profileNumber,
      ];
      
      for (const value of possiblePaths) {
        if (typeof value === 'string' && value) {
          const cleaned = value.split('@')[0].replace(/\D/g, '');
          if (cleaned.length >= 8) {
            console.log(`Found phone number: ${cleaned} from value: ${value}`);
            return cleaned;
          }
        }
      }
      
      console.log('No phone number found in instance data');
      return null;
    };

    // Helper to generate audio copy with OpenAI
    const generateAudioCopy = async (topicsText: string): Promise<string> => {
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        return 'Opa, tudo bem?';
      }

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Gere uma mensagem curta (máximo 100 caracteres) para ser convertida em áudio de WhatsApp.
Tema: ${topicsText}
Regras:
- Linguagem informal brasileira
- Como se fosse um áudio rápido entre amigos
- Pode usar gírias e expressões
- NÃO use emojis (é áudio)
- Responda APENAS com o texto, sem aspas ou explicações`
              }
            ],
            max_tokens: 100,
            temperature: 0.9,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices?.[0]?.message?.content?.trim() || 'E aí, beleza?';
        }
      } catch (e) {
        console.error('Error generating audio copy:', e);
      }

      return 'E aí, tudo bem?';
    };

    // Helper to generate audio with ElevenLabs
    const generateAudioWithElevenLabs = async (text: string): Promise<string> => {
      const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }

      // Using Sarah voice - female Brazilian Portuguese compatible
      const voiceId = 'EXAVITQu4vr4xnSDxMaL';

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          output_format: 'mp3_44100_128',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs error:', errorText);
        throw new Error('Failed to generate audio');
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = base64Encode(audioBuffer);
      console.log('ElevenLabs audio bytes:', audioBuffer.byteLength, 'base64 length:', audioBase64.length);
      return audioBase64;
    };

    // Helper to generate image with OpenAI DALL-E
    const generateImageWithDallE = async (topicsText: string): Promise<string> => {
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `Uma imagem casual e realista relacionada ao tema: ${topicsText}. Estilo informal, como uma foto compartilhada no WhatsApp entre amigos. Não inclua texto na imagem.`,
          n: 1,
          size: '1024x1024',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('DALL-E error:', errorText);
        throw new Error('Failed to generate image');
      }

      const data = await response.json();
      return data.data[0].url;
    };

    // Helper to determine message type based on history
    const determineMessageType = async (
      fromInstanceId: string,
      conversationId: string
    ): Promise<'text' | 'audio' | 'image'> => {
      // Get message counts by type for this instance in this conversation
      const { data: messages } = await supabaseClient
        .from('maturador_messages')
        .select('message_type')
        .eq('conversation_id', conversationId)
        .eq('from_instance_id', fromInstanceId);

      const totalCount = messages?.length || 0;
      const audioCount = messages?.filter(m => m.message_type === 'audio').length || 0;
      const imageCount = messages?.filter(m => m.message_type === 'image').length || 0;
      const mediaCount = audioCount + imageCount;

      console.log(`Message stats for instance ${fromInstanceId}: total=${totalCount}, audio=${audioCount}, image=${imageCount}`);

      // First message: always text
      if (totalCount === 0) {
        return 'text';
      }

      // No audio sent yet? Send audio
      if (audioCount === 0) {
        return 'audio';
      }

      // No image sent yet? Send image
      if (imageCount === 0) {
        return 'image';
      }

      // After initial audio+image, every 10 text messages: random audio or image
      const textsSinceLastMedia = totalCount - mediaCount;
      if (textsSinceLastMedia >= 10 && textsSinceLastMedia % 10 === 0) {
        return Math.random() > 0.5 ? 'audio' : 'image';
      }

      // Default: text
      return 'text';
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
        console.log('Connection state result:', JSON.stringify(result, null, 2));

        // Update status in database
        const newStatus = result.instance?.state === 'open' ? 'connected' : 'disconnected';

        // If connected, try to get the phone number from Evolution AND configure webhook
        let phoneNumber: string | null = null;
        if (newStatus === 'connected') {
          try {
            // Fetch all instances to find the phone number
            const allInstances = await callEvolution('/instance/fetchInstances', 'GET');
            console.log('All instances response:', JSON.stringify(allInstances, null, 2));
            
            if (Array.isArray(allInstances)) {
              // Find the matching instance
              for (const inst of allInstances) {
                const name = inst?.instance?.instanceName || inst?.instanceName || inst?.name;
                console.log(`Checking instance: ${name} vs ${instanceName}`);
                
                if (name === instanceName) {
                  phoneNumber = extractPhoneFromInstance(inst);
                  break;
                }
              }
            }
          } catch (e) {
            console.error('Could not fetch phone number:', e);
          }
          
          // Automatically configure webhook for inbox messages
          try {
            const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
            const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-inbox-messages`;
            
            console.log(`Configuring webhook for ${instanceName} to ${webhookUrl}`);
            
            // Try Evolution API v2 format
            const webhookBody = {
              webhook: {
                enabled: true,
                url: webhookUrl,
                webhookByEvents: false,
                webhookBase64: false,
                events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'],
              }
            };
            
            const webhookResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
              method: 'POST',
              headers: {
                'apikey': EVOLUTION_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(webhookBody),
            });
            
            if (!webhookResponse.ok) {
              // Try alternative format
              const altBody = {
                enabled: true,
                url: webhookUrl,
                webhookByEvents: false,
                webhookBase64: false,
                events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'],
              };
              
              const altResponse = await fetch(`${EVOLUTION_BASE_URL}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                  'apikey': EVOLUTION_API_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(altBody),
              });
              
              if (altResponse.ok) {
                console.log('Webhook configured successfully (alternative format)');
              } else {
                console.error('Failed to configure webhook:', await altResponse.text());
              }
            } else {
              console.log('Webhook configured successfully');
            }
          } catch (webhookError) {
            console.error('Error configuring webhook:', webhookError);
          }
        }

        const updateData: any = {
          status: newStatus,
          last_seen: newStatus === 'connected' ? new Date().toISOString() : null,
        };

        if (phoneNumber) {
          updateData.phone_number = phoneNumber;
          console.log(`Updating phone_number to: ${phoneNumber}`);
        }

        await supabaseClient
          .from('maturador_instances')
          .update(updateData)
          .eq('instance_name', instanceName)
          .eq('user_id', user.id);

        break;
      }

      case 'sync-phone-numbers': {
        // Sync phone numbers for all instances from Evolution API
        const { data: userInstances, error: fetchError } = await supabaseClient
          .from('maturador_instances')
          .select('*')
          .eq('user_id', user.id);

        if (fetchError) {
          console.error('Error fetching user instances:', fetchError);
          return new Response(JSON.stringify({ error: 'Erro ao buscar instâncias' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Fetch all instances from Evolution
        const allEvolutionInstances = await callEvolution('/instance/fetchInstances', 'GET');
        console.log('Evolution instances for sync:', JSON.stringify(allEvolutionInstances, null, 2));

        const syncResults: { instanceName: string; phoneNumber: string | null; status: string }[] = [];

        // Create a map of Evolution instances by name
        const evolutionMap = new Map<string, any>();
        if (Array.isArray(allEvolutionInstances)) {
          for (const inst of allEvolutionInstances) {
            const name = inst?.instance?.instanceName || inst?.instanceName || inst?.name;
            if (name) {
              evolutionMap.set(name, inst);
            }
          }
        }

        // Update each user instance
        for (const userInst of userInstances || []) {
          const evoInst = evolutionMap.get(userInst.instance_name);
          
          if (evoInst) {
            const phone = extractPhoneFromInstance(evoInst);

            const rawStatus = evoInst?.connectionStatus || evoInst?.instance?.state || evoInst?.state;
            const newStatus = rawStatus === 'open' ? 'connected' : rawStatus === 'connecting' ? 'connecting' : 'disconnected';

            const updateData: any = { status: newStatus };
            if (phone) {
              updateData.phone_number = phone;
            }
            if (newStatus === 'connected') {
              updateData.last_seen = new Date().toISOString();
            }
            
            await supabaseClient
              .from('maturador_instances')
              .update(updateData)
              .eq('id', userInst.id)
              .eq('user_id', user.id);
            
            syncResults.push({
              instanceName: userInst.instance_name,
              phoneNumber: phone,
              status: newStatus,
            });
          } else {
            syncResults.push({
              instanceName: userInst.instance_name,
              phoneNumber: null,
              status: 'not_found_in_evolution',
            });
          }
        }

        result = { success: true, synced: syncResults.length, results: syncResults };
        break;
      }

      case 'fetch-instances': {
        result = await callEvolution('/instance/fetchInstances', 'GET');
        console.log('Fetch instances result:', JSON.stringify(result, null, 2));
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

        // Try to delete from Evolution API, but don't fail if instance doesn't exist
        try {
          result = await callEvolution(`/instance/delete/${instanceName}`, 'DELETE');
        } catch (error) {
          console.log(`Instance ${instanceName} not found in Evolution API, proceeding with local deletion`);
          result = { deleted: true, note: 'Instance was not found in Evolution API' };
        }

        // Always delete from local database
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
              message_type: 'text',
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

        // Try POST method instead of PUT for restart
        try {
          result = await callEvolution(`/instance/restart/${instanceName}`, 'POST');
        } catch (e) {
          // If POST fails, try DELETE + reconnect approach
          console.log('Restart with POST failed, trying logout + connect');
          await callEvolution(`/instance/logout/${instanceName}`, 'DELETE');
          result = await callEvolution(`/instance/connect/${instanceName}`, 'GET');
        }
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

        console.log('Instance A:', JSON.stringify(instanceA, null, 2));
        console.log('Instance B:', JSON.stringify(instanceB, null, 2));

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

        // Fetch phone numbers from Evolution API if not in DB
        const allEvolutionInstances = await callEvolution('/instance/fetchInstances', 'GET');
        console.log('Evolution instances for conversation:', JSON.stringify(allEvolutionInstances, null, 2));
        
        const phoneMap = new Map<string, string>();
        if (Array.isArray(allEvolutionInstances)) {
          for (const inst of allEvolutionInstances) {
            const name = inst?.instance?.instanceName || inst?.instanceName || inst?.name;
            const phone = extractPhoneFromInstance(inst);
            if (name && phone) {
              phoneMap.set(name, phone);
              console.log(`Mapped ${name} -> ${phone}`);
            }
          }
        }

        // Resolve phone for each instance
        const resolvePhone = async (inst: any): Promise<string | null> => {
          // First try from DB
          if (inst.phone_number && inst.phone_number.length >= 8) {
            return inst.phone_number;
          }
          // Then try from Evolution map
          const fromMap = phoneMap.get(inst.instance_name);
          if (fromMap) {
            // Update DB with this phone
            await supabaseClient
              .from('maturador_instances')
              .update({ phone_number: fromMap })
              .eq('id', inst.id)
              .eq('user_id', user.id);
            return fromMap;
          }
          return null;
        };

        const phoneA = await resolvePhone(instanceA);
        const phoneB = await resolvePhone(instanceB);

        console.log(`Phone A (${instanceA.instance_name}): ${phoneA}`);
        console.log(`Phone B (${instanceB.instance_name}): ${phoneB}`);

        if (!phoneA || !phoneB) {
          return new Response(JSON.stringify({ 
            error: 'Não foi possível obter os números de telefone. Clique em "Sincronizar Números" na página de Números.',
            phoneA,
            phoneB
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get topics for messages
        const topics = Array.isArray(conversation.topics) ? conversation.topics : [];
        const topicsText = topics.length > 0 ? topics.join(', ') : 'conversa casual, dia a dia';

        // Fetch last 10 messages for context
        const { data: messageHistory } = await supabaseClient
          .from('maturador_messages')
          .select('from_instance_id, body, created_at, message_type')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(10);

        const historyReversed = (messageHistory || []).reverse();

        // Determine who sends next by checking the last message
        const lastSenderId = historyReversed.length > 0 ? historyReversed[historyReversed.length - 1].from_instance_id : null;
        const isAToB = lastSenderId !== instanceA.id; // A sends if last wasn't A (or no messages yet)

        const fromInstance = isAToB ? instanceA : instanceB;
        const toInstance = isAToB ? instanceB : instanceA;
        const toPhone = isAToB ? phoneB : phoneA;

        // Determine message type based on history
        const messageType = await determineMessageType(fromInstance.id, conversationId);
        console.log(`Determined message type: ${messageType}`);

        let messageSent: any = null;
        let messageBody = '';

        try {
          if (messageType === 'audio') {
            // Generate audio
            console.log('Generating audio message...');
            const audioCopy = await generateAudioCopy(topicsText);
            console.log('Audio copy:', audioCopy);
            
            const audioBase64 = await generateAudioWithElevenLabs(audioCopy);
            console.log('Audio generated, sending via Evolution API...');

            // Send audio via Evolution API
            // Evolution expects raw base64 (no data: prefix) on the WhatsApp audio endpoint.
            const sendResult = await callEvolution(`/message/sendWhatsAppAudio/${fromInstance.instance_name}`, 'POST', {
              number: toPhone,
              audio: audioBase64,
            });

            console.log('Audio send result:', JSON.stringify(sendResult, null, 2));
            messageBody = `[ÁUDIO] ${audioCopy}`;
            messageSent = { from: fromInstance.instance_name, to: toInstance.instance_name, type: 'audio', text: audioCopy };

          } else if (messageType === 'image') {
            // Generate image
            console.log('Generating image message...');
            const imageUrl = await generateImageWithDallE(topicsText);
            console.log('Image URL:', imageUrl);

            // Send image via Evolution API
            const sendResult = await callEvolution(`/message/sendMedia/${fromInstance.instance_name}`, 'POST', {
              number: toPhone,
              mediatype: 'image',
              mimetype: 'image/png',
              caption: '',
              media: imageUrl,
              fileName: 'image.png',
            });

            console.log('Image send result:', JSON.stringify(sendResult, null, 2));
            messageBody = `[IMAGEM] ${topicsText}`;
            messageSent = { from: fromInstance.instance_name, to: toInstance.instance_name, type: 'image', url: imageUrl };

          } else {
            // Generate text message using AI
            const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
            
            let message = "Oi, tudo bem?"; // Fallback message
            
            if (LOVABLE_API_KEY) {
              try {
                const systemPrompt = `Você está simulando uma conversa natural entre dois amigos no WhatsApp brasileiro.
Tema principal da conversa: ${topicsText}

Regras IMPORTANTES:
- Responda com UMA mensagem curta (máximo 80 caracteres)
- Use linguagem informal e natural de WhatsApp brasileiro
- Use gírias e expressões brasileiras naturais
- Use emojis ocasionalmente (1-2 no máximo)
- NÃO faça perguntas demais, alterne entre afirmações e perguntas
- Se for a primeira mensagem, inicie com uma saudação casual
- Varie MUITO o estilo, evite repetições
- Seja criativo e imprevisível
- Considere o contexto das mensagens anteriores`;

                const aiMessages: Array<{role: string, content: string}> = [
                  { role: 'system', content: systemPrompt }
                ];

                // Add conversation history as context
                if (historyReversed.length > 0) {
                  for (const msg of historyReversed) {
                    if (msg.message_type === 'text') {
                      const role = msg.from_instance_id === fromInstance.id ? 'assistant' : 'user';
                      aiMessages.push({ role, content: msg.body });
                    }
                  }
                  aiMessages.push({ role: 'user', content: 'Agora gere a próxima mensagem da conversa. Responda APENAS com a mensagem, sem explicações.' });
                } else {
                  aiMessages.push({ role: 'user', content: 'Inicie a conversa com uma saudação casual. Responda APENAS com a mensagem, sem explicações.' });
                }

                console.log('Calling AI to generate message...');
                
                const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: aiMessages,
                    max_tokens: 100,
                    temperature: 0.9,
                  }),
                });

                if (aiResponse.ok) {
                  const aiData = await aiResponse.json();
                  const generatedMessage = aiData.choices?.[0]?.message?.content?.trim();
                  if (generatedMessage && generatedMessage.length > 0 && generatedMessage.length <= 200) {
                    message = generatedMessage;
                    console.log('AI generated message:', message);
                  } else {
                    console.log('AI response invalid, using fallback');
                  }
                } else {
                  console.error('AI API error:', await aiResponse.text());
                }
              } catch (aiError) {
                console.error('Error calling AI:', aiError);
              }
            } else {
              console.log('LOVABLE_API_KEY not found, using fallback messages');
              const fallbackMessages = [
                "Oi, tudo bem?",
                "E aí, beleza?",
                "Opa, como vai?",
                "Fala aí!",
                "Boa! Tudo certo?",
              ];
              message = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
            }

            console.log(`Sending text message from ${fromInstance.instance_name} to ${toPhone}: ${message}`);
            
            const sendResult = await callEvolution(`/message/sendText/${fromInstance.instance_name}`, 'POST', {
              number: toPhone,
              text: message,
            });

            console.log('Send result:', JSON.stringify(sendResult, null, 2));
            messageBody = message;
            messageSent = { from: fromInstance.instance_name, to: toInstance.instance_name, type: 'text', message };
          }

          // Save to database
          await supabaseClient
            .from('maturador_messages')
            .insert({
              user_id: user.id,
              conversation_id: conversationId,
              from_instance_id: fromInstance.id,
              to_instance_id: toInstance.id,
              body: messageBody,
              status: 'sent',
              message_type: messageType,
            });

        } catch (error) {
          console.error(`Error sending ${messageType} message:`, error);
          return new Response(JSON.stringify({ error: `Erro ao enviar ${messageType}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = { success: true, messagesSent: 1, messages: [messageSent] };
        break;
      }

      // Fetch and update verified contacts info from Evolution API
      case 'fetch-verified-contacts': {
        const { instanceName } = params;
        
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'instanceName is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Use service role client to update the table
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        try {
          // Get all verified contacts that haven't been fetched yet
          const { data: contacts, error: fetchError } = await serviceClient
            .from('maturador_verified_contacts')
            .select('*')
            .is('last_fetched_at', null);

          if (fetchError) throw fetchError;

          console.log(`Fetching info for ${contacts?.length || 0} verified contacts`);

          const updatedContacts = [];
          
          for (const contact of (contacts || [])) {
            let profilePic = null;
            let name = null;

            // Try to get profile picture
            try {
              const picResult = await callEvolution(`/chat/fetchProfilePictureUrl/${instanceName}`, 'POST', {
                number: contact.phone,
              });
              profilePic = picResult?.profilePictureUrl || picResult?.picture || picResult?.url || null;
            } catch (picError) {
              console.log(`Could not fetch profile picture for ${contact.phone}:`, picError);
            }

            // Try to get contact name from business profile or regular profile
            try {
              // First try business profile
              const businessResult = await callEvolution(`/chat/fetchBusinessProfile/${instanceName}`, 'POST', {
                number: contact.phone,
              });
              console.log(`Business profile for ${contact.phone}:`, JSON.stringify(businessResult, null, 2));
              name = businessResult?.name || businessResult?.pushname || businessResult?.description || null;
            } catch (businessError) {
              console.log(`Could not fetch business profile for ${contact.phone}:`, businessError);
            }

            // If no name from business profile, try regular profile
            if (!name) {
              try {
                const profileResult = await callEvolution(`/chat/fetchProfile/${instanceName}`, 'POST', {
                  number: contact.phone,
                });
                console.log(`Profile for ${contact.phone}:`, JSON.stringify(profileResult, null, 2));
                name = profileResult?.name || profileResult?.pushname || profileResult?.notify || profileResult?.verifiedName || null;
              } catch (profileError) {
                console.log(`Could not fetch profile for ${contact.phone}:`, profileError);
              }
            }

            // Update the contact in the database
            const { error: updateError } = await serviceClient
              .from('maturador_verified_contacts')
              .update({
                name,
                profile_pic_url: profilePic,
                last_fetched_at: new Date().toISOString(),
              })
              .eq('id', contact.id);

            if (updateError) {
              console.error(`Error updating contact ${contact.phone}:`, updateError);
            } else {
              updatedContacts.push({ phone: contact.phone, name, profilePic });
            }

            // Small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          result = { success: true, updated: updatedContacts.length };
        } catch (error) {
          console.error('Error fetching verified contacts:', error);
          return new Response(JSON.stringify({ error: 'Erro ao buscar contatos verificados' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      // Fetch single contact profile info
      case 'fetch-single-contact': {
        const { instanceName, phone, contactId, customName } = params;
        
        if (!instanceName || !phone || !contactId) {
          return new Response(JSON.stringify({ error: 'instanceName, phone and contactId are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Use service role client to update the table
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        try {
          const cleanPhone = phone.replace(/\D/g, '');
          let profilePic = null;
          let fetchedName = null;

          // Try to get profile picture
          try {
            const picResult = await callEvolution(`/chat/fetchProfilePictureUrl/${instanceName}`, 'POST', {
              number: cleanPhone,
            });
            profilePic = picResult?.profilePictureUrl || picResult?.picture || picResult?.url || null;
            console.log(`Profile picture for ${cleanPhone}:`, profilePic);
          } catch (picError) {
            console.log(`Could not fetch profile picture for ${cleanPhone}:`, picError);
          }

          // Only fetch name if user didn't set a custom name
          if (!customName) {
            // Try to get contact name from business profile
            try {
              const businessResult = await callEvolution(`/chat/fetchBusinessProfile/${instanceName}`, 'POST', {
                number: cleanPhone,
              });
              console.log(`Business profile for ${cleanPhone}:`, JSON.stringify(businessResult, null, 2));
              fetchedName = businessResult?.name || businessResult?.pushname || businessResult?.description || null;
            } catch (businessError) {
              console.log(`Could not fetch business profile for ${cleanPhone}:`, businessError);
            }

            // If no name from business profile, try regular profile
            if (!fetchedName) {
              try {
                const profileResult = await callEvolution(`/chat/fetchProfile/${instanceName}`, 'POST', {
                  number: cleanPhone,
                });
                console.log(`Profile for ${cleanPhone}:`, JSON.stringify(profileResult, null, 2));
                fetchedName = profileResult?.name || profileResult?.pushname || profileResult?.notify || profileResult?.verifiedName || null;
              } catch (profileError) {
                console.log(`Could not fetch profile for ${cleanPhone}:`, profileError);
              }
            }
          }

          // Use custom name if provided, otherwise use fetched name
          const finalName = customName || fetchedName || null;

          // Update the contact in the database (only update profile_pic_url if fetched, always respect custom name)
          const updateData: any = {
            last_fetched_at: new Date().toISOString(),
          };
          
          // Only update profile picture if we got one
          if (profilePic) {
            updateData.profile_pic_url = profilePic;
          }
          
          // Only update name if custom name was provided or if we fetched a name and there's no custom name
          if (customName) {
            updateData.name = customName;
          } else if (fetchedName) {
            updateData.name = fetchedName;
          }

          const { error: updateError } = await serviceClient
            .from('maturador_verified_contacts')
            .update(updateData)
            .eq('id', contactId);

          if (updateError) {
            console.error(`Error updating contact ${cleanPhone}:`, updateError);
            throw updateError;
          }

          result = { success: true, name: finalName, profilePic };
        } catch (error) {
          console.error('Error fetching single contact:', error);
          return new Response(JSON.stringify({ error: 'Erro ao buscar informações do contato' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      // Find all labels for an instance
      case 'find-labels': {
        const { instanceName } = params;
        
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'instanceName is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          result = await callEvolution(`/label/findLabels/${instanceName}`, 'GET');
          console.log('Find labels result:', JSON.stringify(result, null, 2));
        } catch (error) {
          console.error('Error finding labels:', error);
          return new Response(JSON.stringify({ error: 'Erro ao buscar etiquetas' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      // Add or remove label from a contact
      case 'handle-label': {
        const { instanceName, remoteJid, labelName, labelAction } = params;
        
        console.log('Maturador action: handle-label', { instanceName, remoteJid, labelName, labelAction });
        
        if (!instanceName || !remoteJid) {
          return new Response(JSON.stringify({ error: 'instanceName and remoteJid are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          // First, find all labels for this instance
          const labelsResult = await callEvolution(`/label/findLabels/${instanceName}`, 'GET');
          console.log('Labels for instance:', JSON.stringify(labelsResult, null, 2));
          
          // Find the label by name
          let labelId: string | null = null;
          const labels = Array.isArray(labelsResult) ? labelsResult : labelsResult?.labels || [];
          
          for (const label of labels) {
            const name = label?.name || label?.displayName || '';
            if (name.toLowerCase() === labelName?.toLowerCase()) {
              labelId = label?.id || label?.labelId;
              break;
            }
          }
          
          if (!labelId) {
            console.log(`Label "${labelName}" not found in available labels`);
            return new Response(JSON.stringify({ 
              error: `Etiqueta "${labelName}" não encontrada. Etiquetas disponíveis: ${labels.map((l: any) => l.name).join(', ')}` 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          const cleanNumber = String(remoteJid).split('@')[0].replace(/\D/g, '');
          if (!cleanNumber) {
            return new Response(JSON.stringify({ error: 'remoteJid inválido (não foi possível extrair o número)' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Endpoint correto da Evolution: POST /label/handleLabel/{instanceName}
          // Obs: a Evolution geralmente espera o número “limpo” (sem @s.whatsapp.net)
          const handleResult = await callEvolution(`/label/handleLabel/${instanceName}`, 'POST', {
            number: cleanNumber,
            labelId: labelId,
            action: labelAction || 'add', // 'add' or 'remove'
          });
          
          console.log('Handle label result:', JSON.stringify(handleResult, null, 2));
          result = { success: true, labelId, labelName, action: labelAction, ...handleResult };
        } catch (error) {
          console.error('Error handling label:', error);
          const err = error as any;

          const rawMsg = String(err?.message || '');
          const msgArr = err?.details?.response?.message;
          const combinedMsg = Array.isArray(msgArr) ? msgArr.join(' | ') : rawMsg;

          // Known Evolution bug: missing unique constraint in their DB (Postgres 42P10)
          // This cannot be fixed from our side; user/provider must update their Evolution deployment.
          const isEvolution42P10 = combinedMsg.includes('42P10') || combinedMsg.includes('ON CONFLICT') || combinedMsg.includes('unique or exclusion constraint');
          const friendly = isEvolution42P10
            ? 'Seu servidor Evolution está com um bug de banco (42P10) e não consegue aplicar etiquetas via API. Atualize a Evolution para uma versão que corrija isso (ou peça ao provedor para ajustar o banco/atualizar).'
            : 'Falha ao aplicar etiqueta na Evolution.';

          // Return 200 so the client can read the payload (supabase-js discards body on non-2xx)
          return new Response(
            JSON.stringify({
              success: false,
              error: friendly,
              evolution_status: err?.status,
              evolution_details: err?.details,
              evolution_endpoint: err?.endpoint,
              message: err?.message,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        break;
      }

      // Send message to verified contact
      case 'send-verified-message': {
        const { instanceName, phone, message } = params;
        
        if (!instanceName || !phone || !message) {
          return new Response(JSON.stringify({ error: 'instanceName, phone and message are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          // Clean phone number
          const cleanPhone = phone.replace(/\D/g, '');
          
          // Send text message
          const sendResult = await callEvolution(`/message/sendText/${instanceName}`, 'POST', {
            number: cleanPhone,
            text: message,
          });

          console.log('Verified message send result:', JSON.stringify(sendResult, null, 2));
          result = { success: true, sendResult };
        } catch (error) {
          console.error('Error sending verified message:', error);
          return new Response(JSON.stringify({ error: 'Erro ao enviar mensagem' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
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
