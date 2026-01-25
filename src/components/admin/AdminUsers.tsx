import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Key, LogIn, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

type MemberType = 'full' | 'semi_full' | 'partial';

interface UserData {
  id: string;
  email: string;
  username: string;
  is_full_member: boolean;
  is_semi_full_member: boolean;
  member_type: MemberType;
}

interface AdminUsersProps {
  onImpersonate: (userId: string, userEmail: string) => void;
}

const getMemberType = (isFullMember: boolean, isSemiFullMember: boolean): MemberType => {
  if (isSemiFullMember) return 'semi_full';
  if (isFullMember) return 'full';
  return 'partial';
};

const getMemberLabel = (type: MemberType): string => {
  switch (type) {
    case 'full': return 'Membro Completo';
    case 'semi_full': return 'Membro Semi-Full';
    case 'partial': return 'Membro Parcial';
  }
};

const getMemberBadgeVariant = (type: MemberType): "default" | "secondary" | "outline" => {
  switch (type) {
    case 'full': return 'default';
    case 'semi_full': return 'outline';
    case 'partial': return 'secondary';
  }
};

export const AdminUsers = ({ onImpersonate }: AdminUsersProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [updatingMember, setUpdatingMember] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-all-data");
      if (error) throw error;

      // Get profiles with is_full_member and is_semi_full_member
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, is_full_member, is_semi_full_member");

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const usersWithDetails = (data.users || []).map((u: any) => {
        const profile = profileMap.get(u.id);
        const isFullMember = profile?.is_full_member ?? true;
        const isSemiFullMember = profile?.is_semi_full_member ?? false;
        return {
          id: u.id,
          email: u.email,
          username: profile?.username || u.email,
          is_full_member: isFullMember,
          is_semi_full_member: isSemiFullMember,
          member_type: getMemberType(isFullMember, isSemiFullMember),
        };
      });

      setUsers(usersWithDetails);
    } catch (err) {
      console.error("Error loading users:", err);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openPasswordDialog = (user: UserData) => {
    setSelectedUser(user);
    setNewPassword("");
    setShowPasswordDialog(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) {
      toast.error("Preencha a nova senha");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setResettingPassword(true);
    try {
      const { error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: selectedUser.email, newPassword }
      });

      if (error) throw error;

      toast.success("Senha alterada com sucesso!");
      setShowPasswordDialog(false);
    } catch (err: any) {
      console.error("Error resetting password:", err);
      toast.error("Erro ao alterar senha: " + (err.message || "Erro desconhecido"));
    } finally {
      setResettingPassword(false);
    }
  };

  const handleMemberTypeChange = async (userId: string, newType: MemberType) => {
    setUpdatingMember(userId);
    try {
      const updates = {
        is_full_member: newType === 'full',
        is_semi_full_member: newType === 'semi_full',
      };

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId 
          ? { ...u, ...updates, member_type: newType }
          : u
      ));

      toast.success(`Tipo de membro alterado para ${getMemberLabel(newType)}`);
    } catch (err: any) {
      console.error("Error updating member type:", err);
      toast.error("Erro ao alterar tipo de membro");
    } finally {
      setUpdatingMember(null);
    }
  };

  const handleImpersonate = (user: UserData) => {
    onImpersonate(user.id, user.email);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-muted-foreground">Usuário</Label>
              <p className="font-medium">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input
                type="password"
                placeholder="Digite a nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleResetPassword} disabled={resettingPassword}>
                {resettingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  "Alterar Senha"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gerenciar Usuários
            </CardTitle>
            <Badge variant="secondary">{filteredUsers.length} usuários</Badge>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Tipo de Membro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>{u.username}</TableCell>
                      <TableCell>
                        <Select
                          value={u.member_type}
                          onValueChange={(value: MemberType) => handleMemberTypeChange(u.id, value)}
                          disabled={updatingMember === u.id}
                        >
                          <SelectTrigger className="w-[180px]">
                            {updatingMember === u.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <SelectValue>
                                <Badge variant={getMemberBadgeVariant(u.member_type)}>
                                  {getMemberLabel(u.member_type)}
                                </Badge>
                              </SelectValue>
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="full">
                              <div className="flex items-center gap-2">
                                <Badge variant="default">Membro Completo</Badge>
                                <span className="text-xs text-muted-foreground">Free tier + navegação</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="semi_full">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">Membro Semi-Full</Badge>
                                <span className="text-xs text-muted-foreground">Navegação, sem free tier</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="partial">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">Membro Parcial</Badge>
                                <span className="text-xs text-muted-foreground">Acesso limitado</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPasswordDialog(u)}
                            title="Alterar senha"
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleImpersonate(u)}
                            title="Entrar como usuário"
                          >
                            <LogIn className="h-4 w-4 mr-1" />
                            Entrar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
