import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AccessValidation {
  isValid: boolean;
  userId: string | null;
  isFullMember: boolean;
  isAdmin: boolean;
  isSemiFullMember: boolean;
  error?: string;
}

/**
 * Validates user access for Edge Functions
 * 
 * @param authHeader - The Authorization header from the request
 * @param requiredAccess - Level of access required:
 *   - 'authenticated': Just needs to be logged in
 *   - 'member': Needs to be a full member, semi-full member, or admin
 *   - 'admin': Needs to have admin role
 * @returns AccessValidation object with user info and validation status
 */
export async function validateUserAccess(
  authHeader: string | null,
  requiredAccess: 'authenticated' | 'member' | 'admin' = 'member'
): Promise<AccessValidation> {
  // Check for authorization header
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      isValid: false,
      userId: null,
      isFullMember: false,
      isAdmin: false,
      isSemiFullMember: false,
      error: 'Missing or invalid authorization header'
    };
  }

  // Extract and validate JWT structure (must have 3 parts separated by dots)
  const token = authHeader.replace('Bearer ', '');
  const jwtParts = token.split('.');
  if (jwtParts.length !== 3 || jwtParts.some(part => part.length === 0)) {
    console.error('[SECURITY] Malformed JWT detected - invalid structure');
    return {
      isValid: false,
      userId: null,
      isFullMember: false,
      isAdmin: false,
      isSemiFullMember: false,
      error: 'Malformed token'
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      isValid: false,
      userId: null,
      isFullMember: false,
      isAdmin: false,
      isSemiFullMember: false,
      error: 'Server configuration error'
    };
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  try {
    // Validate JWT and get claims (token already extracted and validated above)
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return {
        isValid: false,
        userId: null,
        isFullMember: false,
        isAdmin: false,
        isSemiFullMember: false,
        error: 'Invalid or expired token'
      };
    }

    const userId = claimsData.claims.sub as string;

    if (!userId) {
      return {
        isValid: false,
        userId: null,
        isFullMember: false,
        isAdmin: false,
        isSemiFullMember: false,
        error: 'User ID not found in token'
      };
    }

    // If only authentication is required, return success
    if (requiredAccess === 'authenticated') {
      return {
        isValid: true,
        userId,
        isFullMember: false,
        isAdmin: false,
        isSemiFullMember: false
      };
    }

    // Fetch user profile and admin role in parallel
    const [profileResult, roleResult] = await Promise.all([
      supabaseClient
        .from('profiles')
        .select('is_full_member, is_semi_full_member, credits_system_test_user')
        .eq('id', userId)
        .maybeSingle(),
      supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
    ]);

    const isAdmin = !!roleResult.data;
    const isFullMember = profileResult.data?.is_full_member ?? false;
    const isSemiFullMember = profileResult.data?.is_semi_full_member ?? false;
    const isCreditsTestUser = profileResult.data?.credits_system_test_user ?? false;

    // Determine effective access level
    // Admin, full member, semi-full member, or credits test user = has member access
    const hasMemberAccess = isAdmin || isFullMember || isSemiFullMember || isCreditsTestUser;

    // Validate based on required access level
    if (requiredAccess === 'admin') {
      if (!isAdmin) {
        return {
          isValid: false,
          userId,
          isFullMember,
          isAdmin,
          isSemiFullMember,
          error: 'Admin access required'
        };
      }
    } else if (requiredAccess === 'member') {
      if (!hasMemberAccess) {
        return {
          isValid: false,
          userId,
          isFullMember,
          isAdmin,
          isSemiFullMember,
          error: 'Premium membership required'
        };
      }
    }

    return {
      isValid: true,
      userId,
      isFullMember,
      isAdmin,
      isSemiFullMember
    };

  } catch (error) {
    console.error('Error in validateUserAccess:', error);
    return {
      isValid: false,
      userId: null,
      isFullMember: false,
      isAdmin: false,
      isSemiFullMember: false,
      error: 'Internal validation error'
    };
  }
}

/**
 * Helper to create a 403 Forbidden response
 */
export function forbiddenResponse(message: string, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status: 403, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

/**
 * Helper to create a 401 Unauthorized response  
 */
export function unauthorizedResponse(message: string, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
