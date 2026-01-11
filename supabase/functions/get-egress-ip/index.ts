// Lovable Cloud Function: get-egress-ip
// Returns the backend egress IP + rough location (useful when instance has no proxy)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startedAt = Date.now();

    const res = await fetch('https://ipwho.is/');
    const json = await res.json();

    if (!json?.success) {
      const message = json?.message || 'Falha ao obter IP externo';
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const ip = json?.ip as string | undefined;
    const city = json?.city as string | undefined;
    const region = json?.region as string | undefined;
    const country = json?.country as string | undefined;
    const isp = json?.connection?.isp as string | undefined;

    const location = [city, region, country].filter(Boolean).join(', ');

    return new Response(
      JSON.stringify({
        success: true,
        ip,
        city,
        region,
        country,
        isp,
        location,
        latency_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[get-egress-ip] Error:', e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Erro inesperado' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
