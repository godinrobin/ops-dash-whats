import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTANCE_COST_CREDITS = 6;
const GRACE_PERIOD_HOURS = 24;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[INSTANCE-RENEWALS] Starting instance renewal process...');

    // Get credit price from config
    const { data: config } = await supabase
      .from('credits_system_config')
      .select('value')
      .eq('key', 'credit_price_brl')
      .single();
    
    const creditPriceBrl = config?.value ? parseFloat(config.value) : 6.5;

    // Find all expired instances (non-free)
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

    // Group by user for efficient processing
    const userInstances: Record<string, typeof expiredSubs> = {};
    for (const sub of expiredSubs) {
      if (!userInstances[sub.user_id]) {
        userInstances[sub.user_id] = [];
      }
      userInstances[sub.user_id].push(sub);
    }

    const results = [];
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    for (const [userId, subs] of Object.entries(userInstances)) {
      console.log(`[INSTANCE-RENEWALS] Processing ${subs.length} instances for user ${userId}`);

      // Get user profile for auto-renewal setting
      const { data: profile } = await supabase
        .from('profiles')
        .select('auto_renewal_enabled')
        .eq('id', userId)
        .single();

      const autoRenewalEnabled = profile?.auto_renewal_enabled !== false;

      // Get user's credit balance
      const { data: wallet } = await supabase
        .from('sms_user_wallets')
        .select('credits')
        .eq('user_id', userId)
        .single();

      let availableCredits = wallet?.credits || 0;

      // Get user's primary payment method
      const { data: paymentMethod } = await supabase
        .from('user_payment_methods')
        .select('*')
        .eq('user_id', userId)
        .eq('is_primary', true)
        .single();

      const totalCreditsNeeded = subs.length * INSTANCE_COST_CREDITS;
      const creditsDeficit = Math.max(0, totalCreditsNeeded - availableCredits);

      // Try to charge card for missing credits if auto-renewal is enabled and card exists
      if (creditsDeficit > 0 && paymentMethod && autoRenewalEnabled) {
        const amountToCharge = creditsDeficit * creditPriceBrl;
        console.log(`[INSTANCE-RENEWALS] Attempting to charge R$ ${amountToCharge.toFixed(2)} for ${creditsDeficit} credits`);

        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amountToCharge * 100),
            currency: "brl",
            customer: paymentMethod.stripe_customer_id,
            payment_method: paymentMethod.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            description: `Renovação automática de ${subs.length} instância(s)`,
          });

          if (paymentIntent.status === "succeeded") {
            // Add credits
            await supabase.rpc("add_credits", {
              p_user_id: userId,
              p_amount: creditsDeficit,
              p_description: `Renovação automática - Cartão ****${paymentMethod.card_last4} - R$ ${amountToCharge.toFixed(2)}`,
            });

            availableCredits += creditsDeficit;
            console.log(`[INSTANCE-RENEWALS] Card charged successfully. New balance: ${availableCredits} credits`);

            // Log the renewal
            await supabase.from('instance_renewal_logs').insert({
              user_id: userId,
              renewal_type: 'card',
              credits_used: creditsDeficit,
              card_amount_charged: amountToCharge,
              payment_method_id: paymentMethod.id,
              status: 'success',
            });
          }
        } catch (stripeError: any) {
          console.error(`[INSTANCE-RENEWALS] Card charge failed:`, stripeError.message);
          
          // Log the failure
          await supabase.from('instance_renewal_logs').insert({
            user_id: userId,
            renewal_type: 'failed',
            card_amount_charged: amountToCharge,
            payment_method_id: paymentMethod.id,
            status: 'failed',
            error_message: stripeError.message,
          });

          // Send notification (TODO: implement notification system)
        }
      }

      // Process each instance
      for (const sub of subs) {
        try {
          // Get instance details
          const { data: instance, error: instError } = await supabase
            .from('maturador_instances')
            .select('instance_name')
            .eq('id', sub.instance_id)
            .single();

          if (instError || !instance) {
            console.log(`[INSTANCE-RENEWALS] Instance ${sub.instance_id} not found, cleaning up subscription`);
            await supabase.from('instance_subscriptions').delete().eq('id', sub.id);
            results.push({ instanceId: sub.instance_id, status: 'subscription_cleaned' });
            continue;
          }

          // Try to renew with credits
          if (availableCredits >= INSTANCE_COST_CREDITS) {
            // Deduct credits
            const { error: deductError } = await supabase.rpc('deduct_credits', {
              p_user_id: userId,
              p_amount: INSTANCE_COST_CREDITS,
              p_description: `Renovação automática - ${instance.instance_name}`,
              p_system_id: 'instance_renewal',
            });

            if (!deductError) {
              availableCredits -= INSTANCE_COST_CREDITS;

              // Extend subscription by 30 days
              const newExpiry = new Date();
              newExpiry.setDate(newExpiry.getDate() + 30);

              await supabase
                .from('instance_subscriptions')
                .update({ expires_at: newExpiry.toISOString() })
                .eq('id', sub.id);

              // Log success
              await supabase.from('instance_renewal_logs').insert({
                instance_id: sub.instance_id,
                user_id: userId,
                renewal_type: 'credits',
                credits_used: INSTANCE_COST_CREDITS,
                status: 'success',
              });

              console.log(`[INSTANCE-RENEWALS] Renewed ${instance.instance_name} for 30 days`);
              results.push({ 
                instanceId: sub.instance_id, 
                instanceName: instance.instance_name,
                status: 'renewed',
                newExpiry: newExpiry.toISOString(),
              });
              continue;
            }
          }

          // Check if in grace period (has saved card)
          if (paymentMethod && autoRenewalEnabled) {
            const expiredAt = new Date(sub.expires_at);
            const gracePeriodEnd = new Date(expiredAt.getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);
            
            if (new Date() < gracePeriodEnd) {
              console.log(`[INSTANCE-RENEWALS] Instance ${instance.instance_name} in grace period until ${gracePeriodEnd.toISOString()}`);
              results.push({ 
                instanceId: sub.instance_id, 
                instanceName: instance.instance_name,
                status: 'grace_period',
                gracePeriodEnd: gracePeriodEnd.toISOString(),
              });
              continue;
            }
          }

          // No credits, no successful card charge, grace period expired - delete instance
          console.log(`[INSTANCE-RENEWALS] Deleting expired instance: ${instance.instance_name}`);

          // Cascade delete related data
          await supabase.from('inbox_messages').delete().eq('instance_id', sub.instance_id);
          await supabase.from('inbox_flow_sessions').delete().eq('instance_id', sub.instance_id);
          await supabase.from('inbox_contacts').delete().eq('instance_id', sub.instance_id);
          await supabase.from('maturador_conversations').delete().eq('instance_id', sub.instance_id);
          await supabase.from('instance_subscriptions').delete().eq('id', sub.id);

          // Delete from UazAPI
          try {
            const { data: apiConfig } = await supabase
              .from('whatsapp_api_config')
              .select('uazapi_base_url, uazapi_api_token')
              .single();
            
            const uazapiUrl = apiConfig?.uazapi_base_url?.replace(/\/$/, '');
            const uazapiToken = apiConfig?.uazapi_api_token;
            
            if (uazapiUrl && uazapiToken) {
              await fetch(`${uazapiUrl}/instance/delete/${instance.instance_name}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${uazapiToken}`,
                },
              });
            }
          } catch (uazError) {
            console.error(`[INSTANCE-RENEWALS] Error deleting from UazAPI:`, uazError);
          }

          // Delete the instance record
          await supabase.from('maturador_instances').delete().eq('id', sub.instance_id);

          // Log deletion
          await supabase.from('instance_renewal_logs').insert({
            instance_id: sub.instance_id,
            user_id: userId,
            renewal_type: 'failed',
            status: 'failed',
            error_message: 'Insufficient credits and card charge failed',
          });

          results.push({ 
            instanceId: sub.instance_id, 
            instanceName: instance.instance_name,
            status: 'deleted' 
          });

        } catch (err) {
          console.error(`[INSTANCE-RENEWALS] Error processing instance ${sub.instance_id}:`, err);
          results.push({ instanceId: sub.instance_id, status: 'error', error: String(err) });
        }
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
