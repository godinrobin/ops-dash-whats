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
import { Clock, Moon, Smartphone, Tag, Package } from 'lucide-react';
import { InboxFlow } from '@/types/inbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface LogzzWebhook {
  id: string;
  name: string;
  instance_id: string | null;
  flow_id: string | null;
}

interface InboxTag {
  id: string;
  name: string;
  color: string;
}

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
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'keyword' | 'all' | 'schedule' | 'sale' | 'tag'>('keyword');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [selectedTriggerTags, setSelectedTriggerTags] = useState<string[]>([]);
  const [keywordMatchType, setKeywordMatchType] = useState<'exact' | 'contains' | 'not_contains'>('exact');
  const [assignedInstances, setAssignedInstances] = useState<string[]>([]);
  const [pauseOnMedia, setPauseOnMedia] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [pauseScheduleEnabled, setPauseScheduleEnabled] = useState(false);
  const [pauseScheduleStart, setPauseScheduleStart] = useState('00:00');
  const [pauseScheduleEnd, setPauseScheduleEnd] = useState('06:00');
  const [replyToLastMessage, setReplyToLastMessage] = useState(false);
  const [replyMode, setReplyMode] = useState<'all' | 'interval'>('all');
  const [replyInterval, setReplyInterval] = useState(3);
  const [pauseOtherFlows, setPauseOtherFlows] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Available tags from database
  const [availableTags, setAvailableTags] = useState<InboxTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  
  // Logzz webhooks that use this flow
  const [logzzWebhooks, setLogzzWebhooks] = useState<LogzzWebhook[]>([]);

  // Predefined tags that always appear
  const predefinedTags = [
    { name: 'Lead', color: '#3b82f6' },
    { name: 'Pendente', color: '#eab308' },
    { name: 'Pago', color: '#22c55e' },
    { name: 'VIP', color: '#a855f7' },
    { name: 'Suporte', color: '#f97316' },
  ];

  // Fetch user tags and logzz webhooks when dialog opens
  useEffect(() => {
    const fetchData = async () => {
      if (!open || !user?.id || !flow?.id) return;
      
      setLoadingTags(true);
      try {
        // Fetch tags
        const { data: tagsData } = await supabase
          .from('inbox_tags')
          .select('id, name, color')
          .eq('user_id', user.id);
        
        setAvailableTags(tagsData || []);
        
        // Fetch logzz webhooks that use this flow
        const { data: webhooksData } = await supabase
          .from('logzz_webhooks')
          .select('id, name, instance_id, flow_id')
          .eq('user_id', user.id)
          .eq('flow_id', flow.id);
        
        setLogzzWebhooks(webhooksData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoadingTags(false);
      }
    };
    
    fetchData();
  }, [open, user?.id, flow?.id]);

  // All tags combined (predefined + custom)
  const allTags = [
    ...predefinedTags.map(t => ({ id: `predefined-${t.name}`, ...t })),
    ...availableTags.filter(t => !predefinedTags.some(p => p.name.toLowerCase() === t.name.toLowerCase()))
  ];

  useEffect(() => {
    if (flow) {
      setName(flow.name || '');
      setDescription(flow.description || '');
      setTriggerType(flow.trigger_type || 'keyword');
      setTriggerKeywords(flow.trigger_keywords?.join(', ') || '');
      setSelectedTriggerTags((flow as any).trigger_tags || []);
      setKeywordMatchType((flow as any).keyword_match_type || 'exact');
      setAssignedInstances(flow.assigned_instances || []);
      setPauseOnMedia(flow.pause_on_media || false);
      setIsActive(flow.is_active);
      setPauseScheduleEnabled(flow.pause_schedule_enabled || false);
      setPauseScheduleStart(flow.pause_schedule_start || '00:00');
      setPauseScheduleEnd(flow.pause_schedule_end || '06:00');
      setReplyToLastMessage(flow.reply_to_last_message || false);
      setReplyMode(flow.reply_mode || 'all');
      setReplyInterval(flow.reply_interval || 3);
      setPauseOtherFlows(flow.pause_other_flows || false);
    }
  }, [flow]);

  const toggleTag = (tagName: string) => {
    setSelectedTriggerTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

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

    const updates: Partial<InboxFlow> & { keyword_match_type?: string; trigger_tags?: string[] } = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      trigger_keywords: keywords,
      trigger_tags: selectedTriggerTags,
      keyword_match_type: keywordMatchType,
      assigned_instances: assignedInstances,
      pause_on_media: pauseOnMedia,
      is_active: isActive,
      pause_schedule_enabled: pauseScheduleEnabled,
      pause_schedule_start: pauseScheduleEnabled ? pauseScheduleStart : null,
      pause_schedule_end: pauseScheduleEnabled ? pauseScheduleEnd : null,
      reply_to_last_message: replyToLastMessage,
      reply_mode: replyToLastMessage ? replyMode : 'all',
      reply_interval: replyToLastMessage && replyMode === 'interval' ? replyInterval : 3,
      pause_other_flows: (triggerType === 'sale' || triggerType === 'tag') ? pauseOtherFlows : false,
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
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as 'keyword' | 'all' | 'schedule' | 'sale' | 'tag')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keyword">Palavra-chave</SelectItem>
                <SelectItem value="all">Todas as mensagens</SelectItem>
                <SelectItem value="sale">Venda</SelectItem>
                <SelectItem value="tag">Etiqueta</SelectItem>
              </SelectContent>
            </Select>
            {triggerType === 'tag' && (
              <p className="text-xs text-muted-foreground">
                O fluxo será acionado automaticamente quando uma das etiquetas for adicionada ao contato.
              </p>
            )}
          </div>

          {/* Pausar outros fluxos - for sale and tag triggers */}
          {(triggerType === 'sale' || triggerType === 'tag') && (
            <div className="flex items-center justify-between p-3 border rounded-md bg-amber-500/10 border-amber-500/30">
              <div>
                <Label className="flex items-center gap-2">
                  <span className="text-amber-500">⚡</span>
                  Pausar outros fluxos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ao ativar, pausa todos os outros fluxos ativos do contato para priorizar este fluxo
                </p>
              </div>
              <Switch
                checked={pauseOtherFlows}
                onCheckedChange={setPauseOtherFlows}
                className={
                  pauseOtherFlows
                    ? 'data-[state=checked]:bg-green-500'
                    : 'data-[state=unchecked]:bg-red-500'
                }
              />
            </div>
          )}

          {/* Etiquetas gatilho */}
          {triggerType === 'tag' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Etiquetas que Acionam o Fluxo
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Selecione quais etiquetas devem acionar este fluxo. Quando qualquer uma for adicionada ao contato, o fluxo será iniciado.
              </p>
              {loadingTags ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Carregando etiquetas...
                </p>
              ) : allTags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhuma etiqueta encontrada. Crie etiquetas no Kanban primeiro.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {allTags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center space-x-3 p-2 rounded hover:bg-muted"
                    >
                      <Checkbox
                        id={`tag-${tag.id}`}
                        checked={selectedTriggerTags.includes(tag.name)}
                        onCheckedChange={() => toggleTag(tag.name)}
                      />
                      <label
                        htmlFor={`tag-${tag.id}`}
                        className="flex-1 cursor-pointer flex items-center gap-2"
                      >
                        <Badge 
                          className="text-white text-xs"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              {selectedTriggerTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-muted-foreground">Selecionadas:</span>
                  {selectedTriggerTags.map((tagName) => {
                    const tag = allTags.find(t => t.name === tagName);
                    return (
                      <Badge 
                        key={tagName}
                        className="text-white text-xs"
                        style={{ backgroundColor: tag?.color || '#6b7280' }}
                      >
                        {tagName}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Palavras-chave */}
          {triggerType === 'keyword' && (
            <>
              <div className="space-y-2">
                <Label>Tipo de Correspondência</Label>
                <Select value={keywordMatchType} onValueChange={(v) => setKeywordMatchType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Palavra exata</SelectItem>
                    <SelectItem value="contains">Contém a palavra</SelectItem>
                    <SelectItem value="not_contains">Não contém a palavra</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {keywordMatchType === 'exact' && 'O fluxo inicia quando a mensagem for exatamente igual a uma das palavras-chave.'}
                  {keywordMatchType === 'contains' && 'O fluxo inicia quando a mensagem contiver uma das palavras-chave.'}
                  {keywordMatchType === 'not_contains' && 'O fluxo inicia quando a mensagem NÃO contiver nenhuma das palavras-chave.'}
                </p>
              </div>
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
            </>
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
                    <div className="flex items-center gap-1">
                      {logzzWebhooks.some(w => w.instance_id === instance.id) && (
                        <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-500 border-orange-500/30">
                          <Package className="h-3 w-3 mr-1" />
                          Logzz
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-green-500 border-green-500">
                        Online
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Show Logzz webhooks info */}
            {logzzWebhooks.length > 0 && (
              <div className="mt-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded-md">
                <p className="text-xs text-orange-500 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Este fluxo está vinculado a {logzzWebhooks.length} integração(ões) Logzz
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {logzzWebhooks.map(w => {
                    const linkedInstance = instances.find(i => i.id === w.instance_id);
                    return (
                      <Badge key={w.id} variant="outline" className="text-xs">
                        {w.name} {linkedInstance ? `→ ${linkedInstance.label || linkedInstance.instance_name}` : ''}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Responder Última Mensagem */}
          <div className="space-y-3 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Responder Última Mensagem</Label>
                <p className="text-xs text-muted-foreground">
                  Mensagens do fluxo responderão à última mensagem do cliente (Reduz o Bloqueio)
                </p>
              </div>
              <Switch 
                checked={replyToLastMessage} 
                onCheckedChange={setReplyToLastMessage}
                className={
                  replyToLastMessage
                    ? 'data-[state=checked]:bg-green-500'
                    : 'data-[state=unchecked]:bg-red-500'
                }
              />
            </div>

            {replyToLastMessage && (
              <div className="space-y-3 pt-2 border-t">
                <div className="space-y-2">
                  <Label className="text-xs">Modo de Resposta</Label>
                  <Select value={replyMode} onValueChange={(v) => setReplyMode(v as 'all' | 'interval')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as mensagens</SelectItem>
                      <SelectItem value="interval">A cada X mensagens</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {replyMode === 'interval' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Intervalo de Mensagens</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={2}
                        max={20}
                        value={replyInterval}
                        onChange={(e) => setReplyInterval(Math.max(2, Math.min(20, parseInt(e.target.value) || 3)))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">
                        1 de cada {replyInterval} mensagens será marcada como resposta
                      </span>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  💡 {replyMode === 'all' 
                    ? 'Todas as mensagens do fluxo serão enviadas como resposta à última mensagem do cliente.' 
                    : `A cada ${replyInterval} mensagens enviadas, 1 será marcada como resposta à última mensagem do cliente.`
                  }
                </p>
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
            <Switch 
              checked={pauseOnMedia} 
              onCheckedChange={setPauseOnMedia}
              className={
                pauseOnMedia
                  ? 'data-[state=checked]:bg-green-500'
                  : 'data-[state=unchecked]:bg-red-500'
              }
            />
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
                className={
                  pauseScheduleEnabled
                    ? 'data-[state=checked]:bg-green-500'
                    : 'data-[state=unchecked]:bg-red-500'
                }
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
            <Button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
              {isSaving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
