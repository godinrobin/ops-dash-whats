import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_BASE_URL = 'https://api.chatwp.xyz';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

// Maximum delay we can handle in a single edge function call (20 seconds to be safe)
const MAX_INLINE_DELAY_MS = 20000;
// Lock timeout in milliseconds (60 seconds - if a lock is older than this, consider it stale)
const LOCK_TIMEOUT_MS = 60000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sessionId, userInput, resumeFromDelay } = await req.json();
    console.log('=== PROCESS-INBOX-FLOW START ===');
    console.log('SessionId:', sessionId, 'Input:', userInput, 'ResumeFromDelay:', resumeFromDelay);

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
      console.error('Session not found:', sessionError);
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if session is already completed - do not process
    if (session.status === 'completed') {
      console.log('Session already completed, skipping');
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
        console.log(`Session ${sessionId} is locked by another process (lock age: ${lockAge}ms), skipping`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: 'session_locked',
          lockAge 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`Session ${sessionId} has stale lock (${lockAge}ms), taking over`);
    }

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

    // If user provided input, store it and move to next node IMMEDIATELY (checkpoint)
    if (userInput !== undefined && userInput !== null) {
      const currentNode = nodes.find(n => n.id === currentNodeId);
      if (currentNode?.type === 'waitInput' && currentNode.data.variableName) {
        variables[currentNode.data.variableName as string] = userInput;
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
      
      console.log(`Checkpoint saved: moved from ${session.current_node_id} to ${currentNodeId} after receiving input`);
    }

    // Acquire lock (with checkpoint if userInput was provided)
    const { error: lockError } = await supabaseClient
      .from('inbox_flow_sessions')
      .update(lockUpdate)
      .eq('id', sessionId);
    
    if (lockError) {
      console.error('Failed to acquire lock:', lockError);
      return new Response(JSON.stringify({ error: 'Failed to acquire lock' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`Lock acquired for session ${sessionId}`);

    // Helper function to release lock
    const releaseLock = async () => {
      await supabaseClient
        .from('inbox_flow_sessions')
        .update({ processing: false, processing_started_at: null })
        .eq('id', sessionId);
      console.log(`Lock released for session ${sessionId}`);
    };

    try {
      // Check if we're resuming from a scheduled delay
      if (resumeFromDelay) {
        const pendingDelay = variables._pendingDelay as { nodeId: string; resumeAt: number } | undefined;
        if (pendingDelay) {
          const now = Date.now();
          if (now < pendingDelay.resumeAt) {
            // Still waiting - reschedule
            const remainingMs = pendingDelay.resumeAt - now;
            console.log(`Still waiting for delay, ${remainingMs}ms remaining`);
            await releaseLock();
            return new Response(JSON.stringify({ 
              success: true, 
              waiting: true, 
              remainingMs 
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          // Delay completed - move to next node
          console.log('Delay completed, resuming flow from node:', pendingDelay.nodeId);
          const delayEdge = edges.find(e => e.source === pendingDelay.nodeId);
          if (delayEdge) {
            currentNodeId = delayEdge.target;
          }
          // Clear pending delay
          delete variables._pendingDelay;
        }
      }

      // Get instance for sending messages
      const { data: instance } = await supabaseClient
        .from('maturador_instances')
        .select('instance_name')
        .eq('id', session.instance_id)
        .single();

      const instanceName = instance?.instance_name;
      const phone = contact.phone;

      // Process nodes until we hit a wait point or end
      let continueProcessing = true;
      const processedActions: string[] = [];

      while (continueProcessing) {
        const currentNode = nodes.find(n => n.id === currentNodeId);
        
        if (!currentNode) {
          console.log('Node not found, ending flow');
          continueProcessing = false;
          break;
        }

        console.log(`Processing node: ${currentNode.type} (${currentNodeId})`);

        switch (currentNode.type) {
          case 'start':
            // Just move to next node
            const startEdge = edges.find(e => e.source === currentNodeId);
            if (startEdge) {
              currentNodeId = startEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'text':
            // Send text message
            const message = replaceVariables(currentNode.data.message as string || '', variables);
            if (instanceName && phone && message) {
              await sendMessage(instanceName, phone, message, 'text');
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, message, 'text', flow.id);
              processedActions.push(`Sent text: ${message.substring(0, 50)}`);
            }
            
            const textEdge = edges.find(e => e.source === currentNodeId);
            if (textEdge) {
              currentNodeId = textEdge.target;
            } else {
              continueProcessing = false;
            }
            break;

          case 'image':
          case 'audio':
          case 'video':
          case 'document':
            const mediaUrl = currentNode.data.mediaUrl as string;
            const caption = replaceVariables(currentNode.data.caption as string || '', variables);
            const fileName = currentNode.data.fileName as string || '';
            
            console.log(`=== Processing ${currentNode.type} node ===`);
            console.log('Node data:', JSON.stringify(currentNode.data, null, 2));
            console.log('mediaUrl:', mediaUrl);
            console.log('caption:', caption);
            console.log('fileName:', fileName);
            console.log('instanceName:', instanceName);
            console.log('phone:', phone);
            
            if (instanceName && phone && mediaUrl) {
              console.log(`Sending ${currentNode.type} message...`);
              // For images/videos, send caption. For documents, send fileName.
              // DO NOT send fileName as caption for image/video - that causes the filename to appear to the user
              const contentToSend = currentNode.type === 'document' ? fileName : caption;
              await sendMessage(instanceName, phone, contentToSend, currentNode.type, mediaUrl, fileName);
              // Save the caption (not filename) as content for display purposes
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, caption || '', currentNode.type, flow.id, mediaUrl);
              processedActions.push(`Sent ${currentNode.type}: ${caption || fileName || 'media'}`);
              console.log(`${currentNode.type} sent successfully`);
            } else {
              console.log(`Skipping ${currentNode.type} - missing required data:`, {
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
              console.log(`Variable delay: random value ${delay} between ${minDelay} and ${maxDelay}`);
            } else {
              delay = (currentNode.data.delay as number) || 5;
            }
            
            let delayMs = delay * 1000;
            if (unit === 'minutes') delayMs = delay * 60 * 1000;
            if (unit === 'hours') delayMs = delay * 60 * 60 * 1000;
            
            const unitLabel = unit === 'seconds' ? 's' : unit === 'minutes' ? 'min' : 'h';
            
            // Check if delay is longer than what we can handle inline
            if (delayMs > MAX_INLINE_DELAY_MS) {
              // Schedule the delay using the job queue for robust processing
              const resumeAt = new Date(Date.now() + delayMs);
              variables._pendingDelay = {
                nodeId: currentNodeId,
                resumeAt: resumeAt.getTime(),
                delayMs,
              };
              
              console.log(`Long delay detected: ${delay} ${unit} (${delayMs}ms). Scheduling resume at ${resumeAt.toISOString()}`);
              
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
                console.error('Error inserting delay job:', jobError);
              } else {
                console.log(`Delay job created for session ${sessionId}, will run at ${resumeAt.toISOString()}`);
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
            console.log(`Short delay: waiting ${delayMs}ms`);
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
            // Stop and wait for user input - save state and release lock
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
            
            processedActions.push('Waiting for user input');
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
              .single();
            
            const contactTags = (freshContact?.tags as string[]) || [];
            console.log(`Condition node: checking ${conditions.length} conditions, contact tags:`, contactTags);
            console.log(`Session variables:`, variables);
            
            const evaluateCondition = (cond: typeof conditions[0]): boolean => {
              if (cond.type === 'tag') {
                const tagToCheck = (cond.tagName || '').trim();
                const hasTag = contactTags.some(t => t.toLowerCase() === tagToCheck.toLowerCase());
                const result = cond.tagCondition === 'has' ? hasTag : !hasTag;
                console.log(`Tag condition: "${tagToCheck}" ${cond.tagCondition} -> hasTag=${hasTag}, result=${result}`);
                return result;
              }
              
              // Variable condition - normalize variable name (remove {{ }})
              const varName = (cond.variable || '').replace(/\{\{|\}\}/g, '').trim();
              const varValue = String(variables[varName] || '');
              const compareValue = cond.value || '';
              
              console.log(`Variable condition: ${varName}="${varValue}" ${cond.operator} "${compareValue}"`);
              
              let result: boolean;
              switch (cond.operator) {
                case 'equals': result = varValue.toLowerCase() === compareValue.toLowerCase(); break;
                case 'not_equals': result = varValue.toLowerCase() !== compareValue.toLowerCase(); break;
                case 'contains': result = varValue.toLowerCase().includes(compareValue.toLowerCase()); break;
                case 'not_contains': result = !varValue.toLowerCase().includes(compareValue.toLowerCase()); break;
                case 'startsWith': result = varValue.toLowerCase().startsWith(compareValue.toLowerCase()); break;
                case 'endsWith': result = varValue.toLowerCase().endsWith(compareValue.toLowerCase()); break;
                case 'greater': result = parseFloat(varValue) > parseFloat(compareValue); break;
                case 'less': result = parseFloat(varValue) < parseFloat(compareValue); break;
                case 'exists': result = varValue !== '' && varValue !== 'undefined'; break;
                case 'not_exists': result = varValue === '' || varValue === 'undefined'; break;
                default: result = varValue.toLowerCase() === compareValue.toLowerCase();
              }
              console.log(`Variable condition result: ${result}`);
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
            
            console.log(`Condition evaluated: ${conditionMet} (${logicOperator}, ${conditions.length} conditions)`);
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
            const menuMessage = replaceVariables(currentNode.data.message as string || '', variables);
            const options = currentNode.data.options as string || '';
            const fullMenuMessage = `${menuMessage}\n\n${options}`;
            
            if (instanceName && phone && fullMenuMessage) {
              await sendMessage(instanceName, phone, fullMenuMessage, 'text');
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, fullMenuMessage, 'text', flow.id);
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
            const varName = currentNode.data.variableName as string || '';
            const varVal = replaceVariables(currentNode.data.value as string || '', variables);
            if (varName) {
              variables[varName] = varVal;
              console.log(`Set variable: ${varName} = ${varVal}`);
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
              
              console.log(`Tag ${tagAction}: ${tagName}, new tags:`, newTags);
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
            const transferMessage = replaceVariables(currentNode.data.message as string || 'Transferindo para atendimento humano...', variables);
            if (instanceName && phone && transferMessage) {
              await sendMessage(instanceName, phone, transferMessage, 'text');
              await saveOutboundMessage(supabaseClient, contact.id, session.instance_id, session.user_id, transferMessage, 'text', flow.id);
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
                  console.error('LOVABLE_API_KEY not configured');
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
                    console.log(`AI response saved to ${saveToVariable}: ${aiContent.substring(0, 100)}`);
                    processedActions.push(`AI generated response (${aiContent.length} chars)`);
                  } else {
                    console.error('AI API error:', await aiResponse.text());
                    processedActions.push('AI error: API request failed');
                  }
                }
              } catch (aiError) {
                console.error('AI node error:', aiError);
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
            const saveResponseTo = currentNode.data.saveResponseTo as string || '';
            
            if (webhookUrl) {
              try {
                const webhookResponse = await fetch(webhookUrl, {
                  method: webhookMethod,
                  headers: {
                    'Content-Type': 'application/json',
                    ...webhookHeaders,
                  },
                  body: webhookMethod !== 'GET' ? webhookBody : undefined,
                });
                
                const responseText = await webhookResponse.text();
                if (saveResponseTo) {
                  try {
                    variables[saveResponseTo] = JSON.parse(responseText);
                  } catch {
                    variables[saveResponseTo] = responseText;
                  }
                }
                console.log(`Webhook ${webhookMethod} ${webhookUrl}: ${webhookResponse.status}`);
                processedActions.push(`Webhook called: ${webhookResponse.status}`);
              } catch (webhookError) {
                console.error('Webhook error:', webhookError);
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

          default:
            console.log(`Unknown node type: ${currentNode.type}`);
            const defaultEdge = edges.find(e => e.source === currentNodeId);
            if (defaultEdge) {
              currentNodeId = defaultEdge.target;
            } else {
              continueProcessing = false;
            }
        }
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

      console.log('=== PROCESS-INBOX-FLOW END ===');
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
    console.error('Process flow error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function replaceVariables(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] || ''));
}

async function sendMessage(
  instanceName: string, 
  phone: string, 
  content: string, 
  messageType: string, 
  mediaUrl?: string,
  fileName?: string
) {
  const formattedPhone = phone.replace(/\D/g, '');
  
  let endpoint = '';
  let body: Record<string, unknown> = {};

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
      body = { 
        number: formattedPhone, 
        mediatype: 'document', 
        media: mediaUrl, 
        fileName: fileName || 'document'
      };
      break;
    default:
      console.log(`Unknown message type: ${messageType}`);
      return;
  }

  console.log(`Sending ${messageType} to ${formattedPhone} via ${endpoint}`);
  console.log('Request body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${EVOLUTION_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`Evolution API response (${response.status}):`, responseText);
    
    if (!response.ok) {
      console.error(`Failed to send ${messageType}:`, responseText);
    }
  } catch (error) {
    console.error(`Error sending ${messageType}:`, error);
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
  mediaUrl?: string
) {
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
      status: 'sent',
      is_from_flow: true,
      flow_id: flowId,
    });

  if (error) {
    console.error('Error saving outbound message:', error);
  }
}
