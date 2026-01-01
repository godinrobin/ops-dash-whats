import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, Loader2, Tag, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UserTagStats {
  user_id: string;
  email: string;
  username: string;
  total_labels: number;
}

export function AdminTagWhatsLabels() {
  const [stats, setStats] = useState<UserTagStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch tag_whats_logs grouped by user_id with count
      const { data: logsData, error: logsError } = await (supabase
        .from('tag_whats_logs' as any)
        .select('user_id')
        .eq('label_applied', true) as any);

      if (logsError) throw logsError;

      // Count labels per user
      const userCounts: Record<string, number> = {};
      (logsData || []).forEach((log: any) => {
        if (log.user_id) {
          userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
        }
      });

      // Fetch user info for those users
      const userIds = Object.keys(userCounts);
      if (userIds.length === 0) {
        setStats([]);
        setLoading(false);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Build stats
      const result: UserTagStats[] = (profilesData || []).map((profile: any) => ({
        user_id: profile.id,
        email: profile.username || profile.id.substring(0, 8),
        username: profile.username || 'N/A',
        total_labels: userCounts[profile.id] || 0
      }));

      // Sort by total_labels
      result.sort((a, b) => 
        sortOrder === 'desc' ? b.total_labels - a.total_labels : a.total_labels - b.total_labels
      );

      setStats(result);
    } catch (error) {
      console.error('Error fetching tag whats stats:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sortOrder]);

  const toggleSort = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const totalAllLabels = stats.reduce((sum, s) => sum + s.total_labels, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-emerald-500" />
            <CardTitle>Etiquetas Tag Whats por Usuário</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="flex items-center gap-4 mb-4 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
          <div>
            <p className="text-sm text-muted-foreground">Total de Usuários</p>
            <p className="text-2xl font-bold text-emerald-500">{stats.length}</p>
          </div>
          <div className="border-l border-emerald-500/30 pl-4">
            <p className="text-sm text-muted-foreground">Total de Etiquetas</p>
            <p className="text-2xl font-bold text-emerald-500">{totalAllLabels}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma etiqueta aplicada ainda</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={toggleSort}
                    className="gap-1 -ml-3"
                  >
                    Total de Etiquetas
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground ml-1">
                      ({sortOrder === 'desc' ? 'maior' : 'menor'})
                    </span>
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((stat) => (
                <TableRow key={stat.user_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{stat.username}</p>
                      <p className="text-xs text-muted-foreground">{stat.user_id.substring(0, 8)}...</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-lg font-semibold text-emerald-500">{stat.total_labels}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
