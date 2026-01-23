import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Search, Loader2, Eye, UserCheck, UserX, Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ZapSpyUser {
  id: string;
  user_id: string;
  email: string;
  username: string;
  has_access: boolean;
  expires_at: string | null;
  created_at: string;
}

interface AdminZapSpyUsersProps {
  users: Array<{ id: string; email: string; username: string }>;
}

export const AdminZapSpyUsers = ({ users }: AdminZapSpyUsersProps) => {
  const [zapSpyUsers, setZapSpyUsers] = useState<ZapSpyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  const fetchZapSpyUsers = async () => {
    setLoading(true);
    try {
      // Fetch users with system access for zap_spy
      const { data: accessData, error } = await supabase
        .from('user_system_access')
        .select('*')
        .eq('system_id', 'zap_spy');

      if (error) throw error;

      // Map to users with access info
      const usersWithAccess: ZapSpyUser[] = users.map(user => {
        const access = accessData?.find(a => a.user_id === user.id);
        const isExpired = access?.expires_at ? new Date(access.expires_at) < new Date() : true;
        return {
          id: user.id,
          user_id: user.id,
          email: user.email,
          username: user.username,
          has_access: access ? !isExpired : false,
          expires_at: access?.expires_at || null,
          created_at: access?.purchased_at || '',
        };
      });

      setZapSpyUsers(usersWithAccess);
    } catch (error) {
      console.error('Error fetching Zap Spy users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (users.length > 0) {
      fetchZapSpyUsers();
    }
  }, [users]);

  const toggleAccess = async (userId: string, currentAccess: boolean) => {
    setTogglingUser(userId);
    try {
      if (currentAccess) {
        // Remove access by deleting
        const { error } = await supabase
          .from('user_system_access')
          .delete()
          .eq('user_id', userId)
          .eq('system_id', 'zap_spy');

        if (error) throw error;
        toast.success('Acesso revogado');
      } else {
        // Grant access for 30 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const { error } = await supabase
          .from('user_system_access')
          .upsert({
            user_id: userId,
            system_id: 'zap_spy',
            access_type: 'subscription',
            expires_at: expiresAt.toISOString(),
            purchased_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,system_id'
          });

        if (error) throw error;
        toast.success('Acesso concedido por 30 dias');
      }

      await fetchZapSpyUsers();
    } catch (error) {
      console.error('Error toggling access:', error);
      toast.error('Erro ao alterar acesso');
    } finally {
      setTogglingUser(null);
    }
  };

  const extendAccess = async (userId: string, days: number) => {
    setTogglingUser(userId);
    try {
      const user = zapSpyUsers.find(u => u.user_id === userId);
      const currentExpiry = user?.expires_at ? new Date(user.expires_at) : new Date();
      const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
      newExpiry.setDate(newExpiry.getDate() + days);

      const { error } = await supabase
        .from('user_system_access')
        .upsert({
          user_id: userId,
          system_id: 'zap_spy',
          access_type: 'subscription',
          expires_at: newExpiry.toISOString(),
          purchased_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,system_id'
        });

      if (error) throw error;
      toast.success(`Acesso estendido por +${days} dias`);
      await fetchZapSpyUsers();
    } catch (error) {
      console.error('Error extending access:', error);
      toast.error('Erro ao estender acesso');
    } finally {
      setTogglingUser(null);
    }
  };

  const filteredUsers = zapSpyUsers.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = zapSpyUsers.filter(u => u.has_access).length;
  const expiringSoonCount = zapSpyUsers.filter(u => {
    if (!u.has_access || !u.expires_at) return false;
    const daysLeft = Math.ceil((new Date(u.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 7 && daysLeft > 0;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/20">
                <Eye className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Usuários</p>
                <p className="text-2xl font-bold">{zapSpyUsers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <UserCheck className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Com Acesso</p>
                <p className="text-2xl font-bold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Calendar className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expirando em 7 dias</p>
                <p className="text-2xl font-bold">{expiringSoonCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-accent" />
                Usuários Zap Spy
              </CardTitle>
              <CardDescription>
                Gerencie o acesso ao sistema Zap Spy (2 créditos/mês)
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchZapSpyUsers}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email ou usuário..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const daysLeft = user.expires_at 
                      ? Math.ceil((new Date(user.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null;
                    const isExpiringSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
                    const isExpired = daysLeft !== null && daysLeft <= 0;

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.username || 'Sem nome'}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.has_access && !isExpired ? (
                            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <UserX className="h-3 w-3 mr-1" />
                              Sem acesso
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.expires_at ? (
                            <div className={`text-sm ${isExpiringSoon ? 'text-amber-500' : isExpired ? 'text-red-500' : ''}`}>
                              {isExpired ? (
                                'Expirado'
                              ) : (
                                <>
                                  {format(new Date(user.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                                  {isExpiringSoon && (
                                    <span className="block text-xs">({daysLeft} dias restantes)</span>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {user.has_access && !isExpired && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => extendAccess(user.user_id, 30)}
                                  disabled={togglingUser === user.user_id}
                                >
                                  {togglingUser === user.user_id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    '+30 dias'
                                  )}
                                </Button>
                              </>
                            )}
                            <Switch
                              checked={user.has_access && !isExpired}
                              onCheckedChange={() => toggleAccess(user.user_id, user.has_access && !isExpired)}
                              disabled={togglingUser === user.user_id}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
