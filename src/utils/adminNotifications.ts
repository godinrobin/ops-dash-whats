import { supabase } from "@/integrations/supabase/client";

export type NotificationActionType = 
  | "deposit" 
  | "sms_purchase" 
  | "smm_purchase" 
  | "marketplace_purchase";

interface CreateNotificationParams {
  actionType: NotificationActionType;
  actionDescription: string;
  amount?: number;
}

export const createAdminNotification = async ({
  actionType,
  actionDescription,
  amount,
}: CreateNotificationParams): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error("No user logged in");
      return;
    }

    const { error } = await supabase
      .from("admin_notifications")
      .insert({
        user_id: user.id,
        user_email: user.email || "Email não disponível",
        action_type: actionType,
        action_description: actionDescription,
        amount: amount || null,
      });

    if (error) {
      console.error("Error creating admin notification:", error);
    }
  } catch (error) {
    console.error("Error creating admin notification:", error);
  }
};
