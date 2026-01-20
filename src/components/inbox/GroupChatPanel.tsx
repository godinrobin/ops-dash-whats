import { useState } from 'react';
import { Users, Settings, MessageSquare, Link, UserPlus, LogOut, Shield, Edit, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { WhatsAppGroup } from '@/types/groups';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface GroupChatPanelProps {
  group: WhatsAppGroup | null;
}

export const GroupChatPanel = ({ group }: GroupChatPanelProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [editNameDialog, setEditNameDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editDescDialog, setEditDescDialog] = useState(false);
  const [newGroupDesc, setNewGroupDesc] = useState('');

  if (!group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">Selecione um grupo</h3>
          <p className="text-muted-foreground mt-2">
            Escolha um grupo na lista para ver as mensagens
          </p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleCopyInviteLink = () => {
    toast.info('Funcionalidade de link de convite em desenvolvimento');
  };

  const handleAddMember = () => {
    toast.info('Funcionalidade de adicionar membro em desenvolvimento');
  };

  const handleLeaveGroup = () => {
    toast.info('Funcionalidade de sair do grupo em desenvolvimento');
  };

  const handleSaveGroupName = () => {
    if (!newGroupName.trim()) {
      toast.error('Digite um nome para o grupo');
      return;
    }
    toast.info(`Renomear grupo para "${newGroupName}" - Em desenvolvimento`);
    setEditNameDialog(false);
  };

  const handleSaveGroupDesc = () => {
    toast.info('Salvar descrição - Em desenvolvimento');
    setEditDescDialog(false);
  };

  const handleChangePhoto = () => {
    toast.info('Alterar foto do grupo - Em desenvolvimento');
  };

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <Sheet open={showSettings} onOpenChange={setShowSettings}>
          <SheetTrigger asChild>
            <div className="flex items-center gap-3 cursor-pointer hover:bg-accent/50 p-2 -m-2 rounded-lg transition-colors">
              <Avatar className="h-10 w-10">
                {group.profile_pic_url && (
                  <AvatarImage src={group.profile_pic_url} alt={group.name} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(group.name)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{group.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {group.participant_count} membros
                </p>
              </div>
            </div>
          </SheetTrigger>
          
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurações do Grupo
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(100vh-120px)] mt-6">
              <div className="space-y-6">
                {/* Group Info */}
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <Avatar className="h-24 w-24">
                      {group.profile_pic_url && (
                        <AvatarImage src={group.profile_pic_url} alt={group.name} />
                      )}
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                        {getInitials(group.name)}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                      onClick={handleChangePhoto}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="mt-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <h3 className="font-semibold text-lg">{group.name}</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => {
                          setNewGroupName(group.name);
                          setEditNameDialog(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                    <Badge variant="secondary" className="mt-2">
                      <Users className="h-3 w-3 mr-1" />
                      {group.participant_count} membros
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                {/* Description */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Descrição</Label>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setNewGroupDesc(group.description || '');
                        setEditDescDialog(true);
                      }}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {group.description || 'Nenhuma descrição'}
                  </p>
                </div>
                
                <Separator />
                
                {/* Actions */}
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleCopyInviteLink}
                  >
                    <Link className="h-4 w-4" />
                    Copiar Link de Convite
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleAddMember}
                  >
                    <UserPlus className="h-4 w-4" />
                    Adicionar Membro
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Configurar Permissões
                  </Button>
                  
                  <Separator />
                  
                  <Button
                    variant="destructive"
                    className="w-full justify-start gap-2"
                    onClick={handleLeaveGroup}
                  >
                    <LogOut className="h-4 w-4" />
                    Sair do Grupo
                  </Button>
                </div>
                
                <Separator />
                
                {/* Members Preview */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Membros do Grupo</h4>
                  <p className="text-xs text-muted-foreground">
                    Lista de membros em desenvolvimento...
                  </p>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>

      {/* Messages Area - Placeholder */}
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mb-4" />
          <p>Mensagens do grupo</p>
          <p className="text-sm mt-1">Em desenvolvimento...</p>
        </div>
      </ScrollArea>

      {/* Edit Name Dialog */}
      <Dialog open={editNameDialog} onOpenChange={setEditNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nome do Grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Nome do grupo"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNameDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGroupName}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Description Dialog */}
      <Dialog open={editDescDialog} onOpenChange={setEditDescDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Descrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Descrição do grupo"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDescDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGroupDesc}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
