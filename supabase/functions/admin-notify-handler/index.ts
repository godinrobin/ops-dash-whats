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
    const { action, instanceId, userId, message, senderPhone } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get São Paulo date (UTC-3)
    const now = new Date();
    const saoPauloOffset = -3 * 60; // -3 hours in minutes
    const saoPauloTime = new Date(now.getTime() + (saoPauloOffset * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000));
    const todayDate = saoPauloTime.toISOString().split('T')[0];

    if (action === 'increment-conversation') {
      // Increment daily conversation count for this instance
      const { data: existingCount, error: fetchError } = await supabase
        .from('admin_notify_daily_counts')
        .select('*')
        .eq('user_id', userId)
        .eq('instance_id', instanceId)
        .eq('date', todayDate)
        .maybeSingle();

      if (fetchError) throw fetchError;

      let newCount: number;
      let countId: string;

      if (existingCount) {
        newCount = existingCount.conversation_count + 1;
        countId = existingCount.id;
        
        await supabase
          .from('admin_notify_daily_counts')
          .update({ conversation_count: newCount })
          .eq('id', existingCount.id);
      } else {
        newCount = 1;
        const { data: newRecord } = await supabase
          .from('admin_notify_daily_counts')
          .insert({
            user_id: userId,
            instance_id: instanceId,
            date: todayDate,
            conversation_count: 1,
          })
          .select()
          .single();
        countId = newRecord?.id;
      }

      // Check if limit was reached
      const { data: leadLimit } = await supabase
        .from('admin_notify_lead_limits')
        .select('*, config:admin_notify_configs(*)')
        .eq('instance_id', instanceId)
        .eq('is_active', true)
        .maybeSingle();

      if (leadLimit && newCount >= leadLimit.daily_limit) {
        // Check if we already notified
        const { data: dailyCount } = await supabase
          .from('admin_notify_daily_counts')
          .select('limit_notified')
          .eq('id', countId)
          .single();

        if (!dailyCount?.limit_notified) {
          // Send notification
          const { data: instance } = await supabase
            .from('maturador_instances')
            .select('phone_number, label, instance_name')
            .eq('id', instanceId)
            .single();

          const instanceDisplay = instance?.phone_number || instance?.label || instance?.instance_name || 'Desconhecido';
          
          // Get notifier instance
          const { data: notifierInstance } = await supabase
            .from('maturador_instances')
            .select('instance_name, uazapi_token')
            .eq('id', leadLimit.config.notifier_instance_id)
            .single();

          if (notifierInstance?.uazapi_token) {
            // Get admin numbers
            const { data: adminInstances } = await supabase
              .from('maturador_instances')
              .select('phone_number')
              .in('id', leadLimit.config.admin_instance_ids);

            const message = `🔔 *ALERTA DE LIMITE DE LEADS*\n\n📱 Número: ${instanceDisplay}\n📊 Meta atingida: ${leadLimit.daily_limit} conversas/dia\n\n✅ O número bateu a meta de leads do dia!`;

            // Send to all admin numbers
            for (const admin of adminInstances || []) {
              if (admin.phone_number) {
                const baseUrl = Deno.env.get('UAZAPI_BASE_URL') || 'https://g1.uazapi.com';
                await fetch(`${baseUrl}/message/sendText`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'token': notifierInstance.uazapi_token,
                  },
                  body: JSON.stringify({
                    number: admin.phone_number,
                    text: message,
                  }),
                });
              }
            }
          }

          // Mark as notified
          await supabase
            .from('admin_notify_daily_counts')
            .update({ limit_notified: true })
            .eq('id', countId);
        }
      }

      return new Response(JSON.stringify({ success: true, count: newCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check-command') {
      // Check if message is a command
      const trimmedMessage = message?.trim()?.toLowerCase();
      
      if (trimmedMessage !== '#status' && trimmedMessage !== '#vendas') {
        return new Response(JSON.stringify({ isCommand: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get config for this instance
      const { data: config } = await supabase
        .from('admin_notify_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('notifier_instance_id', instanceId)
        .maybeSingle();

      if (!config) {
        return new Response(JSON.stringify({ isCommand: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if sender is an admin
      const { data: senderInstance } = await supabase
        .from('maturador_instances')
        .select('id')
        .eq('phone_number', senderPhone)
        .eq('user_id', userId)
        .maybeSingle();

      const isAdmin = senderInstance && config.admin_instance_ids.includes(senderInstance.id);
      
      if (!isAdmin) {
        return new Response(JSON.stringify({ isCommand: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get notifier instance for sending response
      const { data: notifierInstance } = await supabase
        .from('maturador_instances')
        .select('instance_name, uazapi_token')
        .eq('id', instanceId)
        .single();

      if (!notifierInstance?.uazapi_token) {
        return new Response(JSON.stringify({ isCommand: false, error: 'Notifier not configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const baseUrl = Deno.env.get('UAZAPI_BASE_URL') || 'https://g1.uazapi.com';

      if (trimmedMessage === '#status') {
        // Get monitored instances
        const { data: monitors } = await supabase
          .from('admin_notify_instance_monitor')
          .select('instance_id')
          .eq('config_id', config.id)
          .eq('is_active', true);

        if (!monitors || monitors.length === 0) {
          const responseMessage = '📊 *STATUS DAS INSTÂNCIAS*\n\n⚠️ Nenhum número configurado para monitoramento.';
          
          await fetch(`${baseUrl}/message/sendText`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': notifierInstance.uazapi_token,
            },
            body: JSON.stringify({
              number: senderPhone,
              text: responseMessage,
            }),
          });

          return new Response(JSON.stringify({ isCommand: true, handled: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get status of each monitored instance
        const instanceIds = monitors.map(m => m.instance_id);
        const { data: instances } = await supabase
          .from('maturador_instances')
          .select('id, phone_number, label, instance_name, status')
          .in('id', instanceIds);

        let statusMessage = '📊 *STATUS DAS INSTÂNCIAS*\n\n';
        
        for (const instance of instances || []) {
          const display = instance.phone_number || instance.label || instance.instance_name;
          const statusEmoji = instance.status === 'connected' ? '🟢' : '🔴';
          const statusText = instance.status === 'connected' ? 'Conectado' : 'Desconectado';
          statusMessage += `${statusEmoji} ${display}: *${statusText}*\n`;
        }

        await fetch(`${baseUrl}/message/sendText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': notifierInstance.uazapi_token,
          },
          body: JSON.stringify({
            number: senderPhone,
            text: statusMessage,
          }),
        });

        return new Response(JSON.stringify({ isCommand: true, handled: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (trimmedMessage === '#vendas') {
        // Get monitored instances for sales
        const { data: salesMonitors } = await supabase
          .from('admin_notify_sales_monitor')
          .select('instance_id')
          .eq('config_id', config.id)
          .eq('is_active', true);

        if (!salesMonitors || salesMonitors.length === 0) {
          const responseMessage = '💰 *VENDAS DO DIA*\n\n⚠️ Nenhum número configurado para monitoramento de vendas.';
          
          await fetch(`${baseUrl}/message/sendText`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': notifierInstance.uazapi_token,
            },
            body: JSON.stringify({
              number: senderPhone,
              text: responseMessage,
            }),
          });

          return new Response(JSON.stringify({ isCommand: true, handled: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get instances info
        const instanceIds = salesMonitors.map(m => m.instance_id);
        const { data: instances } = await supabase
          .from('maturador_instances')
          .select('id, phone_number, label, instance_name')
          .in('id', instanceIds);

        // Get sales from Tag Whats Cloud for today
        const { data: sales } = await supabase
          .from('tag_whats_pix_logs')
          .select('instance_id, created_at')
          .eq('user_id', userId)
          .in('instance_id', instanceIds)
          .gte('created_at', `${todayDate}T00:00:00-03:00`)
          .lte('created_at', `${todayDate}T23:59:59-03:00`);

        // Group sales by instance
        const salesByInstance: Record<string, number> = {};
        for (const sale of sales || []) {
          salesByInstance[sale.instance_id] = (salesByInstance[sale.instance_id] || 0) + 1;
        }

        let salesMessage = '💰 *VENDAS DO DIA*\n📅 ' + todayDate + '\n\n';
        let totalSales = 0;

        for (const instance of instances || []) {
          const display = instance.phone_number || instance.label || instance.instance_name;
          const count = salesByInstance[instance.id] || 0;
          totalSales += count;
          const emoji = count > 0 ? '💵' : '📭';
          salesMessage += `${emoji} ${display}: *${count} venda(s)*\n`;
        }

        salesMessage += `\n📊 *Total: ${totalSales} venda(s)*\n\nℹ️ Dados provenientes do Tag Whats Cloud`;

        await fetch(`${baseUrl}/message/sendText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': notifierInstance.uazapi_token,
          },
          body: JSON.stringify({
            number: senderPhone,
            text: salesMessage,
          }),
        });

        return new Response(JSON.stringify({ isCommand: true, handled: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ isCommand: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in admin-notify-handler:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
