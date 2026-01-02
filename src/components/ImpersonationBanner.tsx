import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { User, X } from "lucide-react";

interface ImpersonatedUser {
  id: string;
  email: string;
  username?: string;
}

export const ImpersonationBanner = () => {
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  useEffect(() => {
    const storedImpersonation = localStorage.getItem('impersonated_user');
    const isAdminOrigin = localStorage.getItem('admin_origin');
    
    if (storedImpersonation && isAdminOrigin) {
      try {
        setImpersonatedUser(JSON.parse(storedImpersonation));
      } catch (e) {
        localStorage.removeItem('impersonated_user');
        localStorage.removeItem('admin_origin');
      }
    }
  }, []);

  const handleExit = () => {
    localStorage.removeItem('impersonated_user');
    localStorage.removeItem('admin_origin');
    // Clear auth and redirect to admin
    window.location.href = '/#/admin-panel';
  };

  if (!impersonatedUser) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-black py-2 px-4 flex items-center justify-center gap-4 shadow-lg">
      <div className="flex items-center gap-2">
        <User className="h-5 w-5" />
        <span className="font-medium">
          Você está acessando como: <strong>{impersonatedUser.email}</strong>
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleExit}
        className="bg-white/20 border-black/30 hover:bg-white/40 text-black"
      >
        <X className="h-4 w-4 mr-1" />
        Voltar para Admin
      </Button>
    </div>
  );
};