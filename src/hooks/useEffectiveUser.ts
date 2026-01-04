import { useAuth } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";

/**
 * Hook that returns the effective user ID and email.
 * When admin is impersonating a user, returns the impersonated user's data.
 * Otherwise returns the logged-in user's data.
 */
export const useEffectiveUser = () => {
  const { user } = useAuth();
  const { isImpersonating, impersonatedUserId, impersonatedEmail } = useImpersonation();

  // When impersonating, use the impersonated user's ID and email
  if (isImpersonating && impersonatedUserId) {
    return {
      effectiveUserId: impersonatedUserId,
      effectiveEmail: impersonatedEmail,
      isImpersonating: true,
      realUserId: user?.id || null,
      realEmail: user?.email || null,
    };
  }

  // Otherwise, use the real user's data
  return {
    effectiveUserId: user?.id || null,
    effectiveEmail: user?.email || null,
    isImpersonating: false,
    realUserId: user?.id || null,
    realEmail: user?.email || null,
  };
};

export default useEffectiveUser;
