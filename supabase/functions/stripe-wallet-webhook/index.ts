import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WALLET-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    
    let event: Stripe.Event;
    
    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        logStep("Webhook signature verification failed", { error: err });
        return new Response(JSON.stringify({ error: "Webhook signature verification failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Parse event without signature verification (for testing)
      event = JSON.parse(body);
      logStep("Webhook parsed without signature verification");
    }

    logStep("Event type", { type: event.type });

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      logStep("Processing checkout.session.completed", {
        sessionId: session.id,
        metadata: session.metadata,
        paymentStatus: session.payment_status,
      });

      // Only process if payment was successful
      if (session.payment_status !== "paid") {
        logStep("Payment not completed yet", { status: session.payment_status });
        return new Response(JSON.stringify({ received: true, processed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = session.metadata?.user_id;
      const amount = parseFloat(session.metadata?.amount || "0");
      const type = session.metadata?.type;

      if (!userId || !amount || type !== "wallet_recharge") {
        logStep("Invalid metadata", { userId, amount, type });
        return new Response(JSON.stringify({ received: true, processed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logStep("Crediting wallet", { userId, amount });

      // Credit the user's wallet
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Check if this payment was already processed (idempotency)
      const { data: existingTx } = await supabase
        .from("sms_transactions")
        .select("id")
        .eq("external_id", session.id)
        .maybeSingle();

      if (existingTx) {
        logStep("Payment already processed", { transactionId: existingTx.id });
        return new Response(JSON.stringify({ received: true, already_processed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update wallet balance
      const { data: wallet, error: walletError } = await supabase
        .from("sms_user_wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (walletError) {
        logStep("Error fetching wallet", { error: walletError });
        throw new Error("Failed to fetch wallet");
      }

      const currentBalance = wallet?.balance || 0;
      const newBalance = currentBalance + amount;

      // Upsert wallet
      const { error: upsertError } = await supabase
        .from("sms_user_wallets")
        .upsert({
          user_id: userId,
          balance: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertError) {
        logStep("Error updating wallet", { error: upsertError });
        throw new Error("Failed to update wallet");
      }

      // Record transaction
      const { error: txError } = await supabase
        .from("sms_transactions")
        .insert({
          user_id: userId,
          type: "deposit",
          amount: amount,
          description: `Depósito via Cartão (Stripe) - R$ ${amount.toFixed(2)}`,
          status: "completed",
          external_id: session.id,
        });

      if (txError) {
        logStep("Error recording transaction", { error: txError });
        // Don't throw - wallet was already updated
      }

      logStep("Wallet credited successfully", { userId, amount, newBalance });
    }

    // Handle payment_intent.succeeded as backup
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      logStep("Payment intent succeeded", {
        paymentIntentId: paymentIntent.id,
        metadata: paymentIntent.metadata,
      });

      // The checkout.session.completed should handle this, but this is a backup
      const userId = paymentIntent.metadata?.user_id;
      const amount = parseFloat(paymentIntent.metadata?.amount || "0");
      const type = paymentIntent.metadata?.type;

      if (userId && amount && type === "wallet_recharge") {
        // Credit the user's wallet using service role
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Check if already processed via checkout.session.completed
        const { data: existingTx } = await supabase
          .from("sms_transactions")
          .select("id")
          .or(`external_id.eq.${paymentIntent.id},external_id.ilike.%${paymentIntent.id.substring(0, 20)}%`)
          .maybeSingle();

        if (!existingTx) {
          logStep("Processing payment_intent as backup", { userId, amount });
          
          // Update wallet
          const { data: wallet } = await supabase
            .from("sms_user_wallets")
            .select("balance")
            .eq("user_id", userId)
            .maybeSingle();

          const newBalance = (wallet?.balance || 0) + amount;

          await supabase
            .from("sms_user_wallets")
            .upsert({
              user_id: userId,
              balance: newBalance,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });

          await supabase
            .from("sms_transactions")
            .insert({
              user_id: userId,
              type: "deposit",
              amount: amount,
              description: `Depósito via Cartão (Stripe) - R$ ${amount.toFixed(2)}`,
              status: "completed",
              external_id: paymentIntent.id,
            });

          logStep("Wallet credited via payment_intent backup", { userId, amount, newBalance });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
