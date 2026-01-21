import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return new Response(JSON.stringify({ error: "messageId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[DELETE-MESSAGE] User ${userId} requesting to delete message ${messageId}`);

    // Fetch message details
    const { data: message, error: msgError } = await supabaseClient
      .from("inbox_messages")
      .select(`
        id,
        user_id,
        instance_id,
        direction,
        remote_message_id,
        created_at,
        contact_id,
        inbox_contacts!inner(phone, remote_jid)
      `)
      .eq("id", messageId)
      .single();

    if (msgError || !message) {
      console.error("[DELETE-MESSAGE] Message not found:", msgError);
      return new Response(JSON.stringify({ error: "Mensagem não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    if (message.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Sem permissão para deletar esta mensagem" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only outbound messages can be deleted
    if (message.direction !== 'outbound') {
      return new Response(JSON.stringify({ error: "Apenas mensagens enviadas podem ser apagadas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if message is not too old (WhatsApp limit is ~1 hour for "delete for everyone")
    const messageDate = new Date(message.created_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff > 1) {
      return new Response(JSON.stringify({ 
        error: "Mensagem muito antiga para ser apagada para todos",
        details: "O WhatsApp permite apagar mensagens para todos apenas dentro de 1 hora após o envio."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!message.remote_message_id) {
      // If no remote_message_id, just delete from our DB
      await supabaseClient
        .from("inbox_messages")
        .delete()
        .eq("id", messageId);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Mensagem removida do sistema (não tinha ID remoto)" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch instance config
    const { data: instance, error: instanceError } = await supabaseClient
      .from("maturador_instances")
      .select("instance_name, uazapi_token, api_provider, evolution_base_url, evolution_api_key")
      .eq("id", message.instance_id)
      .single();

    if (instanceError || !instance) {
      console.error("[DELETE-MESSAGE] Instance not found:", instanceError);
      return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get UazAPI base URL from admin config or user config
    const { data: adminConfig } = await supabaseClient
      .from("whatsapp_admin_api_config")
      .select("uazapi_base_url")
      .maybeSingle();

    const { data: userConfig } = await supabaseClient
      .from("whatsapp_user_api_config")
      .select("uazapi_base_url")
      .eq("user_id", userId)
      .maybeSingle();
    
    const uazapiBaseUrl = userConfig?.uazapi_base_url || adminConfig?.uazapi_base_url || "https://zapdata.uazapi.com";

    // Determine API provider
    const provider = instance.api_provider || 'uazapi';
    let deleteSuccess = false;
    let apiError = null;

    if (provider === 'uazapi') {
      // UazAPI: POST /message/delete
      const token = instance.uazapi_token || '';
      
      if (!token) {
        return new Response(JSON.stringify({ error: "Instância UazAPI não configurada" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const deleteUrl = `${uazapiBaseUrl}/message/delete`;
      console.log(`[DELETE-MESSAGE] Calling UazAPI: ${deleteUrl}`);

      try {
        const response = await fetch(deleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': token,
          },
          body: JSON.stringify({
            id: message.remote_message_id,
          }),
        });

        const result = await response.json();
        console.log(`[DELETE-MESSAGE] UazAPI response:`, result);

        if (response.ok) {
          deleteSuccess = true;
        } else {
          apiError = result.message || result.error || 'Erro desconhecido';
        }
      } catch (error: any) {
        console.error("[DELETE-MESSAGE] UazAPI error:", error);
        apiError = error.message;
      }
    } else if (provider === 'evolution') {
      // Evolution API: DELETE /chat/deleteMessageForEveryone/{instanceName}
      // Use instance-level config first, then env as fallback
      const evolutionUrl = instance.evolution_base_url || Deno.env.get("EVOLUTION_BASE_URL");
      const evolutionKey = instance.evolution_api_key || Deno.env.get("EVOLUTION_API_KEY");

      if (!evolutionUrl || !evolutionKey) {
        return new Response(JSON.stringify({ error: "Evolution API não configurada" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the remoteJid from contact
      const contact = message.inbox_contacts as any;
      const remoteJid = contact?.remote_jid || `${contact?.phone}@s.whatsapp.net`;

      const deleteUrl = `${evolutionUrl}/chat/deleteMessageForEveryone/${instance.instance_name}`;
      console.log(`[DELETE-MESSAGE] Calling Evolution API: ${deleteUrl}`);

      try {
        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionKey,
          },
          body: JSON.stringify({
            remoteJid: remoteJid,
            messageId: message.remote_message_id,
            fromMe: true,
          }),
        });

        const result = await response.json();
        console.log(`[DELETE-MESSAGE] Evolution response:`, result);

        if (response.ok) {
          deleteSuccess = true;
        } else {
          apiError = result.message || result.error || 'Erro desconhecido';
        }
      } catch (error: any) {
        console.error("[DELETE-MESSAGE] Evolution error:", error);
        apiError = error.message;
      }
    } else {
      return new Response(JSON.stringify({ error: `Provider não suportado: ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (deleteSuccess) {
      // Update message status in our DB to indicate it was deleted
      await supabaseClient
        .from("inbox_messages")
        .update({ status: 'deleted' as any })
        .eq("id", messageId);

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Mensagem apagada para todos" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: apiError || "Não foi possível apagar a mensagem",
        details: "A mensagem pode ter expirado o tempo limite para ser apagada."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: any) {
    console.error("[DELETE-MESSAGE] Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
