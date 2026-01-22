import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminStatus } from '@/hooks/useAdminStatus';

interface ActiveUsersData {
  onlineNow: number;
  todayLogins: number;
}

export const AdminActiveUsersPanel = () => {
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [data, setData] = useState<ActiveUsersData>({ onlineNow: 0, todayLogins: 0 });
  const [loading, setLoading] = useState(true);

  const fetchActiveUsers = useCallback(async () => {
    if (!isAdmin) return;
    
    try {
      // Get online users (seen in last 2 minutes)
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      
      // Use any cast since types might not be regenerated yet
      const { count: onlineCount } = await (supabase
        .from('user_presence' as any)
        .select('*', { count: 'exact', head: true })
        .gte('last_seen_at', twoMinutesAgo)
        .eq('is_online', true) as any);

      // Get today's unique logins from user_activities
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const { data: todayActivities } = await supabase
        .from('user_activities')
        .select('user_id')
        .gte('created_at', todayStart.toISOString());

      // Count unique users
      const uniqueUsers = new Set(todayActivities?.map((a: any) => a.user_id) || []);

      setData({
        onlineNow: onlineCount || 0,
        todayLogins: uniqueUsers.size,
      });
    } catch (error) {
      console.error('Error fetching active users:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (adminLoading || !isAdmin) return;

    fetchActiveUsers();

    // Set up realtime subscription
    const channel = supabase
      .channel('admin-presence')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        () => {
          fetchActiveUsers();
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchActiveUsers, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isAdmin, adminLoading, fetchActiveUsers]);

  // Don't render anything for non-admins
  if (adminLoading || !isAdmin) return null;

  return (
    <div className="fixed right-4 top-20 z-40 w-56 space-y-3">
      <Card className="border-primary/20 bg-background/95 backdrop-blur shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Activity className="h-5 w-5 text-emerald-500" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse bg-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {loading ? '-' : data.onlineNow}
              </p>
              <p className="text-xs text-muted-foreground">Online agora</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-background/95 backdrop-blur shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10">
              <Users className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {loading ? '-' : data.todayLogins}
              </p>
              <p className="text-xs text-muted-foreground">Acessaram hoje</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Atualiza a cada 30s</span>
      </div>
    </div>
  );
};
