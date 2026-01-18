import { X, Tag, MessageSquare, Calendar, Edit2, Trash2, Megaphone, ExternalLink, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatPhoneDisplay } from '@/utils/phoneFormatter';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [showFullAdBody, setShowFullAdBody] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string>('Purchase');
  const [eventValue, setEventValue] = useState<string>('');
  const [sendingEvent, setSendingEvent] = useState(false);

  const getInitials = (name: string | null, phone: string) => {
    if (name && name.trim()) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    // For LID-only contacts (long phone), show "?"
    if (phone.length > 15) return '?';
    return phone.slice(-2);
  };
  
  // Helper to check if this is a LID-only contact (no real phone)
  const isLidContact = (phone: string, remoteJid?: string) => {
    return phone.length > 15 || (remoteJid && remoteJid.includes('@lid'));
  };
  
  // Get display name for contact
  const getDisplayName = () => {
    if (contact.name && contact.name.trim()) {
      return contact.name;
    }
    const remoteJid = (contact as any).remote_jid;
    if (isLidContact(contact.phone, remoteJid)) {
      return 'Desconhecido';
    }
    return 'Sem nome';
  };
  
  // Get subtitle for contact
  const getContactSubtitle = () => {
    const remoteJid = (contact as any).remote_jid;
    if (isLidContact(contact.phone, remoteJid)) {
      const shortId = contact.phone.slice(-6);
      return `Lead via anúncio • ID ${shortId}`;
    }
    return formatPhoneDisplay(contact.phone);
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

  const handleSendFacebookEvent = async () => {
    setSendingEvent(true);
    try {
      const parsedValue = eventValue ? parseFloat(eventValue.replace(',', '.')) : 0;
      
      const { data, error } = await supabase.functions.invoke('send-facebook-event', {
        body: {
          contact_id: contact.id,
          phone: contact.phone,
          event_name: selectedEvent,
          ctwa_clid: contact.ctwa_clid,
          value: selectedEvent === 'Purchase' ? parsedValue : undefined,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Evento ${selectedEvent} enviado para ${data.successful}/${data.total_pixels} pixel(s)`);
        setEventValue(''); // Clear value after sending
      } else {
        toast.error('Falha ao enviar evento. Verifique seus pixels em Configurações.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar evento');
    } finally {
      setSendingEvent(false);
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
            <h4 className="font-medium mt-3">{getDisplayName()}</h4>
            <p className="text-sm text-muted-foreground">{getContactSubtitle()}</p>
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

          {/* Send Facebook Event */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Enviar Evento Facebook</span>
            </div>
            <div className="space-y-2">
              <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Compra (Purchase)</SelectItem>
                  <SelectItem value="Lead">Lead</SelectItem>
                </SelectContent>
              </Select>
              
              {selectedEvent === 'Purchase' && (
                <Input
                  type="text"
                  placeholder="Valor (ex: 97.00)"
                  value={eventValue}
                  onChange={(e) => setEventValue(e.target.value)}
                  className="text-sm"
                />
              )}
              
              <Button
                onClick={handleSendFacebookEvent}
                disabled={sendingEvent}
                size="sm"
                className="w-full"
              >
                {sendingEvent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Disparar Evento
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envia para todos os pixels. Se configurou Page ID, usa Business Messaging API.
            </p>
          </div>

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

          {/* Ad Origin - show if any ad metadata exists */}
          {(contact.ad_source_url || contact.ctwa_clid || contact.ad_title || contact.ad_body) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Origem do Anúncio</span>
                </div>
                
                {/* Ver Anúncio button first - orange color */}
                {contact.ad_source_url && (
                  <a 
                    href={contact.ad_source_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver Anúncio
                  </a>
                )}

                {/* Ad Title */}
                {contact.ad_title && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Título</span>
                    <p className="text-sm font-medium mt-0.5">{contact.ad_title}</p>
                  </div>
                )}
                
                {/* Ad Body / Copy with truncation */}
                {contact.ad_body && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Texto do Anúncio</span>
                    <div className="mt-0.5">
                      <p className={`text-sm text-muted-foreground ${!showFullAdBody ? 'line-clamp-3' : ''}`}>
                        {contact.ad_body}
                      </p>
                      {contact.ad_body.length > 150 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-0 text-xs text-orange-500 hover:text-orange-600 mt-1"
                          onClick={() => setShowFullAdBody(!showFullAdBody)}
                        >
                          {showFullAdBody ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Ver menos
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Ver mais
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

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
