import { X, Tag, MessageSquare, Calendar, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InboxContact } from '@/types/inbox';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ContactDetailsProps {
  contact: InboxContact;
  onClose: () => void;
}

export const ContactDetails = ({ contact, onClose }: ContactDetailsProps) => {
  const [notes, setNotes] = useState(contact.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  const handleSaveNotes = async () => {
    try {
      const { error } = await supabase
        .from('inbox_contacts')
        .update({ notes })
        .eq('id', contact.id);

      if (error) throw error;
      
      toast.success('Notas salvas com sucesso');
      setEditingNotes(false);
    } catch (err: any) {
      toast.error('Erro ao salvar notas: ' + err.message);
    }
  };

  return (
    <div className="w-80 border-l border-border flex flex-col bg-card">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4">
        <h3 className="font-medium">Detalhes do Contato</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Profile */}
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={contact.profile_pic_url || undefined} />
              <AvatarFallback className="text-2xl">
                {getInitials(contact.name, contact.phone)}
              </AvatarFallback>
            </Avatar>
            <h4 className="font-medium mt-3">{contact.name || 'Sem nome'}</h4>
            <p className="text-sm text-muted-foreground">{contact.phone}</p>
          </div>

          <Separator />

          {/* Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Mensagens não lidas:</span>
                <span className="ml-2 font-medium">{contact.unread_count}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Última mensagem:</span>
                <span className="ml-2 font-medium">
                  {contact.last_message_at 
                    ? format(new Date(contact.last_message_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : 'Nunca'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Criado em:</span>
                <span className="ml-2 font-medium">
                  {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tags</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Adicionar
              </Button>
            </div>
            
            {contact.tags && contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma tag adicionada</p>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Notas</span>
              {editingNotes ? (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingNotes(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveNotes}>
                    Salvar
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingNotes(true)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {editingNotes ? (
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione notas sobre este contato..."
                className="min-h-[100px] text-sm"
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {contact.notes || 'Nenhuma nota adicionada'}
              </p>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Arquivar Conversa
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
