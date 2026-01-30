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
    const { action, paymentMethodId, setAsPrimary } = await req.json();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get or create Stripe customer
    let stripeCustomerId: string;
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    
    if (customers.data.length > 0) {
      stripeCustomerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;
    }

    if (action === "list") {
      // List user's saved payment methods from database
      const { data: methods, error } = await supabaseClient
        .from("user_payment_methods")
        .select("*")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ methods }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-setup-intent") {
      // Create a SetupIntent for saving a card
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
      });

      return new Response(JSON.stringify({ 
        clientSecret: setupIntent.client_secret,
        customerId: stripeCustomerId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save-payment-method") {
      // Attach payment method and save to database
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      
      if (!paymentMethod.card) throw new Error("Invalid payment method");

      // Check if this is the first card
      const { data: existingMethods } = await supabaseClient
        .from("user_payment_methods")
        .select("id")
        .eq("user_id", user.id);

      const isFirst = !existingMethods || existingMethods.length === 0;

      // Save to database
      const { error } = await supabaseClient
        .from("user_payment_methods")
        .insert({
          user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          stripe_payment_method_id: paymentMethodId,
          card_brand: paymentMethod.card.brand,
          card_last4: paymentMethod.card.last4,
          card_exp_month: paymentMethod.card.exp_month,
          card_exp_year: paymentMethod.card.exp_year,
          is_primary: isFirst || setAsPrimary === true,
        });

      if (error) throw error;

      // If setting as primary, unset others
      if (isFirst || setAsPrimary) {
        await supabaseClient
          .from("user_payment_methods")
          .update({ is_primary: false })
          .eq("user_id", user.id)
          .neq("stripe_payment_method_id", paymentMethodId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set-primary") {
      // Set a payment method as primary
      await supabaseClient
        .from("user_payment_methods")
        .update({ is_primary: false })
        .eq("user_id", user.id);

      await supabaseClient
        .from("user_payment_methods")
        .update({ is_primary: true })
        .eq("id", paymentMethodId)
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Get the payment method to detach from Stripe
      const { data: method } = await supabaseClient
        .from("user_payment_methods")
        .select("stripe_payment_method_id, is_primary")
        .eq("id", paymentMethodId)
        .eq("user_id", user.id)
        .single();

      if (method) {
        // Detach from Stripe
        try {
          await stripe.paymentMethods.detach(method.stripe_payment_method_id);
        } catch (e) {
          console.log("Could not detach from Stripe:", e);
        }

        // Delete from database
        await supabaseClient
          .from("user_payment_methods")
          .delete()
          .eq("id", paymentMethodId)
          .eq("user_id", user.id);

        // If it was primary, set another as primary
        if (method.is_primary) {
          const { data: remaining } = await supabaseClient
            .from("user_payment_methods")
            .select("id")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1);

          if (remaining && remaining.length > 0) {
            await supabaseClient
              .from("user_payment_methods")
              .update({ is_primary: true })
              .eq("id", remaining[0].id);
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "charge") {
      // Charge a saved payment method
      const { amount, paymentMethodDbId, description } = await req.json();
      
      const { data: method } = await supabaseClient
        .from("user_payment_methods")
        .select("stripe_payment_method_id, stripe_customer_id")
        .eq("id", paymentMethodDbId)
        .eq("user_id", user.id)
        .single();

      if (!method) throw new Error("Payment method not found");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "brl",
        customer: method.stripe_customer_id,
        payment_method: method.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: description || "Recarga de créditos",
      });

      if (paymentIntent.status === "succeeded") {
        // Add credits to user wallet
        const { data: config } = await supabaseClient
          .from("credits_system_config")
          .select("value")
          .eq("key", "credit_price_brl")
          .single();

        const creditPrice = config?.value ? parseFloat(config.value) : 6.5;
        const creditsToAdd = amount / creditPrice;

        await supabaseClient.rpc("add_credits", {
          p_user_id: user.id,
          p_amount: creditsToAdd,
          p_description: description || `Recarga via cartão salvo - R$ ${amount.toFixed(2)}`,
        });

        return new Response(JSON.stringify({ 
          success: true, 
          creditsAdded: creditsToAdd,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        throw new Error("Payment failed");
      }
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
