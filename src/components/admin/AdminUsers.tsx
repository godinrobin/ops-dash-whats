import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Key, LogIn, Loader2, X, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UserData {
  id: string;
  email: string;
  username: string;
}

interface AdminUsersProps {
  users: UserData[];
  onRefresh: () => void;
}

export const AdminUsers = ({ users, onRefresh }: AdminUsersProps) => {
  const [search, setSearch] = useState("");
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<UserData | null>(null);

  // Check localStorage for impersonated user on mount
  useState(() => {
    const storedImpersonation = localStorage.getItem('impersonated_user');
    if (storedImpersonation) {
      try {
        setImpersonatedUser(JSON.parse(storedImpersonation));
      } catch (e) {
        localStorage.removeItem('impersonated_user');
      }
    }
  });

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const lowerSearch = search.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(lowerSearch) ||
      (u.username && u.username.toLowerCase().includes(lowerSearch))
    );
  }, [users, search]);

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: selectedUser.email, password: newPassword },
      });

      if (error) throw error;

      toast.success(`Senha de ${selectedUser.email} alterada com sucesso!`);
      setResetPasswordOpen(false);
      setNewPassword("");
      setSelectedUser(null);
    } catch (err: any) {
      console.error("Error resetting password:", err);
      toast.error(err.message || "Erro ao resetar senha");
    } finally {
      setResetting(false);
    }
  };

  const handleImpersonate = async (user: UserData) => {
    setImpersonating(true);
    try {
      // Generate a magic link for the user
      const { data, error } = await supabase.functions.invoke("admin-impersonate-user", {
        body: { userId: user.id },
      });

      if (error) throw error;
      if (!data?.actionLink) throw new Error("Não foi possível gerar o link de acesso");

      // Store the impersonation info
      localStorage.setItem('impersonated_user', JSON.stringify({
        id: user.id,
        email: user.email,
        username: user.username,
      }));
      localStorage.setItem('admin_origin', 'true');

      // Open the magic link in a new tab or redirect
      window.location.href = data.actionLink;
    } catch (err: any) {
      console.error("Error impersonating user:", err);
      toast.error(err.message || "Erro ao entrar na conta do usuário");
    } finally {
      setImpersonating(false);
    }
  };

  const handleExitImpersonation = () => {
    localStorage.removeItem('impersonated_user');
    localStorage.removeItem('admin_origin');
    setImpersonatedUser(null);
    // Redirect to admin panel
    window.location.href = '/#/admin-panel';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-accent" />
          Gerenciar Usuários
        </CardTitle>
        <CardDescription>
          Lista de todos os usuários do sistema. Busque por email e gerencie acessos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Impersonation Banner */}
        {impersonatedUser && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-amber-500" />
              <span className="text-amber-200">
                Você está acessando como: <strong>{impersonatedUser.email}</strong>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExitImpersonation}
              className="border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
            >
              <X className="h-4 w-4 mr-1" />
              Sair da conta
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredUsers.length} de {users.length} usuários
          </span>
        </div>

        {/* Users Table */}
        <div className="rounded-md border max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.username || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setResetPasswordOpen(true);
                        }}
                      >
                        <Key className="h-4 w-4 mr-1" />
                        Senha
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-accent hover:bg-accent/90"
                        onClick={() => handleImpersonate(user)}
                        disabled={impersonating}
                      >
                        {impersonating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <LogIn className="h-4 w-4 mr-1" />
                            Entrar
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Reset Password Dialog */}
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resetar Senha</DialogTitle>
              <DialogDescription>
                Defina uma nova senha para {selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Digite a nova senha (min. 6 caracteres)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={resetting || !newPassword}
                className="bg-accent hover:bg-accent/90"
              >
                {resetting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetando...
                  </>
                ) : (
                  "Resetar Senha"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};