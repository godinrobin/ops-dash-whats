import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Brazilian valid DDDs
const validBrazilianDDDs = [
  '11', '12', '13', '14', '15', '16', '17', '18', '19', // São Paulo
  '21', '22', '24', // Rio de Janeiro
  '27', '28', // Espírito Santo
  '31', '32', '33', '34', '35', '37', '38', // Minas Gerais
  '41', '42', '43', '44', '45', '46', // Paraná
  '47', '48', '49', // Santa Catarina
  '51', '53', '54', '55', // Rio Grande do Sul
  '61', // Distrito Federal
  '62', '64', // Goiás
  '63', // Tocantins
  '65', '66', // Mato Grosso
  '67', // Mato Grosso do Sul
  '68', // Acre
  '69', // Rondônia
  '71', '73', '74', '75', '77', // Bahia
  '79', // Sergipe
  '81', '87', // Pernambuco
  '82', // Alagoas
  '83', // Paraíba
  '84', // Rio Grande do Norte
  '85', '88', // Ceará
  '86', '89', // Piauí
  '91', '93', '94', // Pará
  '92', '97', // Amazonas
  '95', // Roraima
  '96', // Amapá
  '98', '99', // Maranhão
];

// Normalize phone number to always have +55 for Brazilian numbers
const normalizePhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  
  // If already has 55 prefix (12-13 digits), it's correct
  if (cleaned.startsWith('55') && cleaned.length >= 12 && cleaned.length <= 13) {
    return cleaned;
  }
  
  // If 10-11 digits and starts with valid Brazilian DDD, add 55
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const possibleDDD = cleaned.slice(0, 2);
    if (validBrazilianDDDs.includes(possibleDDD)) {
      return '55' + cleaned;
    }
  }
  
  // Return as-is for other cases
  return cleaned;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Reprocessing contacts for user:', user.id);

    // Get all instances for this user with their names/labels
    const { data: instances, error: instancesError } = await supabaseClient
      .from('maturador_instances')
      .select('id, instance_name, label, phone_number')
      .eq('user_id', user.id);

    if (instancesError) {
      console.error('Error fetching instances:', instancesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch instances' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a map of instance names/labels for checking suspicious pushNames
    const instanceIdentifiers = new Set<string>();
    for (const inst of instances || []) {
      if (inst.instance_name) instanceIdentifiers.add(inst.instance_name.toLowerCase().trim());
      if (inst.label) instanceIdentifiers.add(inst.label.toLowerCase().trim());
    }

    const isSuspiciousName = (name: string | null): boolean => {
      if (!name) return false;
      const nameLower = name.toLowerCase().trim();
      for (const identifier of instanceIdentifiers) {
        if (nameLower === identifier || nameLower.includes(identifier) || identifier.includes(nameLower)) {
          return true;
        }
      }
      return false;
    };

    // Get all contacts for this user
    const { data: contacts, error: contactsError } = await supabaseClient
      .from('inbox_contacts')
      .select('id, phone, name, instance_id')
      .eq('user_id', user.id);

    if (contactsError) {
      console.error('Error fetching contacts:', contactsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch contacts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let phonesNormalized = 0;
    let namesCleaned = 0;
    let totalProcessed = 0;

    for (const contact of contacts || []) {
      const updates: Record<string, any> = {};
      
      // Normalize phone number
      const normalizedPhone = normalizePhone(contact.phone);
      if (normalizedPhone !== contact.phone) {
        updates.phone = normalizedPhone;
        phonesNormalized++;
        console.log(`Normalizing phone: ${contact.phone} -> ${normalizedPhone}`);
      }
      
      // Clear suspicious name (matches instance name/label)
      if (contact.name && isSuspiciousName(contact.name)) {
        updates.name = null;
        namesCleaned++;
        console.log(`Clearing suspicious name for ${contact.phone}: "${contact.name}"`);
      }
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('inbox_contacts')
          .update(updates)
          .eq('id', contact.id);
        
        if (updateError) {
          console.error(`Error updating contact ${contact.id}:`, updateError);
        } else {
          totalProcessed++;
        }
      }
    }

    console.log(`Reprocessing complete: ${phonesNormalized} phones normalized, ${namesCleaned} names cleaned, ${totalProcessed} total updated`);

    return new Response(JSON.stringify({
      success: true,
      phonesNormalized,
      namesCleaned,
      totalProcessed,
      totalContacts: contacts?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in reprocess-inbox-contacts:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
