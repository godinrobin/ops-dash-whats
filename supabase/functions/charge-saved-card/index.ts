import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    
    const user = userData.user;
    const { amount, paymentMethodId } = await req.json();

    if (!amount || amount <= 0) throw new Error("Invalid amount");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get payment method from database
    let method;
    if (paymentMethodId) {
      const { data } = await supabaseClient
        .from("user_payment_methods")
        .select("*")
        .eq("id", paymentMethodId)
        .eq("user_id", user.id)
        .single();
      method = data;
    } else {
      // Get primary payment method
      const { data } = await supabaseClient
        .from("user_payment_methods")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_primary", true)
        .single();
      method = data;
    }

    if (!method) throw new Error("No payment method found");

    // Charge the card
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "brl",
        customer: method.stripe_customer_id,
        payment_method: method.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Recarga de créditos - R$ ${amount.toFixed(2)}`,
      });
    } catch (stripeError: any) {
      // Handle cards that weren't set up for off-session payments
      if (stripeError.code === 'card_declined' || 
          stripeError.message?.includes('does not support') ||
          stripeError.code === 'payment_intent_authentication_failure') {
        // Delete the invalid payment method from database
        await supabaseClient
          .from("user_payment_methods")
          .delete()
          .eq("id", paymentMethodId || method.id)
          .eq("user_id", user.id);
        
        throw new Error("Este cartão precisa ser recadastrado. Por favor, adicione o cartão novamente.");
      }
      throw stripeError;
    }

    if (paymentIntent.status === "succeeded") {
      // Add to wallet balance (R$), not credits
      const { data: wallet } = await supabaseClient
        .from("sms_user_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentBalance = wallet?.balance || 0;
      const newBalance = currentBalance + amount;

      // Upsert wallet
      await supabaseClient
        .from("sms_user_wallets")
        .upsert({
          user_id: user.id,
          balance: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      // Record transaction
      await supabaseClient
        .from("sms_transactions")
        .insert({
          user_id: user.id,
          type: "deposit",
          amount: amount,
          description: `Recarga via cartão ****${method.card_last4} - R$ ${amount.toFixed(2)}`,
          status: "completed",
          external_id: paymentIntent.id,
        });

      return new Response(JSON.stringify({ 
        success: true, 
        amountAdded: amount,
        newBalance: newBalance,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      throw new Error("Payment requires additional action or failed");
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
