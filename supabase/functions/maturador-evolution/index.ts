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

    // Get user's Evolution API config
    const { data: config, error: configError } = await supabaseClient
      .from('maturador_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const { action, ...params } = await req.json();
    console.log(`Maturador action: ${action}`, params);

    // For save-config action, we don't need existing config
    if (action === 'save-config') {
      const { evolutionBaseUrl, evolutionApiKey } = params;
      
      if (!evolutionBaseUrl || !evolutionApiKey) {
        return new Response(JSON.stringify({ error: 'URL e API Key são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Upsert config
      const { error: upsertError } = await supabaseClient
        .from('maturador_config')
        .upsert({
          user_id: user.id,
          evolution_base_url: evolutionBaseUrl.replace(/\/$/, ''), // Remove trailing slash
          evolution_api_key: evolutionApiKey,
        }, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        return new Response(JSON.stringify({ error: 'Erro ao salvar configuração' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For test-connection, we can use provided params or saved config
    if (action === 'test-connection') {
      const baseUrl = params.evolutionBaseUrl || config?.evolution_base_url;
      const apiKey = params.evolutionApiKey || config?.evolution_api_key;

      if (!baseUrl || !apiKey) {
        return new Response(JSON.stringify({ error: 'Configuração da Evolution API não encontrada' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/instance/fetchInstances`, {
          method: 'GET',
          headers: {
            'apikey': apiKey,
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

    // For other actions, config is required
    if (configError || !config) {
      console.error('Config error:', configError);
      return new Response(JSON.stringify({ error: 'Configuração da Evolution API não encontrada. Configure primeiro.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = config.evolution_base_url;
    const apiKey = config.evolution_api_key;

    // Helper function to call Evolution API
    const callEvolution = async (endpoint: string, method: string = 'GET', body?: any) => {
      const url = `${baseUrl}${endpoint}`;
      console.log(`Calling Evolution API: ${method} ${url}`);
      
      const options: RequestInit = {
        method,
        headers: {
          'apikey': apiKey,
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
      case 'create-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
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
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
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
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
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
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
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
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
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
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
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
        const { instanceName, number, text } = params;
        if (!instanceName || !number || !text) {
          return new Response(JSON.stringify({ error: 'Instância, número e texto são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/message/sendText/${instanceName}`, 'POST', {
          number,
          text,
        });

        break;
      }

      case 'restart-instance': {
        const { instanceName } = params;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Nome da instância é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        result = await callEvolution(`/instance/restart/${instanceName}`, 'PUT');
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
