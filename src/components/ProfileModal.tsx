import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useSplashedToast";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileModal = ({ open, onOpenChange }: ProfileModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha todos os campos de senha",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Senhas não conferem",
        description: "A nova senha e a confirmação devem ser iguais",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao alterar senha",
        description: error.message,
      });
    } else {
      toast({
        title: "Senha alterada com sucesso!",
        description: "Sua nova senha já está ativa",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border-accent/50">
          <DialogHeader>
            <DialogTitle>Meu Perfil</DialogTitle>
            <DialogDescription>
              Visualize suas informações e configurações
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* User Info */}
            <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border">
              <div>
                <Label className="text-muted-foreground text-sm">Email</Label>
                <p className="font-medium">{user?.email}</p>
              </div>
            </div>


            {/* Change Password Form */}
            <form id="password-section" onSubmit={handleChangePassword} className="space-y-4">
              <h3 className="font-semibold text-sm">Alterar Senha</h3>
              
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Digite a nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="focus-visible:ring-accent focus-visible:border-accent"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirme a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="focus-visible:ring-accent focus-visible:border-accent"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={loading}
              >
                {loading ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
