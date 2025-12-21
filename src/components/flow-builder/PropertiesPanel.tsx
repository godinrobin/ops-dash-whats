import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Save, Settings } from 'lucide-react';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onSave: () => void;
}

export const PropertiesPanel = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onSave,
}: PropertiesPanelProps) => {
  if (!selectedNode) {
    return (
      <div className="w-72 bg-background border-l border-border p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Propriedades
          </h3>
          <Button size="sm" onClick={onSave}>
            <Save className="h-4 w-4 mr-1" />
            Salvar
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">
            Selecione um nó para editar suas propriedades
          </p>
        </div>
      </div>
    );
  }

  const nodeData = selectedNode.data as Record<string, unknown>;

  const renderProperties = () => {
    switch (selectedNode.type) {
      case 'start':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este é o ponto de início do fluxo. Conecte-o ao próximo nó.
            </p>
          </div>
        );

      case 'text':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Digite a mensagem..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
                rows={4}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use {'{{nome}}'} para variáveis dinâmicas
            </p>
          </div>
        );

      case 'image':
      case 'audio':
      case 'video':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Arquivo</Label>
              <Input
                placeholder="https://..."
                value={(nodeData.mediaUrl as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { mediaUrl: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Input
                placeholder="Legenda..."
                value={(nodeData.caption as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { caption: e.target.value })}
              />
            </div>
          </div>
        );

      case 'delay':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tempo de Espera</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={(nodeData.delay as number) || 5}
                  onChange={(e) => onUpdateNode(selectedNode.id, { delay: parseInt(e.target.value) })}
                />
                <Select
                  value={(nodeData.unit as string) || 'seconds'}
                  onValueChange={(value) => onUpdateNode(selectedNode.id, { unit: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Segundos</SelectItem>
                    <SelectItem value="minutes">Minutos</SelectItem>
                    <SelectItem value="hours">Horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 'waitInput':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Salvar resposta em</Label>
              <Input
                placeholder="Nome da variável"
                value={(nodeData.variableName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { variableName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Timeout (segundos)</Label>
              <Input
                type="number"
                min={30}
                value={(nodeData.timeout as number) || 300}
                onChange={(e) => onUpdateNode(selectedNode.id, { timeout: parseInt(e.target.value) })}
              />
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Variável</Label>
              <Input
                placeholder="{{variavel}}"
                value={(nodeData.variable as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { variable: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={(nodeData.operator as string) || 'equals'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { operator: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="startsWith">Começa com</SelectItem>
                  <SelectItem value="endsWith">Termina com</SelectItem>
                  <SelectItem value="greater">Maior que</SelectItem>
                  <SelectItem value="less">Menor que</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                placeholder="Valor para comparar"
                value={(nodeData.value as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { value: e.target.value })}
              />
            </div>
          </div>
        );

      case 'menu':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem do Menu</Label>
              <Textarea
                placeholder="Escolha uma opção..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Opções (uma por linha)</Label>
              <Textarea
                placeholder="1. Opção 1\n2. Opção 2\n3. Opção 3"
                value={(nodeData.options as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { options: e.target.value })}
                rows={4}
              />
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Prompt do Sistema</Label>
              <Textarea
                placeholder="Você é um assistente..."
                value={(nodeData.systemPrompt as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { systemPrompt: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select
                value={(nodeData.model as string) || 'gpt-4o-mini'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { model: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gemini-flash">Gemini Flash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'transfer':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transferir para</Label>
              <Select
                value={(nodeData.transferTo as string) || 'human'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { transferTo: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="human">Atendente Humano</SelectItem>
                  <SelectItem value="department">Departamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mensagem de Transferência</Label>
              <Input
                placeholder="Transferindo para um atendente..."
                value={(nodeData.message as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { message: e.target.value })}
              />
            </div>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <Input
                placeholder="https://..."
                value={(nodeData.url as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Método</Label>
              <Select
                value={(nodeData.method as string) || 'POST'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'setVariable':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Variável</Label>
              <Input
                placeholder="nome_variavel"
                value={(nodeData.variableName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { variableName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                placeholder="Valor ou {{outra_variavel}}"
                value={(nodeData.value as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { value: e.target.value })}
              />
            </div>
          </div>
        );

      case 'tag':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Tag</Label>
              <Input
                placeholder="cliente_vip"
                value={(nodeData.tagName as string) || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { tagName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Ação</Label>
              <Select
                value={(nodeData.action as string) || 'add'}
                onValueChange={(value) => onUpdateNode(selectedNode.id, { action: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Adicionar</SelectItem>
                  <SelectItem value="remove">Remover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'end':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este nó marca o fim do fluxo.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-72 bg-background border-l border-border p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Propriedades
        </h3>
        <Button size="sm" onClick={onSave}>
          <Save className="h-4 w-4 mr-1" />
          Salvar
        </Button>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <div className="text-sm text-muted-foreground capitalize">
            {selectedNode.type}
          </div>
        </div>

        {renderProperties()}
      </div>

      {selectedNode.type !== 'start' && (
        <Button
          variant="destructive"
          size="sm"
          className="mt-4"
          onClick={() => onDeleteNode(selectedNode.id)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Excluir Nó
        </Button>
      )}
    </div>
  );
};
