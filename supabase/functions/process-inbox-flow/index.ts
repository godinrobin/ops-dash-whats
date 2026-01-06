import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore - pdf-lib for PDF text extraction
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default Evolution API config - will be overridden by user/admin config
const DEFAULT_EVOLUTION_BASE_URL = 'https://api.chatwp.xyz';

// Maximum delay we can handle in a single edge function call (20 seconds to be safe)
const MAX_INLINE_DELAY_MS = 20000;
// Lock timeout in milliseconds (60 seconds - if a lock is older than this, consider it stale)
const LOCK_TIMEOUT_MS = 60000;

// Generate a unique run ID for this execution (for debugging/tracing)
const generateRunId = () => crypto.randomUUID().substring(0, 8);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = generateRunId();
  console.log(`[${runId}] === PROCESS-INBOX-FLOW START ===`);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sessionId, userInput, resumeFromDelay, resumeFromTimeout } = await req.json();
    console.log(`[${runId}] SessionId: ${sessionId}, Input: ${userInput}, ResumeFromDelay: ${resumeFromDelay}, ResumeFromTimeout: ${resumeFromTimeout}`);

    // Get session with flow data
    const { data: session, error: sessionError } = await supabaseClient
      .from('inbox_flow_sessions')
      .select(`
        *,
        flow:inbox_flows(*),
        contact:inbox_contacts(*)
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error(`[${runId}] Session not found:`, sessionError);
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if session is already completed - do not process
    if (session.status === 'completed') {
      console.log(`[${runId}] Session already completed, skipping`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'session_completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === LOCK ACQUISITION ===
    // Check if session is being processed by another instance
    if (session.processing) {
      const lockAge = session.processing_started_at 
        ? Date.now() - new Date(session.processing_started_at).getTime() 
        : 0;
      
      if (lockAge < LOCK_TIMEOUT_MS) {
        console.log(`[${runId}] Session ${sessionId} is locked by another process (lock age: ${lockAge}ms), skipping`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: 'session_locked',
          lockAge 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`[${runId}] Session ${sessionId} has stale lock (${lockAge}ms), taking over`);
    }

    // === GET USER-SPECIFIC API CONFIGURATION ===
    let evolutionBaseUrl = DEFAULT_EVOLUTION_BASE_URL;
    let evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
    let configSource = 'global';

    // Strategy 1: User's own maturador_config
    const { data: userConfig } = await supabaseClient
      .from('maturador_config')
      .select('evolution_base_url, evolution_api_key')
      .eq('user_id', session.user_id)
      .maybeSingle();

    if (userConfig?.evolution_base_url && userConfig?.evolution_api_key) {
      evolutionBaseUrl = userConfig.evolution_base_url.replace(/\/$/, '');
      evolutionApiKey = userConfig.evolution_api_key;
      configSource = 'user_config';
      console.log(`[${runId}] Using user Evolution API config`);
    } else {
      // Strategy 2: Admin config from database (fallback)
      const { data: adminConfig } = await supabaseClient
        .from('maturador_config')
        .select('evolution_base_url, evolution_api_key')
        .limit(1)
        .maybeSingle();

      if (adminConfig?.evolution_base_url && adminConfig?.evolution_api_key) {
        evolutionBaseUrl = adminConfig.evolution_base_url.replace(/\/$/, '');
        evolutionApiKey = adminConfig.evolution_api_key;
        configSource = 'admin_config';
        console.log(`[${runId}] Using admin Evolution API config as fallback`);
      } else {
        // Strategy 3: Global secrets (final fallback)
        const globalBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
        if (globalBaseUrl) {
          evolutionBaseUrl = globalBaseUrl.replace(/\/$/, '');
        }
        console.log(`[${runId}] Using global Evolution API secrets`);
      }
    }

    if (!evolutionApiKey) {
      console.error(`[${runId}] No Evolution API key found! Config source: ${configSource}`);
      return new Response(JSON.stringify({ 
        error: 'Evolution API not configured',
        configSource 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${runId}] API Config: source=${configSource}, baseUrl=${evolutionBaseUrl}`);

    // Acquire lock - if we have userInput, also update variables immediately to prevent re-processing
    const lockUpdate: Record<string, unknown> = {
      processing: true,
      processing_started_at: new Date().toISOString(),
    };
    
    const flow = session.flow;
    let contact = session.contact;
    const nodes = flow.nodes as Array<{
      id: string;
      type: string;
      data: Record<string, unknown>;
    }>;
    const edges = flow.edges as Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
    }>;

    let currentNodeId = session.current_node_id || 'start-1';
    let variables = (session.variables || {}) as Record<string, unknown>;

    // Initialize sent nodes tracking for idempotency
    if (!variables._sent_node_ids) {
      variables._sent_node_ids = [] as string[];
    }
    const sentNodeIds = variables._sent_node_ids as string[];

    // === PAUSE SCHEDULE CHECK ===
    // Helper function to check if current time is within pause schedule (São Paulo timezone)
    const isWithinPauseSchedule = (): boolean => {
      if (!flow.pause_schedule_enabled) return false;
      
      const pauseStart = flow.pause_schedule_start; // "HH:MM" format
      const pauseEnd = flow.pause_schedule_end;     // "HH:MM" format
      
      if (!pauseStart || !pauseEnd) return false;
      
      // Get current time in São Paulo timezone (UTC-3)
      const now = new Date();
      const saoPauloOffset = -3 * 60; // -3 hours in minutes
      const localOffset = now.getTimezoneOffset();
      const saoPauloTime = new Date(now.getTime() + (localOffset + saoPauloOffset) * 60000);
      
      const currentHour = saoPauloTime.getHours();
      const currentMinute = saoPauloTime.getMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      
      const [startHour, startMin] = pauseStart.split(':').map(Number);
      const [endHour, endMin] = pauseEnd.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      // Case: pause crosses midnight (e.g., 22:00 to 06:00)
      if (startMinutes > endMinutes) {
        return currentTimeMinutes >= startMinutes || currentTimeMinutes < endMinutes;
      }
      
      // Normal case: pause within same day (e.g., 00:00 to 06:00)
      return currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes;
    };

    // Helper function to calculate when pause ends (returns timestamp)
    const calculatePauseEndTime = (): number => {
      const pauseEnd = flow.pause_schedule_end; // "HH:MM" format
      if (!pauseEnd) return Date.now();
      
      const [endHour, endMin] = pauseEnd.split(':').map(Number);
      
      // Get current time in São Paulo timezone
      const now = new Date();
      const saoPauloOffset = -3 * 60;
      const localOffset = now.getTimezoneOffset();
      const saoPauloTime = new Date(now.getTime() + (localOffset + saoPauloOffset) * 60000);
      
      // Create a date for today at pause end time (in São Paulo timezone)
      const pauseEndToday = new Date(saoPauloTime);
      pauseEndToday.setHours(endHour, endMin, 0, 0);
      
      // Convert back to UTC
      const pauseEndUTC = new Date(pauseEndToday.getTime() - (localOffset + saoPauloOffset) * 60000);
      
      // If pause end is before current time, it means pause ends tomorrow
      if (pauseEndUTC.getTime() <= now.getTime()) {
        pauseEndUTC.setDate(pauseEndUTC.getDate() + 1);
      }
      
      return pauseEndUTC.getTime();
    };

    // Check if we're resuming from a pause schedule
    const resumeFromPauseSchedule = variables._pause_scheduled === true;

    // === Generate dynamic system variables ===
    // Helper to generate personalized greeting based on São Paulo timezone (-03:00)
    const generateSaudacaoPersonalizada = (): string => {
      // Get current time in São Paulo timezone (UTC-3)
      const now = new Date();
      const saoPauloOffset = -3 * 60; // -3 hours in minutes
      const localOffset = now.getTimezoneOffset();
      const saoPauloTime = new Date(now.getTime() + (localOffset + saoPauloOffset) * 60000);
      const hour = saoPauloTime.getHours();

      // Determine time of day
      let periodGreeting: string;
      if (hour >= 5 && hour < 12) {
        periodGreeting = 'bom dia';
      } else if (hour >= 12 && hour < 18) {
        periodGreeting = 'boa tarde';
      } else {
        periodGreeting = 'boa noite';
      }

      // Randomize greeting prefix
      const greetingPrefixes = [
        'Oi',
        'Olá',
        'Oi, tudo bem',
        'Olá, tudo bem',
        'Oi, tudo certo',
        'E aí',
        'Eai',
        'Oii',
        'Oláa',
        'Hey',
      ];
      const randomPrefix = greetingPrefixes[Math.floor(Math.random() * greetingPrefixes.length)];

      // Combine with period greeting in a natural way
      const combinations = [
        `${randomPrefix}! ${periodGreeting.charAt(0).toUpperCase() + periodGreeting.slice(1)}!`,
        `${randomPrefix}, ${periodGreeting}!`,
        `${periodGreeting.charAt(0).toUpperCase() + periodGreeting.slice(1)}! ${randomPrefix}!`,
        `${randomPrefix}! ${periodGreeting.charAt(0).toUpperCase() + periodGreeting.slice(1)}, como você está?`,
        `${randomPrefix}! ${periodGreeting.charAt(0).toUpperCase() + periodGreeting.slice(1)}, tudo bem?`,
      ];

      return combinations[Math.floor(Math.random() * combinations.length)];
    };

    // Set system variable for personalized greeting
    variables['saudacao_personalizada'] = generateSaudacaoPersonalizada();
    console.log(`[${runId}] Generated saudacao_personalizada: ${variables['saudacao_personalizada']}`);

    // Helper function to track node analytics
    const trackNodeAnalytics = async (nodeId: string, nodeType: string) => {
      try {
        await supabaseClient.from('inbox_flow_analytics').insert({
          flow_id: flow.id,
          session_id: sessionId,
          node_id: nodeId,
          node_type: nodeType,
          user_id: session.user_id,
        });
      } catch (e) {
        console.error(`[${runId}] Error tracking node analytics:`, e);
      }
    };

    // If user provided input, store it and move to next node IMMEDIATELY (checkpoint)
    // EXCEPTION: For paymentIdentifier nodes, we DON'T skip to next node - we need to process the media first
    if (userInput !== undefined && userInput !== null) {
      const currentNode = nodes.find(n => n.id === currentNodeId);
      
      // Always update lastMessage and resposta when user sends a message
      const userInputStr = typeof userInput === 'string' ? userInput.trim() : String(userInput || '');
      variables.lastMessage = userInputStr;
      variables.resposta = userInputStr;
      variables.ultima_mensagem = userInputStr;
      console.log(`[${runId}] Updated system variables: lastMessage/resposta/ultima_mensagem = "${userInputStr.substring(0, 50)}"`);
      
      // Only do checkpoint skip for waitInput and menu nodes, NOT paymentIdentifier
      if (currentNode?.type !== 'paymentIdentifier') {
        if (currentNode?.type === 'waitInput' && currentNode.data.variableName) {
          const key = normalizeVarKey(currentNode.data.variableName as string);
          variables[key] = userInputStr;
          console.log(`[${runId}] Saved user input to variable "${key}": "${userInputStr.substring(0, 50)}"`);
        }

        // Find next node
        const nextEdge = edges.find(e => e.source === currentNodeId);
        if (nextEdge) {
          currentNodeId = nextEdge.target;
        }
        
        // IMPORTANT: Save checkpoint immediately with lock to prevent duplicate processing
        lockUpdate.current_node_id = currentNodeId;
        lockUpdate.variables = variables;
        lockUpdate.last_interaction = new Date().toISOString();
        
        console.log(`[${runId}] Checkpoint saved: moved from ${session.current_node_id} to ${currentNodeId} after receiving input`);
      } else {
        console.log(`[${runId}] paymentIdentifier node - will process media inline, no checkpoint skip`);
      }
    }

    // Acquire lock (with checkpoint if userInput was provided)
    const { error: lockError } = await supabaseClient
      .from('inbox_flow_sessions')
      .update(lockUpdate)
      .eq('id', sessionId);
    
    if (lockError) {
      console.error(`[${runId}] Failed to acquire lock:`, lockError);
      return new Response(JSON.stringify({ error: 'Failed to acquire lock' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[${runId}] Lock acquired for session ${sessionId}`);

    // Helper function to release lock
    const releaseLock = async () => {
      await supabaseClient
        .from('inbox_flow_sessions')
        .update({ processing: false, processing_started_at: null })
        .eq('id', sessionId);
      console.log(`[${runId}] Lock released for session ${sessionId}`);
    };

    // Helper function to stop flow on send failure
    const handleSendFailure = async (nodeId: string, errorDetails: string) => {
      console.error(`[${runId}] Send failed at node ${nodeId}: ${errorDetails}`);
      variables._last_send_error = errorDetails;
      variables._last_failed_node_id = nodeId;
      variables._last_failed_at = new Date().toISOString();
      
      await supabaseClient
        .from('inbox_flow_sessions')
        .update({
          current_node_id: nodeId,
          variables,
          last_interaction: new Date().toISOString(),
          processing: false,
          processing_started_at: null,
        })
        .eq('id', sessionId);
    };

    try {
      // Check if we're resuming from a scheduled delay
      if (resumeFromDelay) {
        const pendingDelay = variables._pendingDelay as { nodeId: string; resumeAt: number; delayMs?: number } | undefined;
        if (pendingDelay) {
          const now = Date.now();
          const remainingMs = pendingDelay.resumeAt - now;
          
          console.log(`[${runId}] Checking delay: resumeAt=${new Date(pendingDelay.resumeAt).toISOString()}, now=${new Date(now).toISOString()}, remaining=${remainingMs}ms`);
          
          if (remainingMs > 5000) { // 5 second buffer to avoid race conditions
            // Still waiting - reschedule the job (shouldn't happen if cron is correct, but safety)
            console.log(`[${runId}] Still waiting for delay, ${remainingMs}ms remaining - rescheduling`);
            
            // Update the job to run at correct time
            await supabaseClient
              .from('inbox_flow_delay_jobs')
              .update({
                run_at: new Date(pendingDelay.resumeAt).toISOString(),
                status: 'scheduled',
                updated_at: new Date().toISOString(),
              })
              .eq('session_id', sessionId);
            
            await releaseLock();
            return new Response(JSON.stringify({ 
              success: true, 
              waiting: true, 
              remainingMs,
              rescheduled: true
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          // Delay completed - move to next node
          console.log(`[${runId}] ✅ Delay completed! Moving from node ${pendingDelay.nodeId} to next node`);
          const delayEdge = edges.find(e => e.source === pendingDelay.nodeId);
          if (delayEdge) {
            currentNodeId = delayEdge.target;
            console.log(`[${runId}] Next node after delay: ${currentNodeId}`);
          } else {
            console.log(`[${runId}] No edge found from delay node ${pendingDelay.nodeId}, ending flow`);
          }
          
          // CRITICAL: Clear pending delay from variables
          delete variables._pendingDelay;
          
          // Immediately save the cleared state to prevent duplicate processing
          await supabaseClient
            .from('inbox_flow_sessions')
            .update({
              current_node_id: currentNodeId,
              variables,
              last_interaction: new Date().toISOString(),
            })
            .eq('id', sessionId);
          
          console.log(`[${runId}] Cleared _pendingDelay and updated session to node ${currentNodeId}`);
        } else {
          console.log(`[${runId}] resumeFromDelay=true but no _pendingDelay found in variables, continuing from current node`);
        }
      }

      // Get instance for sending messages - including api_provider and token
      const { data: instance } = await supabaseClient
        .from('maturador_instances')
        .select('instance_name, api_provider, uazapi_token, evolution_api_key, evolution_base_url')
        .eq('id', session.instance_id)
        .single();

      const instanceName = instance?.instance_name;
      const phone = contact.phone;
      const apiProvider = instance?.api_provider || 'evolution';
      const instanceUazapiToken = instance?.uazapi_token;

      // For UazAPI instances, get the base URL from whatsapp_api_config (singleton table)
      let uazapiBaseUrl = '';
      if (apiProvider === 'uazapi') {
        const { data: apiConfig } = await supabaseClient
          .from('whatsapp_api_config')
          .select('uazapi_base_url')
          .limit(1)
          .maybeSingle();
        
        uazapiBaseUrl = apiConfig?.uazapi_base_url?.replace(/\/$/, '') || '';
        console.log(`[${runId}] UazAPI instance detected. Base URL: ${uazapiBaseUrl}, Token: ${instanceUazapiToken ? 'present' : 'missing'}`);
      }

      if (!instanceName) {
        console.error(`[${runId}] Instance not found for session ${sessionId}`);
        await releaseLock();
        return new Response(JSON.stringify({ 
          error: 'Instance not found',
          instanceId: session.instance_id 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate UazAPI configuration
      if (apiProvider === 'uazapi' && (!uazapiBaseUrl || !instanceUazapiToken)) {
        console.error(`[${runId}] UazAPI configuration incomplete: baseUrl=${uazapiBaseUrl}, token=${instanceUazapiToken ? 'present' : 'missing'}`);
        await releaseLock();
        return new Response(JSON.stringify({ 
          error: 'UazAPI configuration incomplete',
          hasBaseUrl: !!uazapiBaseUrl,
          hasToken: !!instanceUazapiToken
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Determine the correct base URL and API key based on provider
      const effectiveBaseUrl = apiProvider === 'uazapi' ? uazapiBaseUrl : evolutionBaseUrl;
      const effectiveApiKey = apiProvider === 'uazapi' ? instanceUazapiToken : evolutionApiKey;

      console.log(`[${runId}] Using API provider: ${apiProvider}, baseUrl: ${effectiveBaseUrl}`);

      // Process nodes until we hit a wait point or end
      let continueProcessing = true;
      const processedActions: string[] = [];
      let sendFailed = false;

      // Helper function to find next valid node (skipping non-existent nodes)
      const nodeIdSet = new Set(nodes.map(n => n.id));

      const findNextValidNode = (fromNodeId: string, visited = new Set<string>()): string | null => {
        if (visited.has(fromNodeId)) return null;
        visited.add(fromNodeId);

        const outgoing = edges.filter(e => e.source === fromNodeId);
        if (outgoing.length === 0) return null;

        for (const edge of outgoing) {
          if (nodeIdSet.has(edge.target)) return edge.target;

          console.log(`[${runId}] WARNING: Node ${edge.target} referenced in edge but does not exist, trying to skip`);
          const deeper = findNextValidNode(edge.target, visited);
          if (deeper) return deeper;
        }

        return null;
      };

      // === CHECK PAUSE SCHEDULE BEFORE PROCESSING ===
      // Only check pause if we're about to send messages (not just starting or receiving input)
      const isSendingNode = (nodeType: string) => ['text', 'aiText', 'image', 'video', 'audio', 'document'].includes(nodeType);
      
      // Check if we're resuming from a scheduled pause
      if (resumeFromPauseSchedule) {
        console.log(`[${runId}] Resuming from scheduled pause`);
        delete variables._pause_scheduled;
        delete variables._pause_resume_at;
      }

      while (continueProcessing && !sendFailed) {
        const currentNode = nodes.find(n => n.id === currentNodeId);
        
        if (!currentNode) {
          // Node not found - try to recover by finding next valid node
          console.log(`[${runId}] Node ${currentNodeId} not found, attempting recovery`);

          // Try to jump to a reachable valid node from the missing one
          const recoveredNextId = findNextValidNode(currentNodeId);
          if (recoveredNextId) {
            currentNodeId = recoveredNextId;
            console.log(`[${runId}] Recovered by skipping missing nodes: moving to ${currentNodeId}`);
            continue;
          }

          // Special case: if we are at start, pick any valid start target
          if (currentNodeId === 'start-1') {
            const validNextId = findNextValidNode('start-1');
            if (validNextId) {
              currentNodeId = validNextId;
              console.log(`[${runId}] Recovered from start by skipping missing nodes: moving to ${currentNodeId}`);
              continue;
            }
          }
          
          // Could not recover - mark session as failed
          console.error(`[${runId}] FATAL: Could not find node ${currentNodeId} and recovery failed`);
          variables._recovery_error = `Node ${currentNodeId} not found in flow`;
          variables._recovery_failed_at = new Date().toISOString();
          
          await supabaseClient
            .from('inbox_flow_sessions')
            .update({
              status: 'completed',
              variables,
              processing: false,
              processing_started_at: null,
            })
            .eq('id', sessionId);
          
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Node not found',
            nodeId: currentNodeId,
            recovered: false
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log(`[${runId}] Processing node: ${currentNode.type} (${currentNodeId})`);

        // Track analytics for this node (fire and forget)
        trackNodeAnalytics(currentNodeId, currentNode.type);

        switch (currentNode.type) {
          case 'start': {
            // Pick the first reachable valid node (handles multiple start edges + orphaned edges)
            const nextId = findNextValidNode(currentNodeId);
            if (nextId) {
              currentNodeId = nextId;
            } else {
              console.log(`[${runId}] No valid next node found after start`);
              continueProcessing = false;
            }
            break;
          }

          case 'text':
            // === PAUSE SCHEDULE CHECK FOR SENDING NODES ===
            if (isWithinPauseSchedule() && !resumeFromPauseSchedule) {
              console.log(`[${runId}] ⏸️ Flow is within pause schedule, scheduling resume for later`);
              
              const pauseResumeAt = calculatePauseEndTime();
              variables._pause_scheduled = true;
              variables._pause_resume_at = pauseResumeAt;
              variables._pause_node_id = currentNodeId;
              
              // Save session state
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);
              
              // Create delay job to resume after pause ends
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .upsert({
                  session_id: sessionId,
                  user_id: session.user_id,
                  run_at: new Date(pauseResumeAt).toISOString(),
                  status: 'scheduled',
                  attempts: 0,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'session_id' });
              
              console.log(`[${runId}] ⏸️ Pause scheduled until ${new Date(pauseResumeAt).toISOString()}`);
              
              return new Response(JSON.stringify({ 
                success: true, 
                paused: true,
                pauseResumeAt: new Date(pauseResumeAt).toISOString(),
                reason: 'pause_schedule_active'
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Check if already sent (idempotency)
            if (sentNodeIds.includes(currentNodeId)) {
              console.log(`[${runId}] Node ${currentNodeId} already sent, skipping`);
              const textEdge = edges.find(e => e.source === currentNodeId);
              if (textEdge) {
                currentNodeId = textEdge.target;
              } else {
                continueProcessing = false;
              }
              break;
            }

            // Send text message
            const message = replaceVariables(currentNode.data.message as string || '', variables);
            if (instanceName && phone && message) {
              // Calculate delay for presence/typing indicator
              let textDelayMs = 0;
              if (currentNode.data.showPresence) {
                const presenceDelaySeconds = (currentNode.data.presenceDelay as number) || 3;
                textDelayMs = presenceDelaySeconds * 1000;
                console.log(`[${runId}] 📝 TEXT NODE - showPresence=true, presenceDelay=${presenceDelaySeconds}s, delayMs=${textDelayMs}`);
                
                // For Evolution API, send presence separately then wait
                if (apiProvider !== 'uazapi') {
                  await sendPresence(effectiveBaseUrl, effectiveApiKey, instanceName, phone, 'composing', textDelayMs);
                  processedActions.push(`Showed typing for ${presenceDelaySeconds}s`);
                } else {
                  console.log(`[${runId}] 🚀 UazAPI: Will send delay=${textDelayMs}ms in request body to show "Digitando..."`);
                  processedActions.push(`UazAPI typing delay: ${presenceDelaySeconds}s`);
                }
              } else {
                console.log(`[${runId}] 📝 TEXT NODE - showPresence=false, no delay`);
              }
              
              // For UazAPI, pass delay parameter; for Evolution, delay was already handled
              const uazapiDelay = apiProvider === 'uazapi' ? textDelayMs : 0;
              console.log(`[${runId}] Calling sendMessage with apiProvider=${apiProvider}, uazapiDelay=${uazapiDelay}ms`);
              const sendResult = await sendMessage(effectiveBaseUrl, effectiveApiKey, instanceName, phone, message, 'text', undefined, undefined, apiProvider, instanceUazapiToken, uazapiDelay);
              
              // Save message with correct status based on send result
              const messageStatus = sendResult.ok ? 'sent' : 'failed';
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, message, 'text', flow.id, undefined, sendResult.remoteMessageId, messageStatus);
              
              if (!sendResult.ok) {
                await handleSendFailure(currentNodeId, sendResult.errorDetails || 'Unknown error');
                sendFailed = true;
                processedActions.push(`FAILED to send text: ${message.substring(0, 50)}`);
                break;
              }
              
              // Mark node as sent for idempotency
              sentNodeIds.push(currentNodeId);
              processedActions.push(`Sent text: ${message.substring(0, 50)}`);
            }
            
            const textEdge = edges.find(e => e.source === currentNodeId);
            if (textEdge) {
              currentNodeId = textEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'aiText':
            // === PAUSE SCHEDULE CHECK FOR SENDING NODES ===
            if (isWithinPauseSchedule() && !resumeFromPauseSchedule) {
              console.log(`[${runId}] ⏸️ Flow is within pause schedule (aiText), scheduling resume for later`);
              
              const pauseResumeAtAi = calculatePauseEndTime();
              variables._pause_scheduled = true;
              variables._pause_resume_at = pauseResumeAtAi;
              variables._pause_node_id = currentNodeId;
              
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);
              
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .upsert({
                  session_id: sessionId,
                  user_id: session.user_id,
                  run_at: new Date(pauseResumeAtAi).toISOString(),
                  status: 'scheduled',
                  attempts: 0,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'session_id' });
              
              return new Response(JSON.stringify({ 
                success: true, 
                paused: true,
                pauseResumeAt: new Date(pauseResumeAtAi).toISOString(),
                reason: 'pause_schedule_active'
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // AI Text - generate variation using Lovable AI before sending
            // Check if already sent (idempotency)
            if (sentNodeIds.includes(currentNodeId)) {
              console.log(`[${runId}] AI Text node ${currentNodeId} already sent, skipping`);
              const aiTextEdge = edges.find(e => e.source === currentNodeId);
              if (aiTextEdge) {
                currentNodeId = aiTextEdge.target;
              } else {
                continueProcessing = false;
              }
              break;
            }

            // Get base message and replace variables
            const baseMessage = replaceVariables(currentNode.data.message as string || '', variables);
            
            if (!baseMessage.trim()) {
              console.log(`[${runId}] AI Text node has no message, skipping`);
              const emptyEdge = edges.find(e => e.source === currentNodeId);
              if (emptyEdge) {
                currentNodeId = emptyEdge.target;
              } else {
                continueProcessing = false;
              }
              break;
            }

            // Generate AI variation
            let aiVariedMessage = baseMessage;
            try {
              const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
              if (LOVABLE_API_KEY) {
                console.log(`[${runId}] 🤖 Generating AI text variation for: "${baseMessage.substring(0, 50)}..."`);
                
                const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [
                      {
                        role: 'system',
                        content: `Você é um assistente que cria variações sutis de mensagens de WhatsApp. 
Regras RIGOROSAS:
1. MANTENHA o sentido e a intenção EXATAMENTE iguais
2. Troque APENAS algumas palavras por sinônimos naturais
3. Se houver emojis, você pode trocar por emojis similares ou manter
4. NÃO adicione informações novas
5. NÃO mude o tom da mensagem
6. MANTENHA a mesma quantidade aproximada de texto
7. A variação deve ser SUTIL, quase imperceptível
8. Responda APENAS com o texto variado, sem explicações`
                      },
                      {
                        role: 'user',
                        content: `Crie uma variação sutil desta mensagem, mantendo o mesmo sentido:\n\n${baseMessage}`
                      }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7,
                  }),
                });

                if (aiResponse.ok) {
                  const aiData = await aiResponse.json();
                  const generatedText = aiData.choices?.[0]?.message?.content?.trim();
                  if (generatedText) {
                    aiVariedMessage = generatedText;
                    console.log(`[${runId}] ✅ AI generated variation: "${aiVariedMessage.substring(0, 50)}..."`);
                  }
                } else {
                  console.error(`[${runId}] AI API error: ${aiResponse.status}`);
                }
              } else {
                console.log(`[${runId}] LOVABLE_API_KEY not configured, using original message`);
              }
            } catch (aiError) {
              console.error(`[${runId}] AI generation error:`, aiError);
              // Continue with original message if AI fails
            }

            if (instanceName && phone && aiVariedMessage) {
              // Calculate delay for presence/typing indicator
              let aiTextDelayMs = 0;
              if (currentNode.data.showPresence) {
                const presenceDelaySeconds = (currentNode.data.presenceDelay as number) || 3;
                aiTextDelayMs = presenceDelaySeconds * 1000;
                console.log(`[${runId}] 📝 AI TEXT NODE - showPresence=true, presenceDelay=${presenceDelaySeconds}s, delayMs=${aiTextDelayMs}`);
                
                // For Evolution API, send presence separately then wait
                if (apiProvider !== 'uazapi') {
                  await sendPresence(effectiveBaseUrl, effectiveApiKey, instanceName, phone, 'composing', aiTextDelayMs);
                  processedActions.push(`Showed typing for ${presenceDelaySeconds}s`);
                } else {
                  console.log(`[${runId}] 🚀 UazAPI: Will send delay=${aiTextDelayMs}ms in request body to show "Digitando..."`);
                  processedActions.push(`UazAPI typing delay: ${presenceDelaySeconds}s`);
                }
              } else {
                console.log(`[${runId}] 📝 AI TEXT NODE - showPresence=false, no delay`);
              }
              
              // For UazAPI, pass delay parameter; for Evolution, delay was already handled
              const uazapiAiDelay = apiProvider === 'uazapi' ? aiTextDelayMs : 0;
              console.log(`[${runId}] Calling sendMessage with apiProvider=${apiProvider}, uazapiAiDelay=${uazapiAiDelay}ms`);
              const aiSendResult = await sendMessage(effectiveBaseUrl, effectiveApiKey, instanceName, phone, aiVariedMessage, 'text', undefined, undefined, apiProvider, instanceUazapiToken, uazapiAiDelay);
              
              // Save message with correct status based on send result
              const aiMessageStatus = aiSendResult.ok ? 'sent' : 'failed';
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, aiVariedMessage, 'text', flow.id, undefined, aiSendResult.remoteMessageId, aiMessageStatus);
              
              if (!aiSendResult.ok) {
                await handleSendFailure(currentNodeId, aiSendResult.errorDetails || 'Unknown error');
                sendFailed = true;
                processedActions.push(`FAILED to send AI text: ${aiVariedMessage.substring(0, 50)}`);
                break;
              }
              
              // Mark node as sent for idempotency
              sentNodeIds.push(currentNodeId);
              processedActions.push(`Sent AI text: ${aiVariedMessage.substring(0, 50)}`);
            }
            
            const aiTextEdge = edges.find(e => e.source === currentNodeId);
            if (aiTextEdge) {
              currentNodeId = aiTextEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'image':
          case 'audio':
          case 'video':
          case 'document':
            // === PAUSE SCHEDULE CHECK FOR MEDIA NODES ===
            if (isWithinPauseSchedule() && !resumeFromPauseSchedule) {
              console.log(`[${runId}] ⏸️ Flow is within pause schedule (${currentNode.type}), scheduling resume for later`);
              
              const pauseResumeAtMedia = calculatePauseEndTime();
              variables._pause_scheduled = true;
              variables._pause_resume_at = pauseResumeAtMedia;
              variables._pause_node_id = currentNodeId;
              
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);
              
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .upsert({
                  session_id: sessionId,
                  user_id: session.user_id,
                  run_at: new Date(pauseResumeAtMedia).toISOString(),
                  status: 'scheduled',
                  attempts: 0,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'session_id' });
              
              return new Response(JSON.stringify({ 
                success: true, 
                paused: true,
                pauseResumeAt: new Date(pauseResumeAtMedia).toISOString(),
                reason: 'pause_schedule_active'
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Check if already sent (idempotency)
            if (sentNodeIds.includes(currentNodeId)) {
              console.log(`[${runId}] Node ${currentNodeId} already sent, skipping`);
              const mediaEdge = edges.find(e => e.source === currentNodeId);
              if (mediaEdge) {
                currentNodeId = mediaEdge.target;
              } else {
                continueProcessing = false;
              }
              break;
            }

            const mediaUrl = currentNode.data.mediaUrl as string;
            const caption = replaceVariables(currentNode.data.caption as string || '', variables);
            const fileName = currentNode.data.fileName as string || '';
            
            console.log(`[${runId}] === Processing ${currentNode.type} node ===`);
            console.log(`[${runId}] Node data:`, JSON.stringify(currentNode.data, null, 2));
            console.log(`[${runId}] mediaUrl: ${mediaUrl}`);
            console.log(`[${runId}] caption: ${caption}`);
            console.log(`[${runId}] fileName: ${fileName}`);
            console.log(`[${runId}] instanceName: ${instanceName}`);
            console.log(`[${runId}] phone: ${phone}`);
            
            if (instanceName && phone && mediaUrl) {
              // Calculate delay for presence indicator
              let mediaDelayMs = 0;
              if (currentNode.data.showPresence) {
                const presenceDelaySeconds = (currentNode.data.presenceDelay as number) || 3;
                mediaDelayMs = presenceDelaySeconds * 1000;
                const presenceType = currentNode.type === 'audio' ? 'recording' : 'composing';
                console.log(`[${runId}] 🎵 ${currentNode.type.toUpperCase()} NODE - showPresence=true, presenceDelay=${presenceDelaySeconds}s, delayMs=${mediaDelayMs}, presenceType=${presenceType}`);
                
                // For Evolution API, send presence separately then wait
                if (apiProvider !== 'uazapi') {
                  await sendPresence(effectiveBaseUrl, effectiveApiKey, instanceName, phone, presenceType, mediaDelayMs);
                  processedActions.push(`Showed ${presenceType} for ${presenceDelaySeconds}s`);
                } else {
                  const uazapiPresenceLabel = currentNode.type === 'audio' ? 'Gravando áudio...' : 'Digitando...';
                  console.log(`[${runId}] 🚀 UazAPI: Will send delay=${mediaDelayMs}ms in request body to show "${uazapiPresenceLabel}"`);
                  processedActions.push(`UazAPI ${currentNode.type === 'audio' ? 'recording' : 'typing'} delay: ${presenceDelaySeconds}s`);
                }
              } else {
                console.log(`[${runId}] 🎵 ${currentNode.type.toUpperCase()} NODE - showPresence=false, no delay`);
              }
              
              console.log(`[${runId}] Sending ${currentNode.type} message via ${apiProvider}...`);
              // For images/videos, send caption. For documents, send fileName.
              // DO NOT send fileName as caption for image/video - that causes the filename to appear to the user
              const contentToSend = currentNode.type === 'document' ? fileName : caption;
              // For UazAPI, pass delay parameter; for Evolution, delay was already handled
              const uazapiMediaDelay = apiProvider === 'uazapi' ? mediaDelayMs : 0;
              console.log(`[${runId}] Calling sendMessage with apiProvider=${apiProvider}, uazapiMediaDelay=${uazapiMediaDelay}ms`);
              const mediaSendResult = await sendMessage(effectiveBaseUrl, effectiveApiKey, instanceName, phone, contentToSend, currentNode.type, mediaUrl, fileName, apiProvider, instanceUazapiToken, uazapiMediaDelay);
              
              // Save message with correct status based on send result
              const mediaStatus = mediaSendResult.ok ? 'sent' : 'failed';
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, caption || '', currentNode.type, flow.id, mediaUrl, mediaSendResult.remoteMessageId, mediaStatus);
              
              if (!mediaSendResult.ok) {
                await handleSendFailure(currentNodeId, mediaSendResult.errorDetails || 'Unknown error');
                sendFailed = true;
                processedActions.push(`FAILED to send ${currentNode.type}: ${caption || fileName || 'media'}`);
                break;
              }
              
              // Mark node as sent for idempotency
              sentNodeIds.push(currentNodeId);
              processedActions.push(`Sent ${currentNode.type}: ${caption || fileName || 'media'}`);
              console.log(`[${runId}] ${currentNode.type} sent successfully`);
            } else {
              console.log(`[${runId}] Skipping ${currentNode.type} - missing required data:`, {
                hasInstanceName: !!instanceName,
                hasPhone: !!phone,
                hasMediaUrl: !!mediaUrl
              });
            }
            
            const mediaEdge = edges.find(e => e.source === currentNodeId);
            if (mediaEdge) {
              currentNodeId = mediaEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'delay':
            const delayType = (currentNode.data.delayType as string) || 'fixed';
            const unit = (currentNode.data.unit as string) || 'seconds';
            
            let delay: number;
            if (delayType === 'variable') {
              const minDelay = (currentNode.data.minDelay as number) || 5;
              const maxDelay = (currentNode.data.maxDelay as number) || 15;
              delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
              console.log(`[${runId}] Variable delay: random value ${delay} between ${minDelay} and ${maxDelay}`);
            } else {
              delay = (currentNode.data.delay as number) || 5;
            }
            
            let delayMs = delay * 1000;
            if (unit === 'minutes') delayMs = delay * 60 * 1000;
            if (unit === 'hours') delayMs = delay * 60 * 60 * 1000;
            if (unit === 'days') delayMs = delay * 24 * 60 * 60 * 1000;
            
            const unitLabel = unit === 'seconds' ? 's' : unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : 'd';
            
            // Check if delay is longer than what we can handle inline
            if (delayMs > MAX_INLINE_DELAY_MS) {
              // Schedule the delay using the job queue for robust processing
              const resumeAt = new Date(Date.now() + delayMs);
              variables._pendingDelay = {
                nodeId: currentNodeId,
                resumeAt: resumeAt.getTime(),
                delayMs,
              };
              
              console.log(`[${runId}] Long delay detected: ${delay} ${unit} (${delayMs}ms). Scheduling resume at ${resumeAt.toISOString()}`);
              
              // Update session with pending delay state and release lock
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);
              
              // Insert job into the delay queue (pg_cron will process this)
              const { error: jobError } = await supabaseClient
                .from('inbox_flow_delay_jobs')
                .upsert({
                  session_id: sessionId,
                  user_id: session.user_id,
                  run_at: resumeAt.toISOString(),
                  status: 'scheduled',
                  attempts: 0,
                  last_error: null,
                }, { onConflict: 'session_id' });
              
              if (jobError) {
                console.error(`[${runId}] Error inserting delay job:`, jobError);
              } else {
                console.log(`[${runId}] Delay job created for session ${sessionId}, will run at ${resumeAt.toISOString()}`);
              }
              
              processedActions.push(`Scheduled delay: ${delay}${unitLabel} (will resume at ${resumeAt.toLocaleTimeString()})`);
              
              continueProcessing = false;
              return new Response(JSON.stringify({ 
                success: true, 
                currentNode: currentNodeId,
                actions: processedActions,
                scheduledDelay: true,
                resumeAt: resumeAt.toISOString()
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            
            // Short delay - execute inline
            console.log(`[${runId}] Short delay: waiting ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            processedActions.push(`Waited ${delay}${unitLabel}${delayType === 'variable' ? ' (variable)' : ''}`);
            
            const delayEdge = edges.find(e => e.source === currentNodeId);
            if (delayEdge) {
              currentNodeId = delayEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'waitInput':
            // If resumeFromTimeout, skip waiting and move to next node (with empty variable)
            if (resumeFromTimeout) {
              console.log(`[${runId}] Timeout expired, continuing flow without user input`);
              const varName = currentNode.data.variableName as string;
              if (varName) {
                variables[varName] = ''; // Empty value for timeout
              }
              
              // Clear timeout and move to next node
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  timeout_at: null,
                  variables,
                  last_interaction: new Date().toISOString(),
                })
                .eq('id', sessionId);
              
              processedActions.push('Timeout expired, continuing without input');
              
              const timeoutEdge = edges.find((e: { source: string }) => e.source === currentNodeId);
              if (timeoutEdge) {
                currentNodeId = timeoutEdge.target;
              } else {
                continueProcessing = false;
              }
              break;
            }
            
            // Calculate timeout if enabled - default is false now for clarity
            const timeoutEnabled = currentNode.data.timeoutEnabled === true;
            let timeoutAt: string | null = null;
            
            console.log(`[${runId}] WaitInput node ${currentNodeId}: timeoutEnabled=${currentNode.data.timeoutEnabled}, timeout=${currentNode.data.timeout}, timeoutUnit=${currentNode.data.timeoutUnit}`);
            
            if (timeoutEnabled) {
              const timeoutValue = (currentNode.data.timeout as number) || 5;
              const timeoutUnit = (currentNode.data.timeoutUnit as string) || 'minutes';
              
              // Convert to seconds
              let timeoutSeconds = timeoutValue;
              if (timeoutUnit === 'minutes') timeoutSeconds *= 60;
              if (timeoutUnit === 'hours') timeoutSeconds *= 3600;
              if (timeoutUnit === 'days') timeoutSeconds *= 86400;
              
              timeoutAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();
              console.log(`[${runId}] Timeout configured: ${timeoutValue} ${timeoutUnit} (${timeoutSeconds}s) -> expires at ${timeoutAt}`);
            } else {
              console.log(`[${runId}] Timeout disabled for this waitInput node`);
            }
            
            // Stop and wait for user input - save state and release lock
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({
                current_node_id: currentNodeId,
                variables,
                last_interaction: new Date().toISOString(),
                processing: false,
                processing_started_at: null,
                timeout_at: timeoutAt,
              })
              .eq('id', sessionId);
            
            // Create timeout job if timeout is enabled
            if (timeoutAt) {
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .upsert({
                  session_id: sessionId,
                  user_id: session.user_id,
                  run_at: timeoutAt,
                  status: 'scheduled',
                  attempts: 0,
                }, { onConflict: 'session_id' });
              
              console.log(`[${runId}] Timeout job created for session ${sessionId}, will expire at ${timeoutAt}`);
            }
            
            processedActions.push(`Waiting for user input${timeoutAt ? ` (timeout: ${timeoutAt})` : ''}`);
            continueProcessing = false;
            
            // Return early - lock already released in the update above
            return new Response(JSON.stringify({ 
              success: true, 
              currentNode: currentNodeId,
              actions: processedActions,
              waitingForInput: true,
              timeoutAt
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

          case 'condition':
            const conditions = currentNode.data.conditions as Array<{
              id: string;
              type: 'variable' | 'tag';
              variable?: string;
              operator?: string;
              value?: string;
              tagName?: string;
              tagCondition?: 'has' | 'not_has';
            }> || [];
            const logicOperator = (currentNode.data.logicOperator as string) || 'and';
            
            // Legacy support
            if (conditions.length === 0 && currentNode.data.variable) {
              conditions.push({
                id: 'legacy',
                type: 'variable',
                variable: currentNode.data.variable as string,
                operator: (currentNode.data.operator as string) || 'equals',
                value: (currentNode.data.value as string) || '',
              });
            }

            // IMPORTANT: Re-fetch contact to get updated tags
            // Tags might have been added/removed during the flow execution
            const { data: freshContact } = await supabaseClient
              .from('inbox_contacts')
              .select('tags')
              .eq('id', contact.id)
              .maybeSingle();
            
            const contactTags = (freshContact?.tags as string[]) || [];
            console.log(`[${runId}] Condition node: checking ${conditions.length} conditions, contact tags:`, contactTags);
            console.log(`[${runId}] Session variables:`, variables);
            
            const evaluateCondition = (cond: typeof conditions[0]): boolean => {
              if (cond.type === 'tag') {
                const tagToCheck = normalizeComparable(cond.tagName || '');
                const hasTag = contactTags.some(t => normalizeComparable(t) === tagToCheck);
                const result = cond.tagCondition === 'has' ? hasTag : !hasTag;
                console.log(`[${runId}] Tag condition: "${tagToCheck}" ${cond.tagCondition} -> hasTag=${hasTag}, result=${result}`);
                return result;
              }
              
              // Variable condition - normalize variable name (remove {{ }})
              const varName = normalizeVarKey(cond.variable || '');
              const rawVarValue = variables[varName];
              const varValueStr = rawVarValue === null || rawVarValue === undefined ? '' : String(rawVarValue).trim();
              const compareValueStr = String(cond.value || '').trim();
              
              console.log(`[${runId}] Variable condition: ${varName}="${varValueStr}" ${cond.operator} "${compareValueStr}"`);
              
              const a = normalizeComparable(varValueStr);
              const b = normalizeComparable(compareValueStr);

              let result: boolean;
              switch (cond.operator) {
                case 'equals': result = a === b; break;
                case 'not_equals': result = a !== b; break;
                case 'contains': result = a.includes(b); break;
                case 'not_contains': result = !a.includes(b); break;
                case 'startsWith': result = a.startsWith(b); break;
                case 'endsWith': result = a.endsWith(b); break;
                case 'greater': result = parseFloat(varValueStr) > parseFloat(compareValueStr); break;
                case 'less': result = parseFloat(varValueStr) < parseFloat(compareValueStr); break;
                case 'exists': result = varValueStr !== '' && varValueStr !== 'undefined'; break;
                case 'not_exists': result = varValueStr === '' || varValueStr === 'undefined'; break;
                default: result = a === b;
              }
              console.log(`[${runId}] Variable condition result: ${result}`);
              return result;
            };

            let conditionMet: boolean;
            if (conditions.length === 0) {
              conditionMet = false;
            } else if (logicOperator === 'and') {
              conditionMet = conditions.every(evaluateCondition);
            } else {
              conditionMet = conditions.some(evaluateCondition);
            }
            
            console.log(`[${runId}] Condition evaluated: ${conditionMet} (${logicOperator}, ${conditions.length} conditions)`);
            processedActions.push(`Condition: ${conditionMet ? 'YES' : 'NO'}`);
            
            const conditionEdge = edges.find(e => 
              e.source === currentNodeId && 
              e.sourceHandle === (conditionMet ? 'yes' : 'no')
            );
            
            if (conditionEdge) {
              currentNodeId = conditionEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'menu':
            // Check if already sent (idempotency)
            if (sentNodeIds.includes(currentNodeId)) {
              console.log(`[${runId}] Menu node ${currentNodeId} already sent, waiting for input`);
              // Still need to wait for input
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);
              
              continueProcessing = false;
              return new Response(JSON.stringify({ 
                success: true, 
                currentNode: currentNodeId,
                actions: processedActions,
                waitingForInput: true
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            const menuMessage = replaceVariables(currentNode.data.message as string || '', variables);
            const options = currentNode.data.options as string || '';
            const fullMenuMessage = `${menuMessage}\n\n${options}`;
            
            if (instanceName && phone && fullMenuMessage) {
              const menuSendResult = await sendMessage(effectiveBaseUrl, effectiveApiKey, instanceName, phone, fullMenuMessage, 'text', undefined, undefined, apiProvider, instanceUazapiToken);
              
              const menuStatus = menuSendResult.ok ? 'sent' : 'failed';
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, fullMenuMessage, 'text', flow.id, undefined, menuSendResult.remoteMessageId, menuStatus);
              
              if (!menuSendResult.ok) {
                await handleSendFailure(currentNodeId, menuSendResult.errorDetails || 'Unknown error');
                sendFailed = true;
                processedActions.push(`FAILED to send menu`);
                break;
              }
              
              // Mark as sent
              sentNodeIds.push(currentNodeId);
            }
            
            // Wait for user input after showing menu - save state and release lock
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({
                current_node_id: currentNodeId,
                variables,
                last_interaction: new Date().toISOString(),
                processing: false,
                processing_started_at: null,
              })
              .eq('id', sessionId);
            
            processedActions.push('Showing menu, waiting for selection');
            continueProcessing = false;
            
            // Return early - lock already released in the update above
            return new Response(JSON.stringify({ 
              success: true, 
              currentNode: currentNodeId,
              actions: processedActions,
              waitingForInput: true
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

          case 'setVariable':
            const varName = normalizeVarKey(currentNode.data.variableName as string || '');
            const varVal = replaceVariables(currentNode.data.value as string || '', variables);
            if (varName) {
              variables[varName] = varVal;
              console.log(`[${runId}] Set variable: ${varName} = ${varVal}`);
            }
            
            const setVarEdge = edges.find(e => e.source === currentNodeId);
            if (setVarEdge) {
              currentNodeId = setVarEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'tag':
            const tagName = currentNode.data.tagName as string || '';
            const tagAction = currentNode.data.action as string || 'add';
            
            if (tagName) {
              // Re-fetch current tags to ensure we have the latest
              const { data: currentContact } = await supabaseClient
                .from('inbox_contacts')
                .select('tags')
                .eq('id', contact.id)
                .single();
              
              const currentTags = (currentContact?.tags as string[]) || [];
              let newTags: string[];
              
              if (tagAction === 'add') {
                newTags = [...new Set([...currentTags, tagName])];
              } else {
                newTags = currentTags.filter(t => t !== tagName);
              }
              
              await supabaseClient
                .from('inbox_contacts')
                .update({ tags: newTags })
                .eq('id', contact.id);
              
              // Update local contact reference for subsequent condition checks
              contact = { ...contact, tags: newTags };
              
              console.log(`[${runId}] Tag ${tagAction}: ${tagName}, new tags:`, newTags);
              processedActions.push(`${tagAction === 'add' ? 'Added' : 'Removed'} tag: ${tagName}`);
            }
            
            const tagEdge = edges.find(e => e.source === currentNodeId);
            if (tagEdge) {
              currentNodeId = tagEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'transfer':
            // Check if already sent (idempotency)
            if (!sentNodeIds.includes(currentNodeId)) {
              const transferMessage = replaceVariables(currentNode.data.message as string || 'Transferindo para atendimento humano...', variables);
              if (instanceName && phone && transferMessage) {
                const transferSendResult = await sendMessage(effectiveBaseUrl, effectiveApiKey, instanceName, phone, transferMessage, 'text', undefined, undefined, apiProvider, instanceUazapiToken);
                
                const transferStatus = transferSendResult.ok ? 'sent' : 'failed';
                await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, transferMessage, 'text', flow.id, undefined, transferSendResult.remoteMessageId, transferStatus);
                
                if (!transferSendResult.ok) {
                  await handleSendFailure(currentNodeId, transferSendResult.errorDetails || 'Unknown error');
                  sendFailed = true;
                  processedActions.push(`FAILED to send transfer message`);
                  break;
                }
                
                sentNodeIds.push(currentNodeId);
              }
            }
            
            // Mark session as completed and release lock
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({ 
                status: 'completed',
                processing: false,
                processing_started_at: null,
              })
              .eq('id', sessionId);
            
            processedActions.push('Transferred to human');
            continueProcessing = false;
            break;

          case 'end':
            // Mark session as completed and release lock
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({ 
                status: 'completed',
                processing: false,
                processing_started_at: null,
              })
              .eq('id', sessionId);
            
            processedActions.push('Flow completed');
            continueProcessing = false;
            break;

          case 'ai':
            // AI node - use Lovable AI to generate response
            const aiPrompt = replaceVariables(currentNode.data.prompt as string || '', variables);
            const aiModel = (currentNode.data.model as string) || 'google/gemini-2.5-flash';
            const saveToVariable = currentNode.data.saveToVariable as string || 'ai_response';
            
            if (aiPrompt) {
              try {
                const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
                if (!LOVABLE_API_KEY) {
                  console.error(`[${runId}] LOVABLE_API_KEY not configured`);
                  processedActions.push('AI error: API key not configured');
                } else {
                  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      model: aiModel,
                      messages: [
                        { role: 'system', content: 'Você é um assistente prestativo. Responda de forma concisa e útil.' },
                        { role: 'user', content: aiPrompt },
                      ],
                    }),
                  });

                  if (aiResponse.ok) {
                    const aiData = await aiResponse.json();
                    const aiContent = aiData.choices?.[0]?.message?.content || '';
                    variables[saveToVariable] = aiContent;
                    console.log(`[${runId}] AI response saved to ${saveToVariable}: ${aiContent.substring(0, 100)}`);
                    processedActions.push(`AI generated response (${aiContent.length} chars)`);
                  } else {
                    console.error(`[${runId}] AI API error:`, await aiResponse.text());
                    processedActions.push('AI error: API request failed');
                  }
                }
              } catch (aiError) {
                console.error(`[${runId}] AI node error:`, aiError);
                processedActions.push('AI error: Exception');
              }
            }
            
            const aiEdge = edges.find(e => e.source === currentNodeId);
            if (aiEdge) {
              currentNodeId = aiEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'webhook':
            // Webhook node - call external URL
            const webhookUrl = replaceVariables(currentNode.data.url as string || '', variables);
            const webhookMethod = (currentNode.data.method as string) || 'POST';
            const webhookHeaders = currentNode.data.headers as Record<string, string> || {};
            const webhookBody = replaceVariables(currentNode.data.body as string || '', variables);
            const webhookSaveToVariable = currentNode.data.saveToVariable as string || '';
            
            if (webhookUrl) {
              try {
                console.log(`[${runId}] Calling webhook: ${webhookMethod} ${webhookUrl}`);
                const webhookResponse = await fetch(webhookUrl, {
                  method: webhookMethod,
                  headers: {
                    'Content-Type': 'application/json',
                    ...webhookHeaders,
                  },
                  body: webhookMethod !== 'GET' ? webhookBody : undefined,
                });

                const webhookData = await webhookResponse.text();
                console.log(`[${runId}] Webhook response (${webhookResponse.status}): ${webhookData.substring(0, 200)}`);
                
                if (webhookSaveToVariable) {
                  try {
                    variables[webhookSaveToVariable] = JSON.parse(webhookData);
                  } catch {
                    variables[webhookSaveToVariable] = webhookData;
                  }
                }
                
                processedActions.push(`Webhook called: ${webhookUrl}`);
              } catch (webhookError) {
                console.error(`[${runId}] Webhook error:`, webhookError);
                processedActions.push('Webhook error');
              }
            }
            
            const webhookEdge = edges.find(e => e.source === currentNodeId);
            if (webhookEdge) {
              currentNodeId = webhookEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'randomizer':
            // Randomizer node - pick a random path based on splits configuration
            const splits = (currentNode.data.splits as Array<{ id: string; name: string; percentage: number }>) || [];
            if (splits.length > 0) {
              // Calculate total percentage
              const totalPercentage = splits.reduce((sum, s) => sum + (s.percentage || 0), 0);
              const randomValue = Math.random() * totalPercentage;
              
              let cumulative = 0;
              let selectedSplitId = splits[0]?.id;
              
              for (const split of splits) {
                cumulative += split.percentage || 0;
                if (randomValue <= cumulative) {
                  selectedSplitId = split.id;
                  break;
                }
              }
              
              console.log(`[${runId}] Randomizer: selected split ${selectedSplitId} (random: ${randomValue.toFixed(2)}/${totalPercentage})`);
              processedActions.push(`Randomizer: split ${selectedSplitId}`);
              
              // Find edge with matching sourceHandle
              const randomEdge = edges.find(e => 
                e.source === currentNodeId && 
                e.sourceHandle === selectedSplitId
              );
              
              if (randomEdge) {
                currentNodeId = randomEdge.target;
              } else {
                // Fallback to first edge if no matching handle
                const fallbackEdge = edges.find(e => e.source === currentNodeId);
                if (fallbackEdge) {
                  currentNodeId = fallbackEdge.target;
                } else {
                  continueProcessing = false;
                }
              }
            } else {
              const randEdge = edges.find(e => e.source === currentNodeId);
              if (randEdge) {
                currentNodeId = randEdge.target;
              } else {
                continueProcessing = false;
              }
            }
            break;

          case 'paymentIdentifier': {
            // Payment Identifier node - analyze PIX payment receipts in inbound media
            // ATTEMPTS are counted for ALL message types (text, audio, image, document)
            // but only image/PDF are analyzed for payment confirmation
            const checkImage = (currentNode.data.checkImage as boolean) ?? true;
            const checkPdf = (currentNode.data.checkPdf as boolean) ?? true;
            const markAsPaid = (currentNode.data.markAsPaid as boolean) || false;
            const maxAttempts = (currentNode.data.maxAttempts as number) || 3;
            
            // No response delay configuration
            const noResponseDelayValue = (currentNode.data.noResponseDelayValue as number) || 5;
            const noResponseDelayUnit = (currentNode.data.noResponseDelayUnit as string) || 'minutes';
            const noResponseDelayMs = noResponseDelayUnit === 'seconds' 
              ? noResponseDelayValue * 1000 
              : noResponseDelayValue * 60 * 1000;
            // Cap at 60 minutes
            const cappedDelayMs = Math.min(noResponseDelayMs, 60 * 60 * 1000);

            const paymentAttemptKey = `_payment_attempts_${currentNodeId}`;
            const paymentSinceKey = `_payment_since_${currentNodeId}`;
            const paymentLastMsgKey = `_payment_last_media_msg_${currentNodeId}`;
            const paymentLastAnalysisKey = `_payment_last_media_analysis_${currentNodeId}`;
            const paymentNoResponseDelayKey = `_payment_no_response_delay_${currentNodeId}`;

            let attempts = Number(variables[paymentAttemptKey] ?? 0);

            // Check if this is a "no response" timeout callback
            if (resumeFromTimeout && currentNode.type === 'paymentIdentifier') {
              // Check if we have the noResponse delay set and no messages were received
              const noResponseDelay = variables[paymentNoResponseDelayKey] as { scheduledAt: number; runAt: number } | undefined;
              
              if (noResponseDelay && attempts === 0) {
                // No messages received during the delay period - route to noResponse
                console.log(`[${runId}] ⏰ PaymentIdentifier: No response timeout - no messages received, routing to noResponse`);
                
                // Clear all payment state
                delete variables[paymentAttemptKey];
                delete variables[paymentSinceKey];
                delete variables[paymentLastMsgKey];
                delete variables[paymentLastAnalysisKey];
                delete variables[paymentNoResponseDelayKey];
                
                // Clear the delay job
                await supabaseClient
                  .from('inbox_flow_delay_jobs')
                  .delete()
                  .eq('session_id', sessionId);
                
                const noResponseEdge = edges.find((e) => e.source === currentNodeId && e.sourceHandle === 'noResponse');
                if (noResponseEdge) {
                  currentNodeId = noResponseEdge.target;
                } else {
                  continueProcessing = false;
                }
                processedActions.push('No response received within timeout: NO RESPONSE');
                break;
              }
            }

            // Anchor: only consider messages after we reached this node.
            if (!variables[paymentSinceKey]) {
              variables[paymentSinceKey] = session.last_interaction || session.started_at;
            }

            const sinceIso = String(variables[paymentSinceKey] || session.last_interaction || session.started_at);

            // Media types that can be analyzed for payment (image/PDF)
            const paymentMediaFilters: string[] = [];
            if (checkImage) paymentMediaFilters.push('image');
            if (checkPdf) paymentMediaFilters.push('document');
            
            // All message types that count as attempts (text, audio, image, document, video)
            const attemptMessageTypes = ['text', 'audio', 'image', 'document', 'video'];

            const remainingAttempts = Math.max(0, maxAttempts - attempts);

            console.log(
              `[${runId}] PaymentIdentifier: attemptsUsed=${attempts}/${maxAttempts}, remaining=${remainingAttempts}, checkImage=${checkImage}, checkPdf=${checkPdf}, since=${sinceIso}`,
            );

            if (remainingAttempts <= 0) {
              console.log(`[${runId}] ❌ PaymentIdentifier: no remaining attempts, routing NOT PAID`);
              delete variables[paymentAttemptKey];
              delete variables[paymentSinceKey];
              delete variables[paymentLastMsgKey];
              delete variables[paymentLastAnalysisKey];
              delete variables[paymentNoResponseDelayKey];
              
              // Clear any pending delay job
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .delete()
                .eq('session_id', sessionId);

              const notPaidEdge = edges.find((e) => e.source === currentNodeId && e.sourceHandle === 'notPaid');
              if (notPaidEdge) {
                currentNodeId = notPaidEdge.target;
              } else {
                continueProcessing = false;
              }
              processedActions.push(`Payment not identified after ${maxAttempts} attempts: NOT PAID`);
              break;
            }

            // Fetch ALL new messages since cursor (to count attempts)
            const { data: allNewMessages, error: allMsgFetchError } = await supabaseClient
              .from('inbox_messages')
              .select('*')
              .eq('contact_id', contact.id)
              .eq('instance_id', session.instance_id)
              .eq('direction', 'inbound')
              .in('message_type', attemptMessageTypes)
              .gt('created_at', sinceIso)
              .order('created_at', { ascending: true })
              .limit(Math.min(remainingAttempts, 20));

            if (allMsgFetchError) {
              console.error(`[${runId}] PaymentIdentifier: failed to fetch messages:`, allMsgFetchError);
            }

            // Filter only payment-analyzable media (image/PDF)
            const newMediaMessages = (allNewMessages || []).filter(msg => 
              paymentMediaFilters.includes(msg.message_type)
            );
            
            // Non-payment messages (text, audio, video) - these just count as attempts
            const nonPaymentMessages = (allNewMessages || []).filter(msg => 
              !paymentMediaFilters.includes(msg.message_type)
            );

            console.log(`[${runId}] PaymentIdentifier: found ${allNewMessages?.length || 0} total messages, ${newMediaMessages.length} payment media, ${nonPaymentMessages.length} non-payment`);

            if (!allNewMessages || allNewMessages.length === 0) {
              console.log(`[${runId}] PaymentIdentifier: waiting for NEW messages since ${sinceIso}`);
              
              // Schedule "no response" delay job if not already scheduled
              if (!variables[paymentNoResponseDelayKey]) {
                const runAt = new Date(Date.now() + cappedDelayMs);
                
                // First, delete any existing delay job for this session
                await supabaseClient
                  .from('inbox_flow_delay_jobs')
                  .delete()
                  .eq('session_id', sessionId);
                
                // Create new delay job for "no response" timeout
                const { error: delayJobError } = await supabaseClient
                  .from('inbox_flow_delay_jobs')
                  .insert({
                    session_id: sessionId,
                    run_at: runAt.toISOString(),
                    status: 'scheduled',
                    user_id: session.user_id,
                  });
                
                if (delayJobError) {
                  console.error(`[${runId}] PaymentIdentifier: failed to create noResponse delay job:`, delayJobError);
                } else {
                  console.log(`[${runId}] PaymentIdentifier: scheduled noResponse delay for ${runAt.toISOString()} (${cappedDelayMs}ms)`);
                  variables[paymentNoResponseDelayKey] = {
                    scheduledAt: Date.now(),
                    runAt: Date.now() + cappedDelayMs,
                  };
                }
                
                // Also set timeout_at on session for the queue processor
                await supabaseClient
                  .from('inbox_flow_sessions')
                  .update({
                    timeout_at: runAt.toISOString(),
                  })
                  .eq('id', sessionId);
              }

              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);

              processedActions.push(`Waiting for payment proof (attempts used: ${attempts}/${maxAttempts})`);
              continueProcessing = false;

              return new Response(
                JSON.stringify({
                  success: true,
                  currentNode: currentNodeId,
                  actions: processedActions,
                  waitingForPayment: true,
                  attempt: attempts,
                  maxAttempts,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
            
            // User sent a message - cancel the "no response" delay
            if (variables[paymentNoResponseDelayKey]) {
              console.log(`[${runId}] PaymentIdentifier: user sent message, cancelling noResponse delay`);
              delete variables[paymentNoResponseDelayKey];
              
              // Delete the delay job
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .delete()
                .eq('session_id', sessionId);
              
              // Clear timeout_at
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  timeout_at: null,
                })
                .eq('id', sessionId);
            }
            
            // Count non-payment messages (text, audio, video) as attempts first
            for (const nonPaymentMsg of nonPaymentMessages) {
              if (attempts >= maxAttempts) break;
              
              console.log(`[${runId}] PaymentIdentifier: counting ${nonPaymentMsg.message_type} message as attempt (id=${nonPaymentMsg.id})`);
              attempts += 1;
              variables[paymentAttemptKey] = attempts;
              
              // Advance cursor so we never reprocess the same message
              if (nonPaymentMsg.created_at) {
                variables[paymentSinceKey] = nonPaymentMsg.created_at;
              }
            }
            
            // Check if we've exhausted attempts after counting non-payment messages
            if (attempts >= maxAttempts && newMediaMessages.length === 0) {
              console.log(`[${runId}] ❌ PaymentIdentifier: max attempts reached after non-payment messages (${attempts}/${maxAttempts})`);
              
              delete variables[paymentAttemptKey];
              delete variables[paymentSinceKey];
              delete variables[paymentLastMsgKey];
              delete variables[paymentLastAnalysisKey];

              const notPaidEdge = edges.find((e) => e.source === currentNodeId && e.sourceHandle === 'notPaid');
              if (notPaidEdge) {
                currentNodeId = notPaidEdge.target;
              } else {
                continueProcessing = false;
              }
              processedActions.push(`Payment not identified after ${attempts} attempts (no valid proof sent): NOT PAID`);
              break;
            }

            const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
            let isPaymentReceipt = false;
            let lastAnalysis = '';
            let processedAnyThisRun = false;

            const analyzeMessage = async (msg: any) => {
              const messageType = msg.message_type as string;
              const mediaUrl = msg.media_url as string | null;
              const remoteMessageId = msg.remote_message_id as string | null;

              console.log(
                `[${runId}] PaymentIdentifier: analyzing media msg id=${msg.id}, type=${messageType}, hasMediaUrl=${!!mediaUrl}, remoteId=${remoteMessageId}`,
              );

              if (!LOVABLE_API_KEY) {
                console.error(`[${runId}] LOVABLE_API_KEY not configured for payment analysis`);
                return { ok: false, isPayment: false, analysisText: '' };
              }

              try {
                let mediaBase64 = '';
                let mediaMimetype = messageType === 'document' ? 'application/pdf' : 'image/jpeg';

                // PRIORITY: UazAPI /message/download for the exact message id
                if (apiProvider === 'uazapi' && instanceUazapiToken && remoteMessageId) {
                  try {
                    const downloadResponse = await fetch(`${uazapiBaseUrl}/message/download`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        token: instanceUazapiToken,
                      },
                      body: JSON.stringify({
                        id: remoteMessageId,
                        return_base64: true,
                        return_link: false,
                      }),
                    });

                    if (downloadResponse.ok) {
                      const downloadData = await downloadResponse.json();
                      mediaBase64 = downloadData.base64Data || downloadData.base64 || downloadData.data || '';
                      mediaMimetype = downloadData.mimetype || mediaMimetype;
                      console.log(
                        `[${runId}] PaymentIdentifier: UAZAPI download ok (len=${mediaBase64.length}, mimetype=${mediaMimetype})`,
                      );
                    } else {
                      console.error(
                        `[${runId}] PaymentIdentifier: UAZAPI download failed:`,
                        await downloadResponse.text(),
                      );
                    }
                  } catch (uazErr) {
                    console.error(`[${runId}] PaymentIdentifier: UAZAPI download error:`, uazErr);
                  }
                }

                // Fallback: try direct URL fetch (stored media)
                if (!mediaBase64 && mediaUrl) {
                  try {
                    const mediaResponse = await fetch(mediaUrl);
                    if (mediaResponse.ok) {
                      const buf = await mediaResponse.arrayBuffer();
                      mediaBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                      mediaMimetype = mediaResponse.headers.get('content-type') || mediaMimetype;
                      console.log(`[${runId}] PaymentIdentifier: direct fetch ok (${buf.byteLength} bytes)`);
                    }
                  } catch (directErr) {
                    console.log(`[${runId}] PaymentIdentifier: direct fetch failed:`, directErr);
                  }
                }

                if (!mediaBase64) {
                  console.log(`[${runId}] PaymentIdentifier: no mediaBase64 available for analysis`);
                  return { ok: true, isPayment: false, analysisText: '' };
                }

                const isPdfMedia = mediaMimetype.includes('pdf') || messageType === 'document';

                const systemPrompt = `Você é um analisador de comprovantes de pagamento PIX.\n\nAnalise a imagem/documento e determine se é um comprovante de pagamento PIX válido.\n\nResponda APENAS com um JSON no formato:\n{\n  "is_pix_payment": true/false,\n  "confidence": 0-100,\n  "reason": "breve explicação"\n}\n\nCritérios para identificar um comprovante PIX:\n- Termos como "Pix", "Transferência", "Comprovante"\n- Dados de origem e destino (nome, CPF/CNPJ parcial, banco)\n- Valor, data/hora e ID/autenticação quando presentes\n\nImportante: mesmo que o comprovante esteja parcialmente visível, se houver sinais claros de transação PIX (ex.: "Pix" + banco + dados de origem/destino), marque como is_pix_payment:true com a confiança apropriada.`;

                const messagesToSend = isPdfMedia
                  ? [
                      { role: 'system', content: systemPrompt },
                      {
                        role: 'user',
                        content: [
                          { type: 'text', text: 'Analise este PDF e determine se é um comprovante de pagamento PIX.' },
                          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${mediaBase64}` } },
                        ],
                      },
                    ]
                  : [
                      { role: 'system', content: systemPrompt },
                      {
                        role: 'user',
                        content: [
                          { type: 'text', text: 'Analise esta imagem e determine se é um comprovante de pagamento PIX.' },
                          { type: 'image_url', image_url: { url: `data:${mediaMimetype};base64,${mediaBase64}` } },
                        ],
                      },
                    ];

                const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: messagesToSend,
                  }),
                });

                if (!aiResponse.ok) {
                  console.error(`[${runId}] PaymentIdentifier: AI API error:`, await aiResponse.text());
                  return { ok: false, isPayment: false, analysisText: '' };
                }

                const aiData = await aiResponse.json();
                const analysisText = aiData.choices?.[0]?.message?.content || '';
                console.log(`[${runId}] PaymentIdentifier: AI result: ${analysisText}`);

                let isPayment = false;
                try {
                  const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const confRaw = parsed.confidence;
                    const conf = typeof confRaw === 'number' ? confRaw : Number(confRaw ?? 0);
                    const hasConfidence = confRaw !== undefined && confRaw !== null && confRaw !== '';

                    // Slightly more permissive threshold to reduce false negatives.
                    isPayment = parsed.is_pix_payment === true && (!hasConfidence || conf >= 55);
                    console.log(`[${runId}] PaymentIdentifier: parsed isPayment=${isPayment}, confidence=${conf}`);
                  }
                } catch (parseErr) {
                  console.error(`[${runId}] PaymentIdentifier: error parsing AI response:`, parseErr);
                }

                return { ok: true, isPayment, analysisText };
              } catch (analysisErr) {
                console.error(`[${runId}] PaymentIdentifier: error analyzing media:`, analysisErr);
                return { ok: false, isPayment: false, analysisText: '' };
              }
            };

            // Process each new media in order until we either:
            // - confirm payment
            // - exhaust attempts
            // - run out of new media (then wait)
            for (const msg of newMediaMessages) {
              if (attempts >= maxAttempts) break;
              processedAnyThisRun = true;

              const { isPayment, analysisText } = await analyzeMessage(msg);
              lastAnalysis = analysisText;

              // Advance cursor so we never reprocess the same media
              if (msg.created_at) {
                variables[paymentSinceKey] = msg.created_at;
              }
              variables[paymentLastMsgKey] = msg.id;
              variables[paymentLastAnalysisKey] = lastAnalysis;

              if (isPayment) {
                isPaymentReceipt = true;
                break;
              }

              // Count this media as an attempt (it was processed and did NOT confirm payment)
              attempts += 1;
              variables[paymentAttemptKey] = attempts;
            }

            if (isPaymentReceipt) {
              console.log(`[${runId}] ✅ Payment receipt confirmed!`);

              if (markAsPaid) {
                const currentTags = Array.isArray(contact.tags) ? (contact.tags as string[]) : [];
                const hasPaidTag = currentTags.some((t) => String(t).toLowerCase() === 'pago');

                if (!hasPaidTag) {
                  await supabaseClient
                    .from('inbox_contacts')
                    .update({ tags: [...currentTags, 'Pago'] })
                    .eq('id', contact.id);
                  console.log(`[${runId}] Contact tagged as 'Pago' (local)`);
                }
              }

              // Apply "Pago" label in WhatsApp (UazAPI)
              if (apiProvider === 'uazapi' && instanceUazapiToken) {
                const phoneDigits = String(contact.phone || phone || '').replace(/\D/g, '');

                if (phoneDigits) {
                  console.log(`[${runId}] Applying 'Pago' label via UazAPI to ${phoneDigits}...`);
                  try {
                    const labelsResponse = await fetch(`${uazapiBaseUrl}/labels`, {
                      method: 'GET',
                      headers: { token: instanceUazapiToken },
                    });

                    if (!labelsResponse.ok) {
                      console.error(`[${runId}] Failed to fetch labels:`, await labelsResponse.text());
                    } else {
                      const labels = await labelsResponse.json();
                      const pagoLabel = (Array.isArray(labels) ? labels : []).find(
                        (l: any) => String(l?.name || '').toLowerCase() === 'pago',
                      );

                      const pagoLabelId = pagoLabel?.labelid || pagoLabel?.id || null;

                      if (!pagoLabelId) {
                        console.error(`[${runId}] 'Pago' label not found in UazAPI. Create it in WhatsApp Business.`);
                      } else {
                        const applyLabelResponse = await fetch(`${uazapiBaseUrl}/chat/labels`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            token: instanceUazapiToken,
                          },
                          body: JSON.stringify({
                            number: phoneDigits,
                            add_labelid: String(pagoLabelId),
                          }),
                        });

                        const applyText = await applyLabelResponse.text();
                        if (applyLabelResponse.ok) {
                          console.log(`[${runId}] ✅ 'Pago' label applied successfully. Response=${applyText}`);
                        } else {
                          console.error(`[${runId}] Failed to apply 'Pago' label:`, applyText);
                        }
                      }
                    }
                  } catch (labelErr) {
                    console.error(`[${runId}] Error applying WhatsApp label:`, labelErr);
                  }
                } else {
                  console.warn(`[${runId}] Could not apply label: missing phoneDigits`);
                }
              }

              // Clear attempt/cursor state
              delete variables[paymentAttemptKey];
              delete variables[paymentSinceKey];
              delete variables[paymentLastMsgKey];
              delete variables[paymentLastAnalysisKey];
              delete variables[paymentNoResponseDelayKey];
              
              // Clear any pending delay job
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .delete()
                .eq('session_id', sessionId);

              const paidEdge = edges.find((e) => e.source === currentNodeId && e.sourceHandle === 'paid');
              if (paidEdge) {
                currentNodeId = paidEdge.target;
              } else {
                continueProcessing = false;
              }
              processedActions.push('Payment identified: PAID');
              break;
            }

            if (attempts >= maxAttempts) {
              console.log(`[${runId}] ❌ Max attempts reached (${attempts}/${maxAttempts})`);

              delete variables[paymentAttemptKey];
              delete variables[paymentSinceKey];
              delete variables[paymentLastMsgKey];
              delete variables[paymentLastAnalysisKey];
              delete variables[paymentNoResponseDelayKey];
              
              // Clear any pending delay job
              await supabaseClient
                .from('inbox_flow_delay_jobs')
                .delete()
                .eq('session_id', sessionId);

              const notPaidEdge = edges.find((e) => e.source === currentNodeId && e.sourceHandle === 'notPaid');
              if (notPaidEdge) {
                currentNodeId = notPaidEdge.target;
              } else {
                continueProcessing = false;
              }
              processedActions.push(`Payment not identified after ${attempts} attempts: NOT PAID`);
              break;
            }

            // Determine if we processed any messages this run (either non-payment or payment media)
            const processedAnyMessagesThisRun = processedAnyThisRun || nonPaymentMessages.length > 0;
            
            console.log(`[${runId}] PaymentIdentifier: still waiting for valid proof, processedAnyMessagesThisRun=${processedAnyMessagesThisRun}`);

            await supabaseClient
              .from('inbox_flow_sessions')
              .update({
                current_node_id: currentNodeId,
                variables,
                last_interaction: new Date().toISOString(),
                processing: false,
                processing_started_at: null,
              })
              .eq('id', sessionId);

            processedActions.push(`Payment check attempts used: ${attempts}/${maxAttempts}, waiting for valid payment proof`);
            continueProcessing = false;

            return new Response(
              JSON.stringify({
                success: true,
                currentNode: currentNodeId,
                actions: processedActions,
                waitingForPayment: true,
                attempt: attempts,
                maxAttempts,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }


          case 'sendPixKey':
            // Send PIX Key node - sends a native WhatsApp PIX button
            const pixKey = replaceVariables(currentNode.data.pixKey as string || '', variables);
            const pixType = (currentNode.data.pixType as string) || 'EVP';
            const pixName = replaceVariables(currentNode.data.pixName as string || '', variables);
            
            if (apiProvider === 'uazapi' && instanceUazapiToken && pixKey) {
              console.log(`[${runId}] Sending PIX button: type=${pixType}, key=${pixKey.substring(0, 10)}...`);
              
              try {
                const pixResponse = await fetch(`${uazapiBaseUrl}/send/pix-button`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'token': instanceUazapiToken,
                  },
                  body: JSON.stringify({
                    number: phone.replace(/\D/g, ''),
                    pixType,
                    pixKey,
                    pixName: pixName || 'PIX',
                  }),
                });
                
                const pixResult = await pixResponse.json();
                console.log(`[${runId}] PIX button response:`, JSON.stringify(pixResult));
                
                if (pixResponse.ok) {
                  processedActions.push(`Sent PIX key (${pixType})`);
                  await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, `[Chave PIX: ${pixType}]`, 'text', flow.id);
                } else {
                  console.error(`[${runId}] PIX button error:`, pixResult);
                  processedActions.push(`PIX button error: ${JSON.stringify(pixResult)}`);
                }
              } catch (pixErr) {
                console.error(`[${runId}] PIX button exception:`, pixErr);
                processedActions.push('PIX button error');
              }
            } else if (apiProvider !== 'uazapi') {
              console.log(`[${runId}] PIX button only supported on UazAPI`);
              processedActions.push('PIX button not supported (requires UazAPI)');
            } else {
              console.log(`[${runId}] Missing PIX key configuration`);
              processedActions.push('PIX button skipped (missing config)');
            }
            
            const pixEdge = edges.find(e => e.source === currentNodeId);
            if (pixEdge) {
              currentNodeId = pixEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'sendCharge':
            // Send Charge node - sends a native WhatsApp payment request
            const chargeAmount = (currentNode.data.amount as number) || 0;
            const chargeItemName = replaceVariables(currentNode.data.itemName as string || '', variables);
            const chargeDescription = replaceVariables(currentNode.data.description as string || '', variables);
            const chargePixKey = replaceVariables(currentNode.data.pixKey as string || '', variables);
            const chargePixType = (currentNode.data.pixType as string) || 'EVP';
            const chargePixName = replaceVariables(currentNode.data.pixName as string || '', variables);
            
            // Validate required fields
            if (!chargeAmount || chargeAmount <= 0) {
              console.log(`[${runId}] Charge skipped: invalid amount (${chargeAmount})`);
              processedActions.push('Charge skipped: valor inválido');
            } else if (!chargeItemName) {
              console.log(`[${runId}] Charge skipped: missing item name`);
              processedActions.push('Charge skipped: nome do item obrigatório');
            } else if (!chargePixKey) {
              console.log(`[${runId}] Charge skipped: missing PIX key`);
              processedActions.push('Charge skipped: chave PIX obrigatória');
            } else if (!chargePixName) {
              console.log(`[${runId}] Charge skipped: missing PIX name`);
              processedActions.push('Charge skipped: nome do recebedor obrigatório');
            } else if (apiProvider === 'uazapi' && instanceUazapiToken) {
              console.log(`[${runId}] Sending native charge: amount=${chargeAmount}, item=${chargeItemName}, pixKey=${chargePixKey.substring(0, 4)}...`);
              
              try {
                const chargeResponse = await fetch(`${uazapiBaseUrl}/send/request-payment`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'token': instanceUazapiToken,
                  },
                  body: JSON.stringify({
                    number: phone.replace(/\D/g, ''),
                    amount: chargeAmount,
                    text: chargeDescription || '',
                    itemName: chargeItemName,
                    pixKey: chargePixKey,
                    pixType: chargePixType,
                    pixName: chargePixName,
                  }),
                });
                
                const chargeResult = await chargeResponse.json();
                console.log(`[${runId}] Charge response:`, JSON.stringify(chargeResult));
                
                if (chargeResponse.ok && (chargeResult.status === 'PENDING' || chargeResult.messageid || chargeResult.success !== false)) {
                  const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(chargeAmount);
                  processedActions.push(`Sent native charge: ${formattedAmount} - ${chargeItemName}`);
                  await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, `[Cobrança: ${formattedAmount} - ${chargeItemName}]`, 'text', flow.id);
                } else {
                  console.error(`[${runId}] Charge error:`, chargeResult);
                  processedActions.push(`Charge error: ${chargeResult.error || chargeResult.message || 'unknown error'}`);
                }
              } catch (chargeErr) {
                console.error(`[${runId}] Charge exception:`, chargeErr);
                processedActions.push('Charge error: exception');
              }
            } else {
              console.log(`[${runId}] Charge requires UazAPI provider`);
              processedActions.push('Charge not supported (requires UazAPI)');
            }
            
            const chargeEdge = edges.find(e => e.source === currentNodeId);
            if (chargeEdge) {
              currentNodeId = chargeEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'call':
            // Call node - makes a brief call to the contact using UazAPI /call/make endpoint
            console.log(`[${runId}] Call node: attempting to call contact`);
            
            if (apiProvider === 'uazapi' && instanceUazapiToken && uazapiBaseUrl) {
              const callNumber = phone.replace(/\D/g, '');
              console.log(`[${runId}] Making call to: ${callNumber}`);
              
              try {
                const callResponse = await fetch(`${uazapiBaseUrl}/call/make`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'token': instanceUazapiToken,
                  },
                  body: JSON.stringify({
                    number: callNumber,
                  }),
                });
                
                const callResult = await callResponse.json();
                console.log(`[${runId}] Call response:`, JSON.stringify(callResult));
                
                if (callResponse.ok && callResult.response === 'Call successful') {
                  processedActions.push(`Call initiated to ${callNumber}`);
                } else {
                  console.error(`[${runId}] Call error:`, callResult);
                  processedActions.push(`Call error: ${callResult.error || 'unknown'}`);
                }
              } catch (callErr) {
                console.error(`[${runId}] Call exception:`, callErr);
                processedActions.push('Call error: exception');
              }
            } else if (apiProvider !== 'uazapi') {
              console.log(`[${runId}] Call node only supported on UazAPI`);
              processedActions.push('Call not supported (requires UazAPI)');
            } else {
              console.log(`[${runId}] Missing UazAPI configuration for call`);
              processedActions.push('Call skipped (missing config)');
            }
            
            const callEdge = edges.find(e => e.source === currentNodeId);
            if (callEdge) {
              currentNodeId = callEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'interactiveBlock':
            // Interactive Block node - sends polls, buttons, image+buttons, or list menus via UazAPI /send/menu
            // Then waits for user response and routes based on the selected option
            console.log(`[${runId}] Interactive Block node: processing`);
            
            // Check if already sent (idempotency)
            if (sentNodeIds.includes(currentNodeId)) {
              console.log(`[${runId}] Interactive block ${currentNodeId} already sent, waiting for input`);
              // Still need to wait for input - check if we have user input to route
              if (userInput !== undefined && userInput !== null) {
                // User has responded - find matching choice and route
                const savedChoices = (currentNode.data.choices as string[]) || [];
                const userResponse = String(userInput).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                
                console.log(`[${runId}] Interactive block: user responded with "${userResponse}"`);
                
                // Find matching choice index
                let matchedChoiceIndex = -1;
                for (let i = 0; i < savedChoices.length; i++) {
                  const choice = savedChoices[i].trim();
                  // Skip section headers in list type
                  if (choice.startsWith('[') && choice.endsWith(']')) continue;
                  
                  // Get the display text and id (format: "text|id|description" or "text|id" or "text")
                  const parts = choice.split('|');
                  const choiceText = parts[0].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                  const choiceId = parts[1]?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || choiceText;
                  
                  // Match by text or id
                  if (userResponse === choiceText || userResponse === choiceId || 
                      userResponse.includes(choiceText) || choiceText.includes(userResponse)) {
                    matchedChoiceIndex = i;
                    console.log(`[${runId}] Matched choice ${i}: "${choice}"`);
                    break; // Take the first match only
                  }
                }
                
                // Save the choice to variables
                variables._interactive_response = userInput;
                variables._interactive_choice_index = matchedChoiceIndex;
                
                // Find the edge for the matched choice
                if (matchedChoiceIndex >= 0) {
                  const choiceEdge = edges.find(e => e.source === currentNodeId && e.sourceHandle === `choice-${matchedChoiceIndex}`);
                  if (choiceEdge) {
                    currentNodeId = choiceEdge.target;
                    console.log(`[${runId}] Routing to choice-${matchedChoiceIndex} -> ${currentNodeId}`);
                  } else {
                    // No specific edge for this choice, try default
                    const defaultInteractiveEdge = edges.find(e => e.source === currentNodeId && !e.sourceHandle);
                    if (defaultInteractiveEdge) {
                      currentNodeId = defaultInteractiveEdge.target;
                    } else {
                      continueProcessing = false;
                    }
                  }
                } else {
                  // No match found, try to find any connected edge
                  console.log(`[${runId}] No matching choice found for "${userResponse}"`);
                  const anyEdge = edges.find(e => e.source === currentNodeId);
                  if (anyEdge) {
                    currentNodeId = anyEdge.target;
                  } else {
                    continueProcessing = false;
                  }
                }
                break;
              }
              
              // No user input yet, wait
              await supabaseClient
                .from('inbox_flow_sessions')
                .update({
                  current_node_id: currentNodeId,
                  variables,
                  last_interaction: new Date().toISOString(),
                  processing: false,
                  processing_started_at: null,
                })
                .eq('id', sessionId);
              
              continueProcessing = false;
              return new Response(JSON.stringify({ 
                success: true, 
                currentNode: currentNodeId,
                actions: processedActions,
                waitingForInput: true
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            
            const interactionType = (currentNode.data.interactionType as string) || 'button';
            const interactiveText = replaceVariables(currentNode.data.text as string || '', variables);
            const interactiveChoices = (currentNode.data.choices as string[]) || [];
            const interactiveFooterText = replaceVariables(currentNode.data.footerText as string || '', variables);
            const interactiveListButton = replaceVariables(currentNode.data.listButton as string || 'Ver opções', variables);
            const interactiveImageUrl = (currentNode.data.imageUrl as string) || '';
            const interactiveSelectableCount = (currentNode.data.selectableCount as number) || 1;
            
            if (apiProvider === 'uazapi' && instanceUazapiToken && uazapiBaseUrl && interactiveText && interactiveChoices.length > 0) {
              console.log(`[${runId}] Sending interactive block: type=${interactionType}, choices=${interactiveChoices.length}`);
              
              try {
                // Build the request body based on interaction type
                // Maps to UAZAPI /send/menu endpoint with type: button | list | poll
                const interactiveBody: Record<string, unknown> = {
                  number: phone.replace(/\D/g, ''),
                  text: interactiveText,
                  choices: interactiveChoices,
                };
                
                // Set the type and additional fields based on interaction type
                switch (interactionType) {
                  case 'poll':
                    interactiveBody.type = 'poll';
                    interactiveBody.selectableCount = interactiveSelectableCount;
                    break;
                  case 'button':
                    interactiveBody.type = 'button';
                    if (interactiveFooterText) {
                      interactiveBody.footerText = interactiveFooterText;
                    }
                    break;
                  case 'imageButton':
                    interactiveBody.type = 'button';
                    if (interactiveFooterText) {
                      interactiveBody.footerText = interactiveFooterText;
                    }
                    if (interactiveImageUrl) {
                      interactiveBody.imageButton = interactiveImageUrl;
                    }
                    break;
                  case 'list':
                    interactiveBody.type = 'list';
                    interactiveBody.listButton = interactiveListButton;
                    if (interactiveFooterText) {
                      interactiveBody.footerText = interactiveFooterText;
                    }
                    break;
                  default:
                    interactiveBody.type = 'button';
                }
                
                console.log(`[${runId}] Interactive block request body:`, JSON.stringify(interactiveBody));
                
                const interactiveResponse = await fetch(`${uazapiBaseUrl}/send/menu`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'token': instanceUazapiToken,
                  },
                  body: JSON.stringify(interactiveBody),
                });
                
                const interactiveResult = await interactiveResponse.json();
                console.log(`[${runId}] Interactive block response:`, JSON.stringify(interactiveResult));
                
                if (interactiveResponse.ok) {
                  const interactiveTypeLabel = interactionType === 'poll' ? 'Enquete' : interactionType === 'list' ? 'Menu Lista' : 'Botões';
                  processedActions.push(`Sent interactive block (${interactiveTypeLabel})`);
                  await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, `[${interactiveTypeLabel}] ${interactiveText}`, 'text', flow.id);
                  
                  // Mark as sent for idempotency
                  sentNodeIds.push(currentNodeId);
                } else {
                  console.error(`[${runId}] Interactive block error:`, interactiveResult);
                  processedActions.push(`Interactive block error: ${JSON.stringify(interactiveResult)}`);
                }
              } catch (interactiveErr) {
                console.error(`[${runId}] Interactive block exception:`, interactiveErr);
                processedActions.push('Interactive block error');
              }
            } else if (apiProvider !== 'uazapi') {
              // For non-UazAPI, send as regular text message with options
              const fallbackMessage = `${interactiveText}\n\n${interactiveChoices.map((c, i) => `${i + 1}. ${c.split('|')[0]}`).join('\n')}`;
              const fallbackResult = await sendMessage(effectiveBaseUrl, effectiveApiKey, instanceName, phone, fallbackMessage, 'text', undefined, undefined, apiProvider, instanceUazapiToken);
              if (fallbackResult.ok) {
                await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, fallbackMessage, 'text', flow.id);
                sentNodeIds.push(currentNodeId);
                processedActions.push('Sent interactive block as text (fallback)');
              } else {
                processedActions.push('Interactive block fallback failed');
              }
            } else {
              console.log(`[${runId}] Missing interactive block configuration`);
              processedActions.push('Interactive block skipped (missing config)');
            }
            
            // Wait for user input after sending - save state and release lock
            await supabaseClient
              .from('inbox_flow_sessions')
              .update({
                current_node_id: currentNodeId,
                variables,
                last_interaction: new Date().toISOString(),
                processing: false,
                processing_started_at: null,
              })
              .eq('id', sessionId);
            
            processedActions.push('Waiting for user selection');
            continueProcessing = false;
            
            // Return early - lock already released in the update above
            return new Response(JSON.stringify({ 
              success: true, 
              currentNode: currentNodeId,
              actions: processedActions,
              waitingForInput: true
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

          default:
            console.log(`[${runId}] Unknown node type: ${currentNode.type}`);
            const defaultEdge = edges.find(e => e.source === currentNodeId);
            if (defaultEdge) {
              currentNodeId = defaultEdge.target;
            } else {
              continueProcessing = false;
            }
        }
      }

      // If send failed, return error response
      if (sendFailed) {
        console.log(`[${runId}] === PROCESS-INBOX-FLOW END (SEND FAILED) ===`);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Message send failed',
          currentNode: currentNodeId,
          actions: processedActions,
          lastError: variables._last_send_error
        }), {
          status: 200, // Still 200 to not trigger retries
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update session with final state and release lock
      await supabaseClient
        .from('inbox_flow_sessions')
        .update({
          current_node_id: currentNodeId,
          variables,
          last_interaction: new Date().toISOString(),
          processing: false,
          processing_started_at: null,
        })
        .eq('id', sessionId);

      console.log(`[${runId}] === PROCESS-INBOX-FLOW END ===`);
      return new Response(JSON.stringify({ 
        success: true, 
        currentNode: currentNodeId,
        actions: processedActions 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (processingError) {
      // On error, release the lock
      await releaseLock();
      throw processingError;
    }

  } catch (err) {
    const error = err as Error;
    console.error(`[${runId}] Process flow error:`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function replaceVariables(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = normalizeVarKey(String(rawKey));
    return String(variables[key] ?? '');
  });
}

// Normalize variable keys coming from the builder (e.g. "{{Respondeu}}")
function normalizeVarKey(input: string): string {
  return String(input || '').replace(/\{\{|\}\}/g, '').trim();
}

// Normalize values for comparison (case-insensitive, trims, removes accents)
function normalizeComparable(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Send presence status (typing, recording) before sending a message
async function sendPresence(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  presenceType: 'composing' | 'recording',
  delayMs: number
): Promise<void> {
  const formattedPhone = phone.replace(/\D/g, '');

  const presenceCandidates = presenceType === 'composing'
    ? ['composing', 'typing']
    : ['recording', 'recording_audio', 'recordingAudio'];

  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };

  console.log(`Sending ${presenceType} presence to ${formattedPhone} for ${delayMs}ms`);

  const payloadsFor = (presence: string) => ([
    { number: formattedPhone, options: { delay: delayMs, presence } },
    { number: formattedPhone, options: { delay: Math.ceil(delayMs / 1000), presence } },
    { number: formattedPhone, delay: delayMs, presence },
    { number: formattedPhone, delay: Math.ceil(delayMs / 1000), presence },
  ]);

  let ok = false;

  try {
    for (const presence of presenceCandidates) {
      for (const body of payloadsFor(presence)) {
        console.log('Presence attempt:', { presence, body });
        const response = await fetch(`${baseUrl}/chat/sendPresence/${instanceName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (response.ok) {
          ok = true;
          console.log(`Presence ${presence} sent successfully`);
          break;
        }

        const errorText = await response.text().catch(() => '');
        console.warn(`Presence attempt failed (${response.status}):`, errorText);
      }

      if (ok) break;
    }

    // Only wait if we actually managed to send presence
    if (ok) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  } catch (error) {
    console.error('Error sending presence:', error);
    // presence is optional, continue with sending the message
  }
}

interface SendMessageResult {
  ok: boolean;
  remoteMessageId: string | null;
  errorDetails: string | null;
}

async function sendMessage(
  baseUrl: string,
  apiKey: string,
  instanceName: string, 
  phone: string, 
  content: string, 
  messageType: string, 
  mediaUrl?: string,
  fileName?: string,
  apiProvider: string = 'evolution',
  instanceToken?: string,
  delayMs: number = 0
): Promise<SendMessageResult> {
  const formattedPhone = phone.replace(/\D/g, '');
  
  let endpoint = '';
  let body: Record<string, unknown> = {};
  let authHeader: Record<string, string> = {};

  if (apiProvider === 'uazapi') {
    // UazAPI v2 (OpenAPI):
    // - Auth header: token (instance token)
    // - Send text: POST /send/text with { number, text, delay? }
    // - Send media: POST /send/media with { number, type, file, text?, docName?, delay? }
    // - delay is in milliseconds and shows "typing..." or "recording audio..." before sending
    authHeader = { 'token': instanceToken || apiKey };

    // Base delay parameter - if delay > 0, include it to show presence status
    const delayParam = delayMs > 0 ? { delay: delayMs } : {};

    switch (messageType) {
      case 'text':
        endpoint = `/send/text`;
        body = { number: formattedPhone, text: content, ...delayParam };
        break;
      case 'image':
        endpoint = `/send/media`;
        body = { number: formattedPhone, type: 'image', file: mediaUrl, ...(content ? { text: content } : {}), ...delayParam };
        break;
      case 'audio':
        // UazAPI uses 'ptt' (push-to-talk) for voice messages - shows "recording audio..."
        endpoint = `/send/media`;
        body = { number: formattedPhone, type: 'ptt', file: mediaUrl, ...delayParam };
        break;
      case 'video':
        endpoint = `/send/media`;
        body = { number: formattedPhone, type: 'video', file: mediaUrl, ...(content ? { text: content } : {}), ...delayParam };
        break;
      case 'document':
        endpoint = `/send/media`;
        body = { number: formattedPhone, type: 'document', file: mediaUrl, docName: fileName || 'document', ...(content ? { text: content } : {}), ...delayParam };
        break;
      default:
        console.log(`Unknown message type: ${messageType}`);
        return { ok: false, remoteMessageId: null, errorDetails: `Unknown message type: ${messageType}` };
    }
  } else {
    // Evolution API endpoints - use apikey header
    authHeader = { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` };
    
    switch (messageType) {
      case 'text':
        endpoint = `/message/sendText/${instanceName}`;
        body = { number: formattedPhone, text: content };
        break;
      case 'image':
        endpoint = `/message/sendMedia/${instanceName}`;
        body = { number: formattedPhone, mediatype: 'image', media: mediaUrl, caption: content };
        break;
      case 'audio':
        endpoint = `/message/sendWhatsAppAudio/${instanceName}`;
        body = { number: formattedPhone, audio: mediaUrl };
        break;
      case 'video':
        endpoint = `/message/sendMedia/${instanceName}`;
        body = { number: formattedPhone, mediatype: 'video', media: mediaUrl, caption: content };
        break;
      case 'document':
        endpoint = `/message/sendMedia/${instanceName}`;
        body = { number: formattedPhone, mediatype: 'document', media: mediaUrl, fileName: fileName || 'document' };
        break;
      default:
        console.log(`Unknown message type: ${messageType}`);
        return { ok: false, remoteMessageId: null, errorDetails: `Unknown message type: ${messageType}` };
    }
  }

  console.log(`[${apiProvider.toUpperCase()}] Sending ${messageType} to ${formattedPhone} via ${endpoint}`);
  console.log('Request body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`API response (${response.status}):`, responseText);
    
    if (!response.ok) {
      console.error(`Failed to send ${messageType}:`, responseText);
      return { ok: false, remoteMessageId: null, errorDetails: responseText };
    }
    
    // Parse response to extract message ID
    let remoteMessageId: string | null = null;
    try {
      const responseData = JSON.parse(responseText);
      remoteMessageId = responseData?.key?.id || responseData?.id || responseData?.messageId || null;
      console.log(`Extracted remoteMessageId: ${remoteMessageId}`);
    } catch (parseErr) {
      console.log('Could not parse API response for message ID:', parseErr);
    }
    
    return { ok: true, remoteMessageId, errorDetails: null };
  } catch (error) {
    console.error(`Error sending ${messageType}:`, error);
    return { ok: false, remoteMessageId: null, errorDetails: String(error) };
  }
}

async function saveOutboundMessage(
  supabaseClient: any,
  contactId: string,
  instanceId: string,
  userId: string,
  content: string,
  messageType: string,
  flowId: string,
  mediaUrl?: string,
  remoteMessageId?: string | null,
  status: 'sent' | 'failed' | 'pending' = 'sent'
) {
  // If we have a remoteMessageId, check if message already exists (to prevent duplicates)
  if (remoteMessageId) {
    const { data: existing } = await supabaseClient
      .from('inbox_messages')
      .select('id')
      .eq('remote_message_id', remoteMessageId)
      .maybeSingle();
    
    if (existing) {
      console.log(`Message with remoteMessageId ${remoteMessageId} already exists, skipping insert`);
      return;
    }
  }

  const { error } = await supabaseClient
    .from('inbox_messages')
    .insert({
      contact_id: contactId,
      instance_id: instanceId,
      user_id: userId,
      direction: 'outbound',
      message_type: messageType,
      content,
      media_url: mediaUrl || null,
      status,
      is_from_flow: true,
      flow_id: flowId,
      remote_message_id: remoteMessageId || null,
    });

  if (error) {
    console.error('Error saving outbound message:', error);
  }
}
