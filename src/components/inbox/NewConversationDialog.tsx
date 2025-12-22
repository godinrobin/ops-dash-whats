import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { InboxContact } from '@/types/inbox';

interface Instance {
  id: string;
  instance_name: string;
  label: string | null;
  phone_number: string | null;
  status: string;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: Instance[];
  onContactCreated: (contact: InboxContact) => void;
}

const formatPhoneNumber = (input: string): string => {
  // Remove all non-digits
  let digits = input.replace(/\D/g, '');
  
  // If starts with +, remove it (already removed by \D)
  // If starts with 0, remove it
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // If doesn't start with 55 (Brazil), add it
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  // Ensure we have DDD (2 digits after 55) and number (8-9 digits)
  // Format: 55 + DDD (2) + Number (8-9)
  return digits;
};

export const NewConversationDialog = ({ 
  open, 
  onOpenChange, 
  instances, 
  onContactCreated 
}: NewConversationDialogProps) => {
  const { user } = useAuth();
  const [phoneInput, setPhoneInput] = useState('');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return;
    }

    if (!phoneInput.trim()) {
      toast.error('Digite o número de telefone');
      return;
    }

    if (!selectedInstanceId) {
      toast.error('Selecione um número para enviar');
      return;
    }

    setLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(phoneInput);

      // Check if contact already exists
      const { data: existingContact } = await supabase
        .from('inbox_contacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('phone', formattedPhone)
        .eq('instance_id', selectedInstanceId)
        .single();

      if (existingContact) {
        const contact: InboxContact = {
          ...existingContact,
          tags: Array.isArray(existingContact.tags) ? existingContact.tags as string[] : [],
          status: existingContact.status as 'active' | 'archived',
        };
        onContactCreated(contact);
        onOpenChange(false);
        setPhoneInput('');
        return;
      }

      // Create new contact
      const { data: newContact, error } = await supabase
        .from('inbox_contacts')
        .insert({
          user_id: user.id,
          phone: formattedPhone,
          instance_id: selectedInstanceId,
          tags: [],
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating contact:', error);
        toast.error('Erro ao criar contato');
        return;
      }

      const contact: InboxContact = {
        ...newContact,
        tags: [],
        status: 'active' as const,
      };

      toast.success('Conversa criada!');
      onContactCreated(contact);
      onOpenChange(false);
      setPhoneInput('');
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao criar conversa');
    } finally {
      setLoading(false);
    }
  };

  const connectedInstances = instances.filter(i => i.status === 'connected' || i.status === 'open');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Número de Telefone</Label>
            <Input
              placeholder="Ex: 11999998888 ou +5511999998888"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Digite com ou sem código do país. Será formatado automaticamente.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Enviar pelo número</Label>
            <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um número" />
              </SelectTrigger>
              <SelectContent>
                {connectedInstances.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhum número conectado
                  </SelectItem>
                ) : (
                  connectedInstances.map(instance => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.label || instance.instance_name}
                      {instance.phone_number && ` (${instance.phone_number})`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Criando...' : 'Iniciar Conversa'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
