import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-CARD-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    // Use service role to update wallet after payment
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { amount, confirmPayment, paymentIntentId } = await req.json();
    logStep("Request body", { amount, confirmPayment, paymentIntentId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // If this is a confirmation request (payment succeeded on frontend)
    if (confirmPayment && paymentIntentId) {
      logStep("Processing payment confirmation", { paymentIntentId });
      
      // Verify the payment intent actually succeeded
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        throw new Error("Pagamento não foi confirmado pelo Stripe");
      }

      const paidAmount = parseFloat(paymentIntent.metadata?.amount || "0");
      const userId = paymentIntent.metadata?.user_id;

      if (!paidAmount || !userId || userId !== user.id) {
        throw new Error("Metadados do pagamento inválidos");
      }

      logStep("Payment verified", { paidAmount, userId });

      // Check if already processed (idempotency)
      const { data: existingTx } = await supabaseClient
        .from("sms_transactions")
        .select("id")
        .eq("external_id", paymentIntentId)
        .maybeSingle();

      if (existingTx) {
        logStep("Payment already processed", { transactionId: existingTx.id });
        return new Response(JSON.stringify({ 
          success: true, 
          already_processed: true,
          amount: paidAmount 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update wallet balance
      const { data: wallet } = await supabaseClient
        .from("sms_user_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentBalance = wallet?.balance || 0;
      const newBalance = currentBalance + paidAmount;

      // Upsert wallet
      const { error: upsertError } = await supabaseClient
        .from("sms_user_wallets")
        .upsert({
          user_id: user.id,
          balance: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertError) {
        logStep("Error updating wallet", { error: upsertError });
        throw new Error("Failed to update wallet");
      }

      // Record transaction
      await supabaseClient
        .from("sms_transactions")
        .insert({
          user_id: user.id,
          type: "deposit",
          amount: paidAmount,
          description: `Depósito via Cartão - R$ ${paidAmount.toFixed(2)}`,
          status: "completed",
          external_id: paymentIntentId,
        });

      logStep("Wallet credited successfully", { userId: user.id, amount: paidAmount, newBalance });

      return new Response(JSON.stringify({ 
        success: true, 
        amount: paidAmount,
        newBalance 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Original flow: Create PaymentIntent
    if (!amount || typeof amount !== 'number' || amount < 5 || amount > 5000) {
      throw new Error("Valor inválido. Mínimo R$ 5,00 e máximo R$ 5.000,00");
    }

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    } else {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = newCustomer.id;
      logStep("Created new customer", { customerId });
    }

    // Convert to centavos (BRL minor units)
    const amountInCentavos = Math.round(amount * 100);

    // Create PaymentIntent for card only with setup_future_usage for automatic card saving
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCentavos,
      currency: 'brl',
      customer: customerId,
      payment_method_types: ['card'],
      setup_future_usage: 'off_session',
      metadata: {
        user_id: user.id,
        amount: amount.toString(),
        type: 'wallet_recharge',
      },
    });

    logStep("PaymentIntent created", { 
      paymentIntentId: paymentIntent.id,
      amount: amountInCentavos,
    });

    return new Response(JSON.stringify({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
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
