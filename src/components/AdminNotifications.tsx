import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { toast } from "sonner";
import { Wallet, MessageSquare, ShoppingCart, Package } from "lucide-react";

interface Notification {
  id: string;
  user_email: string;
  action_type: string;
  action_description: string;
  amount: number | null;
  created_at: string;
}

const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case "deposit":
      return <Wallet className="h-4 w-4 text-green-500" />;
    case "sms_purchase":
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case "smm_purchase":
      return <ShoppingCart className="h-4 w-4 text-purple-500" />;
    case "marketplace_purchase":
      return <Package className="h-4 w-4 text-orange-500" />;
    default:
      return <ShoppingCart className="h-4 w-4" />;
  }
};

const getActionTitle = (actionType: string) => {
  switch (actionType) {
    case "deposit":
      return "💰 Novo Depósito";
    case "sms_purchase":
      return "📱 Compra SMS Bot";
    case "smm_purchase":
      return "📊 Compra Painel Marketing";
    case "marketplace_purchase":
      return "🛒 Compra Marketplace";
    default:
      return "🔔 Nova Atividade";
  }
};

export const AdminNotifications = () => {
  const { isAdmin, loading } = useAdminStatus();
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (loading || !isAdmin) return;

    // Subscribe to realtime notifications
    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const notification = payload.new as Notification;
          
          // Avoid duplicate toasts
          if (processedIds.has(notification.id)) return;
          
          setProcessedIds((prev) => new Set([...prev, notification.id]));

          const title = getActionTitle(notification.action_type);
          const description = `${notification.user_email}\n${notification.action_description}${
            notification.amount ? ` - R$ ${notification.amount.toFixed(2)}` : ""
          }`;

          toast(title, {
            description,
            duration: 8000,
            icon: getActionIcon(notification.action_type),
          });

          // Mark as read
          supabase
            .from("admin_notifications")
            .update({ is_read: true })
            .eq("id", notification.id)
            .then();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loading, processedIds]);

  // This component doesn't render anything - it just listens for notifications
  return null;
};
