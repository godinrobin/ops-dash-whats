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

    // 2. Probe admin endpoints with various combinations
    const prefixes = ["", "/api", "/v2", "/api/v2"];
    const paths = [
      "/admin/listInstances",
      "/admin/instances",
      "/admin/instance/list",
      "/listInstances",
      "/instances",
    ];
    const methods = ["GET", "POST"];
    const headerKeys = ["admintoken", "AdminToken", "admin_token", "x-admin-token"];

    let found = false;

    for (const prefix of prefixes) {
      if (found) break;
      for (const path of paths) {
        if (found) break;
        for (const method of methods) {
          if (found) break;
          for (const headerKey of headerKeys) {
            if (found) break;

            const fullUrl = `${baseUrl}${prefix}${path}`;
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              [headerKey]: adminToken,
            };

            console.log(`[uazapi-probe] Trying ${method} ${fullUrl} with header ${headerKey}`);

            try {
              const resp = await fetch(fullUrl, {
                method,
                headers,
                body: method === "POST" ? JSON.stringify({}) : undefined,
              });

              const result: ProbeResult = {
                path: `${prefix}${path}`,
                method,
                status: resp.status,
                statusText: resp.statusText,
                isSuccess: resp.ok,
              };

              // Only add interesting results (not 404)
              if (resp.status !== 404 && resp.status !== 405) {
                try {
                  const bodyText = await resp.text();
                  result.bodyPreview = bodyText.substring(0, 200);
                } catch {}
                response.probeResults.push(result);
              }

              if (resp.ok) {
                found = true;
                response.adminEndpointFound = true;
                response.detectedConfig = {
                  prefix,
                  listInstancesPath: path,
                  listInstancesMethod: method,
                  headerKey,
                };
                console.log(`[uazapi-probe] SUCCESS: ${method} ${prefix}${path} with ${headerKey}`);
              }
            } catch (e) {
              console.error(`[uazapi-probe] Error probing ${fullUrl}:`, e);
            }
          }
        }
      }
    }

    // Also try specific UazAPI v2 endpoints from docs
    if (!found) {
      const docEndpoints = [
        { path: "/instance/list", method: "GET", headerKey: "admintoken" },
        { path: "/instance", method: "GET", headerKey: "admintoken" },
        { path: "/admin/instance", method: "GET", headerKey: "admintoken" },
      ];

      for (const ep of docEndpoints) {
        const fullUrl = `${baseUrl}${ep.path}`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          [ep.headerKey]: adminToken,
        };

        console.log(`[uazapi-probe] Trying doc endpoint: ${ep.method} ${fullUrl}`);

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
              result.bodyPreview = bodyText.substring(0, 200);
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
            console.log(`[uazapi-probe] SUCCESS: ${ep.method} ${ep.path}`);
            break;
          }
        } catch (e) {
          console.error(`[uazapi-probe] Error:`, e);
        }
      }
    }

    if (!found) {
      response.recommendation = 
        "Servidor online, mas endpoint admin não encontrado. " +
        "Verifique se o admintoken está correto. " +
        "Endpoints testados: " + 
        response.probeResults.map(r => `${r.method} ${r.path} (${r.status})`).join(", ");
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
