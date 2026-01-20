import { LogOut, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface ImpersonationBannerProps {
  userEmail: string;
  onExit: () => void;
}

export const ImpersonationBanner = ({ userEmail, onExit }: ImpersonationBannerProps) => {
  return (
    <motion.div
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 left-0 right-0 z-[60] bg-destructive text-destructive-foreground py-2 px-4 shadow-lg"
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCircle className="h-5 w-5" />
          <span className="font-medium">
            Você está logado como: <span className="font-bold">{userEmail}</span>
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onExit}
          className="bg-white/20 hover:bg-white/30 text-white border-white/30"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair da Conta
        </Button>
      </div>
    </motion.div>
  );
};