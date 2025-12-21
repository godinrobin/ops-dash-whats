import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate unique charge code (similar to image: 4TWYFFNV2B5)
function generateChargeCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Format currency to BRL
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

// Call Evolution API
async function callEvolution(baseUrl: string, apiKey: string, endpoint: string, method: string, body?: any) {
  const url = `${baseUrl}${endpoint}`;
  console.log(`Evolution API call: ${method} ${url}`);
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    console.error('Evolution API error:', data);
    throw new Error(data.message || 'Evolution API error');
  }
  
  return data;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    console.log(`Action: ${action}, User: ${user.id}`);

    switch (action) {
      case 'create-charge': {
        const { instance_id, recipient_phone, recipient_name, items, notes, generate_pix } = body;
        
        if (!recipient_phone || !items || items.length === 0) {
          return new Response(JSON.stringify({ error: 'Telefone e itens são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Calculate total
        const total_amount = items.reduce((sum: number, item: any) => {
          return sum + (item.price * item.quantity);
        }, 0);

        // Generate unique charge code
        let charge_code = generateChargeCode();
        
        // Check if code already exists and regenerate if needed
        let attempts = 0;
        while (attempts < 5) {
          const { data: existingCharge } = await supabase
            .from('whatsapp_charges')
            .select('id')
            .eq('charge_code', charge_code)
            .maybeSingle();
          
          if (!existingCharge) break;
          charge_code = generateChargeCode();
          attempts++;
        }

        let pix_qr_code = null;
        let pix_copy_paste = null;

        // Generate PIX if requested
        if (generate_pix) {
          const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
          if (mpAccessToken) {
            try {
              const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${mpAccessToken}`,
                  'X-Idempotency-Key': `charge-${charge_code}`,
                },
                body: JSON.stringify({
                  transaction_amount: total_amount,
                  description: `Cobrança ${charge_code}`,
                  payment_method_id: 'pix',
                  payer: {
                    email: 'cliente@email.com',
                    first_name: recipient_name || 'Cliente',
                  },
                }),
              });
              
              const pixData = await pixResponse.json();
              if (pixData.point_of_interaction?.transaction_data) {
                pix_qr_code = pixData.point_of_interaction.transaction_data.qr_code_base64;
                pix_copy_paste = pixData.point_of_interaction.transaction_data.qr_code;
              }
            } catch (pixError) {
              console.error('PIX generation error:', pixError);
              // Continue without PIX
            }
          }
        }

        // Create charge
        const { data: charge, error: chargeError } = await supabase
          .from('whatsapp_charges')
          .insert({
            user_id: user.id,
            instance_id,
            recipient_phone,
            recipient_name,
            charge_code,
            items,
            total_amount,
            notes,
            pix_qr_code,
            pix_copy_paste,
            status: 'pending',
          })
          .select()
          .single();

        if (chargeError) {
          console.error('Create charge error:', chargeError);
          return new Response(JSON.stringify({ error: 'Erro ao criar cobrança' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, charge }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-charge': {
        const { charge_id } = body;

        if (!charge_id) {
          return new Response(JSON.stringify({ error: 'ID da cobrança é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get charge data
        const { data: charge, error: chargeError } = await supabase
          .from('whatsapp_charges')
          .select('*, maturador_instances(*)')
          .eq('id', charge_id)
          .eq('user_id', user.id)
          .single();

        if (chargeError || !charge) {
          return new Response(JSON.stringify({ error: 'Cobrança não encontrada' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get Evolution API config
        const { data: config } = await supabase
          .from('maturador_config')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        // Use environment Evolution API or user config
        const evolutionApiKey = config?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
        const evolutionBaseUrl = config?.evolution_base_url || 'https://press.nexusnerds.com.br';

        if (!evolutionApiKey) {
          return new Response(JSON.stringify({ error: 'Evolution API não configurada' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const instanceName = charge.maturador_instances?.instance_name;
        if (!instanceName) {
          return new Response(JSON.stringify({ error: 'Instância não encontrada. Selecione uma instância válida.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Format items list
        const itemsList = charge.items.map((item: any) => 
          `📦 *${item.name}*\n   Quantidade: ${item.quantity}\n   Valor: ${formatCurrency(item.price * item.quantity)}`
        ).join('\n\n');

        // Build message
        let message = `🧾 *COBRANÇA N° ${charge.charge_code}*\n\n`;
        message += `${itemsList}\n\n`;
        message += `━━━━━━━━━━━━━━━━\n`;
        message += `💰 *TOTAL: ${formatCurrency(charge.total_amount)}*\n`;
        message += `━━━━━━━━━━━━━━━━\n\n`;
        
        if (charge.pix_copy_paste) {
          message += `📲 *PIX Copia e Cola:*\n${charge.pix_copy_paste}\n\n`;
        }
        
        message += `📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n`;
        message += `⏰ Status: Aguardando pagamento`;

        // Format phone number
        let phone = charge.recipient_phone.replace(/\D/g, '');
        if (!phone.startsWith('55')) {
          phone = '55' + phone;
        }

        // Send message via Evolution API
        try {
          await callEvolution(
            evolutionBaseUrl,
            evolutionApiKey,
            `/message/sendText/${instanceName}`,
            'POST',
            {
              number: phone,
              text: message,
            }
          );

          // Update charge as sent
          await supabase
            .from('whatsapp_charges')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', charge_id);

          return new Response(JSON.stringify({ success: true, message: 'Cobrança enviada com sucesso' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (sendError: any) {
          console.error('Send message error:', sendError);
          return new Response(JSON.stringify({ error: `Erro ao enviar: ${sendError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'update-status': {
        const { charge_id, status, notify_customer } = body;

        if (!charge_id || !status) {
          return new Response(JSON.stringify({ error: 'ID e status são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const validStatuses = ['pending', 'paid', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
          return new Response(JSON.stringify({ error: 'Status inválido' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Build update object
        const updateData: any = { status };
        if (status === 'paid') {
          updateData.paid_at = new Date().toISOString();
        } else if (status === 'delivered') {
          updateData.delivered_at = new Date().toISOString();
        }

        // Update charge
        const { data: charge, error: updateError } = await supabase
          .from('whatsapp_charges')
          .update(updateData)
          .eq('id', charge_id)
          .eq('user_id', user.id)
          .select('*, maturador_instances(*)')
          .single();

        if (updateError) {
          console.error('Update status error:', updateError);
          return new Response(JSON.stringify({ error: 'Erro ao atualizar status' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Notify customer if requested
        if (notify_customer && charge.maturador_instances?.instance_name) {
          const { data: config } = await supabase
            .from('maturador_config')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          const evolutionApiKey = config?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
          const evolutionBaseUrl = config?.evolution_base_url || 'https://press.nexusnerds.com.br';

          if (evolutionApiKey) {
            const statusMessages: Record<string, string> = {
              paid: `✅ *Pagamento Confirmado!*\n\nCobrança N° ${charge.charge_code}\nValor: ${formatCurrency(charge.total_amount)}\n\nObrigado pelo pagamento!`,
              delivered: `📦 *Entrega Confirmada!*\n\nCobrança N° ${charge.charge_code}\n\nSeu pedido foi entregue. Agradecemos a preferência!`,
              cancelled: `❌ *Cobrança Cancelada*\n\nCobrança N° ${charge.charge_code}\n\nEsta cobrança foi cancelada.`,
            };

            const notifyMessage = statusMessages[status];
            if (notifyMessage) {
              let phone = charge.recipient_phone.replace(/\D/g, '');
              if (!phone.startsWith('55')) {
                phone = '55' + phone;
              }

              try {
                await callEvolution(
                  evolutionBaseUrl,
                  evolutionApiKey,
                  `/message/sendText/${charge.maturador_instances.instance_name}`,
                  'POST',
                  {
                    number: phone,
                    text: notifyMessage,
                  }
                );
              } catch (notifyError) {
                console.error('Notify error:', notifyError);
                // Don't fail the update if notification fails
              }
            }
          }
        }

        return new Response(JSON.stringify({ success: true, charge }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'list-charges': {
        const { status: filterStatus, limit = 50 } = body;

        let query = supabase
          .from('whatsapp_charges')
          .select('*, maturador_instances(instance_name, phone_number)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filterStatus && filterStatus !== 'all') {
          query = query.eq('status', filterStatus);
        }

        const { data: charges, error: listError } = await query;

        if (listError) {
          console.error('List charges error:', listError);
          return new Response(JSON.stringify({ error: 'Erro ao listar cobranças' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, charges }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete-charge': {
        const { charge_id } = body;

        if (!charge_id) {
          return new Response(JSON.stringify({ error: 'ID da cobrança é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error: deleteError } = await supabase
          .from('whatsapp_charges')
          .delete()
          .eq('id', charge_id)
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('Delete charge error:', deleteError);
          return new Response(JSON.stringify({ error: 'Erro ao excluir cobrança' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
