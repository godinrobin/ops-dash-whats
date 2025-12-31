import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProbeResult {
  path: string;
  method: string;
  status: number;
  statusText: string;
  isSuccess: boolean;
  bodyPreview?: string;
}

interface ProbeResponse {
  serverOnline: boolean;
  statusEndpoint?: { status: number; body?: any };
  adminEndpointFound: boolean;
  detectedConfig?: {
    prefix: string;
    listInstancesPath: string;
    listInstancesMethod: string;
    headerKey: string;
  };
  probeResults: ProbeResult[];
  recommendation?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get request body or fetch from config
    const body = await req.json().catch(() => ({}));
    let baseUrl = body.baseUrl;
    let adminToken = body.adminToken;

    if (!baseUrl || !adminToken) {
      // Fetch from config
      const { data: config } = await supabase
        .from("whatsapp_api_config")
        .select("*")
        .single();

      if (config?.active_provider === "uazapi") {
        baseUrl = baseUrl || config.uazapi_base_url;
        adminToken = adminToken || config.uazapi_api_token;
      }
    }

    if (!baseUrl || !adminToken) {
      return new Response(JSON.stringify({ 
        error: "Missing baseUrl or adminToken",
        recommendation: "Configure UazAPI no painel Admin > Instâncias > Configurar API" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize baseUrl
    baseUrl = baseUrl.replace(/\/$/, "");

    const response: ProbeResponse = {
      serverOnline: false,
      adminEndpointFound: false,
      probeResults: [],
    };

    // 1. Check server health via /status
    console.log(`[uazapi-probe] Checking /status at ${baseUrl}`);
    try {
      const statusResp = await fetch(`${baseUrl}/status`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      response.serverOnline = statusResp.ok || statusResp.status < 500;
      response.statusEndpoint = {
        status: statusResp.status,
        body: statusResp.ok ? await statusResp.json().catch(() => null) : null,
      };
      console.log(`[uazapi-probe] /status returned ${statusResp.status}`);
    } catch (e) {
      console.error(`[uazapi-probe] /status error:`, e);
      response.serverOnline = false;
      response.recommendation = "Servidor não está respondendo. Verifique a URL base.";
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.serverOnline) {
      response.recommendation = "Servidor retornou erro. Verifique se a URL está correta.";
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. UazAPI v2 uses GET /instance/all with header "admintoken" (per OpenAPI spec)
    // This is the ONLY endpoint according to the official documentation
    console.log(`[uazapi-probe] Testing documented endpoint: GET /instance/all with header admintoken`);

    let found = false;

    // Primary test: documented endpoint
    const primaryEndpoint = {
      path: "/instance/all",
      method: "GET",
      headerKey: "admintoken",
    };

    try {
      const fullUrl = `${baseUrl}${primaryEndpoint.path}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        [primaryEndpoint.headerKey]: adminToken,
      };

      console.log(`[uazapi-probe] Trying: ${primaryEndpoint.method} ${fullUrl}`);

      const resp = await fetch(fullUrl, {
        method: primaryEndpoint.method,
        headers,
      });

      const result: ProbeResult = {
        path: primaryEndpoint.path,
        method: primaryEndpoint.method,
        status: resp.status,
        statusText: resp.statusText,
        isSuccess: resp.ok,
      };

      try {
        const bodyText = await resp.text();
        result.bodyPreview = bodyText.substring(0, 500);
      } catch {}

      response.probeResults.push(result);

      if (resp.ok) {
        found = true;
        response.adminEndpointFound = true;
        response.detectedConfig = {
          prefix: "",
          listInstancesPath: primaryEndpoint.path,
          listInstancesMethod: primaryEndpoint.method,
          headerKey: primaryEndpoint.headerKey,
        };
        console.log(`[uazapi-probe] SUCCESS: ${primaryEndpoint.method} ${primaryEndpoint.path}`);
      } else {
        console.log(`[uazapi-probe] /instance/all returned ${resp.status}: ${result.bodyPreview}`);
      }
    } catch (e) {
      console.error(`[uazapi-probe] Error testing primary endpoint:`, e);
    }

    // If primary failed, try a few fallback variations
    if (!found) {
      console.log(`[uazapi-probe] Primary endpoint failed, trying fallback variations...`);

      const fallbacks = [
        // Alternative header casing
        { path: "/instance/all", method: "GET", headerKey: "AdminToken" },
        // Some servers use admin/ prefix
        { path: "/admin/listInstances", method: "GET", headerKey: "admintoken" },
        // Evolution-style endpoint
        { path: "/instance/fetchInstances", method: "GET", headerKey: "admintoken" },
      ];

      for (const ep of fallbacks) {
        if (found) break;

        const fullUrl = `${baseUrl}${ep.path}`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          [ep.headerKey]: adminToken,
        };

        console.log(`[uazapi-probe] Fallback: ${ep.method} ${fullUrl}`);

        try {
          const resp = await fetch(fullUrl, {
            method: ep.method,
            headers,
          });

          const result: ProbeResult = {
            path: ep.path,
            method: ep.method,
            status: resp.status,
            statusText: resp.statusText,
            isSuccess: resp.ok,
          };

          if (resp.status !== 404 && resp.status !== 405) {
            try {
              const bodyText = await resp.text();
              result.bodyPreview = bodyText.substring(0, 300);
            } catch {}
            response.probeResults.push(result);
          }

          if (resp.ok) {
            found = true;
            response.adminEndpointFound = true;
            response.detectedConfig = {
              prefix: "",
              listInstancesPath: ep.path,
              listInstancesMethod: ep.method,
              headerKey: ep.headerKey,
            };
            console.log(`[uazapi-probe] Fallback SUCCESS: ${ep.method} ${ep.path}`);
          }
        } catch (e) {
          // Silent error for fallbacks
        }
      }
    }

    if (!found) {
      // Analyze the error from primary endpoint
      const primaryResult = response.probeResults.find(r => r.path === "/instance/all");
      
      if (primaryResult?.status === 401 || primaryResult?.status === 403) {
        response.recommendation = 
          "Servidor respondeu 401/403 - Admin Token inválido ou sem permissão. " +
          "Verifique se o token está correto e se você tem acesso admin ao servidor.";
      } else if (primaryResult?.status === 404) {
        response.recommendation = 
          "Endpoint /instance/all não encontrado (404). " +
          "Seu servidor pode usar uma versão diferente da API UazAPI. " +
          "Verifique a documentação do seu servidor específico.";
      } else {
        response.recommendation = 
          `Endpoint admin não funcionou. Status: ${primaryResult?.status || 'N/A'}. ` +
          `Resposta: ${primaryResult?.bodyPreview?.substring(0, 100) || 'N/A'}`;
      }
    }

    // If found, save detected config to database
    if (response.detectedConfig) {
      const { error: updateError } = await supabase
        .from("whatsapp_api_config")
        .update({
          uazapi_api_prefix: response.detectedConfig.prefix,
          uazapi_admin_header: response.detectedConfig.headerKey,
          uazapi_list_instances_path: response.detectedConfig.listInstancesPath,
          uazapi_list_instances_method: response.detectedConfig.listInstancesMethod,
          updated_at: new Date().toISOString(),
        })
        .eq("active_provider", "uazapi");

      if (updateError) {
        console.error("[uazapi-probe] Failed to save config:", updateError);
      } else {
        console.log("[uazapi-probe] Config saved to database");
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[uazapi-probe] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
