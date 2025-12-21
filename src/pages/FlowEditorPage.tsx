import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Settings, Play } from 'lucide-react';
import { FlowCanvas } from '@/components/flow-builder/FlowCanvas';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { FlowNode, FlowEdge, InboxFlow } from '@/types/inbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FlowEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [flow, setFlow] = useState<InboxFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'keyword' | 'all' | 'schedule'>('keyword');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const fetchFlow = async () => {
      if (!id || !user) return;

      try {
        const { data, error } = await supabase
          .from('inbox_flows')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const flowData: InboxFlow = {
          ...data,
          nodes: (data.nodes as unknown as FlowNode[]) || [],
          edges: (data.edges as unknown as FlowEdge[]) || [],
          trigger_type: data.trigger_type as 'keyword' | 'all' | 'schedule',
          trigger_keywords: data.trigger_keywords || [],
          assigned_instances: data.assigned_instances || [],
        };

        setFlow(flowData);
        setFlowName(data.name);
        setFlowDescription(data.description || '');
        setTriggerType(data.trigger_type as 'keyword' | 'all' | 'schedule');
        setTriggerKeywords(data.trigger_keywords?.join(', ') || '');
        setIsActive(data.is_active);
      } catch (error: unknown) {
        console.error('Error fetching flow:', error);
        toast.error('Erro ao carregar fluxo');
        navigate('/inbox/flows');
      } finally {
        setLoading(false);
      }
    };

    fetchFlow();
  }, [id, user, navigate]);

  const handleSave = async (nodes: FlowNode[], edges: FlowEdge[]) => {
    if (!id || !user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('inbox_flows')
        .update({
          name: flowName,
          description: flowDescription,
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
          trigger_type: triggerType,
          trigger_keywords: triggerKeywords.split(',').map(k => k.trim()).filter(Boolean),
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Fluxo salvo com sucesso');
    } catch (error: unknown) {
      console.error('Error saving flow:', error);
      toast.error('Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <div className="border-b border-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/inbox/flows')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="w-64 font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              id="flow-active"
            />
            <Label htmlFor="flow-active" className="text-sm">
              {isActive ? 'Ativo' : 'Inativo'}
            </Label>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-1" />
                Configurações
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Configurações do Fluxo</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>Nome do Fluxo</Label>
                  <Input
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Gatilho</Label>
                  <Select
                    value={triggerType}
                    onValueChange={(value) => setTriggerType(value as 'keyword' | 'all' | 'schedule')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">Palavra-chave</SelectItem>
                      <SelectItem value="all">Todas as mensagens</SelectItem>
                      <SelectItem value="schedule">Agendado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {triggerType === 'keyword' && (
                  <div className="space-y-2">
                    <Label>Palavras-chave (separadas por vírgula)</Label>
                    <Textarea
                      value={triggerKeywords}
                      onChange={(e) => setTriggerKeywords(e.target.value)}
                      placeholder="oi, olá, bom dia, quero comprar"
                      rows={2}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between py-2">
                  <Label>Fluxo Ativo</Label>
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" disabled>
            <Play className="h-4 w-4 mr-1" />
            Testar
          </Button>
        </div>
      </div>

      <div className="flex-1" style={{ height: 'calc(100vh - 120px)', minHeight: '600px' }}>
        {flow && (
          <FlowCanvas
            initialNodes={flow.nodes}
            initialEdges={flow.edges}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
};

export default FlowEditorPage;
