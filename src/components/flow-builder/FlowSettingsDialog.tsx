import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, Moon, Smartphone } from 'lucide-react';
import { InboxFlow } from '@/types/inbox';
import { toast } from 'sonner';

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
}

interface FlowSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow: InboxFlow | null;
  instances: Instance[];
  onSave: (flowId: string, updates: Partial<InboxFlow>) => Promise<{ error?: string }>;
}

export const FlowSettingsDialog = ({
  open,
  onOpenChange,
  flow,
  instances,
  onSave,
}: FlowSettingsDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'keyword' | 'all' | 'schedule'>('keyword');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [assignedInstances, setAssignedInstances] = useState<string[]>([]);
  const [pauseOnMedia, setPauseOnMedia] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [pauseScheduleEnabled, setPauseScheduleEnabled] = useState(false);
  const [pauseScheduleStart, setPauseScheduleStart] = useState('00:00');
  const [pauseScheduleEnd, setPauseScheduleEnd] = useState('06:00');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (flow) {
      setName(flow.name || '');
      setDescription(flow.description || '');
      setTriggerType(flow.trigger_type || 'keyword');
      setTriggerKeywords(flow.trigger_keywords?.join(', ') || '');
      setAssignedInstances(flow.assigned_instances || []);
      setPauseOnMedia(flow.pause_on_media || false);
      setIsActive(flow.is_active);
      setPauseScheduleEnabled(flow.pause_schedule_enabled || false);
      setPauseScheduleStart(flow.pause_schedule_start || '00:00');
      setPauseScheduleEnd(flow.pause_schedule_end || '06:00');
    }
  }, [flow]);

  const toggleInstance = (instanceId: string) => {
    setAssignedInstances((prev) =>
      prev.includes(instanceId)
        ? prev.filter((id) => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  const handleSave = async () => {
    if (!flow) return;

    if (!name.trim()) {
      toast.error('O nome do fluxo é obrigatório');
      return;
    }

    setIsSaving(true);

    const keywords = triggerKeywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);

    const updates: Partial<InboxFlow> = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      trigger_keywords: keywords,
      assigned_instances: assignedInstances,
      pause_on_media: pauseOnMedia,
      is_active: isActive,
      pause_schedule_enabled: pauseScheduleEnabled,
      pause_schedule_start: pauseScheduleEnabled ? pauseScheduleStart : null,
      pause_schedule_end: pauseScheduleEnabled ? pauseScheduleEnd : null,
    };

    const result = await onSave(flow.id, updates);

    setIsSaving(false);

    if (result.error) {
      toast.error('Erro ao salvar configurações: ' + result.error);
    } else {
      toast.success('Configurações salvas com sucesso');
      onOpenChange(false);
    }
  };

  if (!flow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Configurações do Fluxo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Nome do Fluxo */}
          <div className="space-y-2">
            <Label>Nome do Fluxo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Atendimento Inicial"
              className="border-primary/50 focus:border-primary"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o objetivo deste fluxo..."
              rows={2}
            />
          </div>

          {/* Tipo de Gatilho */}
          <div className="space-y-2">
            <Label>Tipo de Gatilho</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keyword">Palavra-chave</SelectItem>
                <SelectItem value="all">Todas as mensagens</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Palavras-chave */}
          {triggerType === 'keyword' && (
            <div className="space-y-2">
              <Label>Palavras-chave</Label>
              <Textarea
                value={triggerKeywords}
                onChange={(e) => setTriggerKeywords(e.target.value)}
                placeholder="oi, olá, quero, comprar (separadas por vírgula)"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Separe as palavras-chave por vírgula
              </p>
            </div>
          )}

          {/* Instâncias (Números) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Números Atribuídos
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Selecione em quais números este fluxo deve funcionar. Se nenhum for selecionado, funcionará em todos.
            </p>
            {instances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nenhum número conectado encontrado.
              </p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                {instances.map((instance) => (
                  <div
                    key={instance.id}
                    className="flex items-center space-x-3 p-2 rounded hover:bg-muted"
                  >
                    <Checkbox
                      id={`settings-${instance.id}`}
                      checked={assignedInstances.includes(instance.id)}
                      onCheckedChange={() => toggleInstance(instance.id)}
                    />
                    <label
                      htmlFor={`settings-${instance.id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <p className="font-medium text-sm">
                        {instance.label || instance.instance_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {instance.phone_number || 'Sem número'}
                      </p>
                    </label>
                    <Badge variant="outline" className="text-green-500 border-green-500">
                      Online
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pausar ao receber mídia */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <Label>Pausar ao receber imagem/PDF</Label>
              <p className="text-xs text-muted-foreground">
                Pausa o fluxo quando o contato envia uma mídia
              </p>
            </div>
            <Switch checked={pauseOnMedia} onCheckedChange={setPauseOnMedia} />
          </div>

          {/* Fluxo Ativo */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <Label>Fluxo Ativo</Label>
              <p className="text-xs text-muted-foreground">
                Ativar ou desativar este fluxo
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              className={
                isActive
                  ? 'data-[state=checked]:bg-green-500'
                  : 'data-[state=unchecked]:bg-red-500'
              }
            />
          </div>

          {/* Pausar Envio por Horário */}
          <div className="space-y-4 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label>Pausar Envio por Horário</Label>
                  <p className="text-xs text-muted-foreground">
                    Não enviar mensagens durante o horário definido
                  </p>
                </div>
              </div>
              <Switch
                checked={pauseScheduleEnabled}
                onCheckedChange={setPauseScheduleEnabled}
              />
            </div>

            {pauseScheduleEnabled && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Início da Pausa</Label>
                    <Input
                      type="time"
                      value={pauseScheduleStart}
                      onChange={(e) => setPauseScheduleStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Fim da Pausa</Label>
                    <Input
                      type="time"
                      value={pauseScheduleEnd}
                      onChange={(e) => setPauseScheduleEnd(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  ⏰ Fuso horário: São Paulo (UTC-3). As mensagens que deixarem de ser enviadas durante a pausa serão disparadas após o término do horário definido.
                </p>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
