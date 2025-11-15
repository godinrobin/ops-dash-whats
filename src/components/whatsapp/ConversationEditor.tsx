import { useState } from "react";
import { Conversation, WhatsAppMessage } from "@/pages/DepoimentosGenerator";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Send, UserCircle } from "lucide-react";
import { toast } from "sonner";

interface ConversationEditorProps {
  conversation: Conversation;
  onUpdate: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
}

export const ConversationEditor = ({ conversation, onUpdate, onDelete }: ConversationEditorProps) => {
  const [newMessageText, setNewMessageText] = useState("");
  const [newMessageType, setNewMessageType] = useState<"sent" | "received">("received");
  const [newMessageTime, setNewMessageTime] = useState("10:30");

  const updateField = (field: keyof Conversation, value: any) => {
    onUpdate({ ...conversation, [field]: value });
  };

  const addMessage = () => {
    if (!newMessageText.trim()) {
      toast.error("Digite uma mensagem");
      return;
    }

    const newMessage: WhatsAppMessage = {
      id: Date.now().toString(),
      text: newMessageText,
      type: newMessageType,
      timestamp: newMessageTime
    };

    onUpdate({
      ...conversation,
      messages: [...conversation.messages, newMessage]
    });

    setNewMessageText("");
    toast.success("Mensagem adicionada!");
  };

  const deleteMessage = (messageId: string) => {
    onUpdate({
      ...conversation,
      messages: conversation.messages.filter(m => m.id !== messageId)
    });
    toast.success("Mensagem removida!");
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold">Editar Conversa</h2>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(conversation.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Configurações Básicas */}
        <div>
          <Label>Nome da Conversa</Label>
          <Input
            value={conversation.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
        </div>

        <div>
          <Label>Nome do Contato</Label>
          <Input
            value={conversation.contactName}
            onChange={(e) => updateField("contactName", e.target.value)}
          />
        </div>

        <div>
          <Label>Sistema Operacional</Label>
          <Select
            value={conversation.os}
            onValueChange={(value: "ios" | "android") => updateField("os", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ios">iPhone (iOS)</SelectItem>
              <SelectItem value="android">Android</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Horário</Label>
            <Input
              value={conversation.phoneTime}
              onChange={(e) => updateField("phoneTime", e.target.value)}
              placeholder="09:41"
            />
          </div>
          <div>
            <Label>Bateria (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={conversation.batteryLevel}
              onChange={(e) => updateField("batteryLevel", parseInt(e.target.value))}
            />
          </div>
        </div>

        <div>
          <Label>Operadora</Label>
          <Input
            value={conversation.carrier}
            onChange={(e) => updateField("carrier", e.target.value)}
          />
        </div>

        <div>
          <Label>URL da Foto do Contato</Label>
          <div className="flex gap-2">
            <Input
              value={conversation.contactPhoto}
              onChange={(e) => updateField("contactPhoto", e.target.value)}
              placeholder="https://..."
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => updateField("contactPhoto", `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`)}
            >
              <UserCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Adicionar Mensagem */}
        <div className="border-t pt-4 mt-4">
          <Label>Nova Mensagem</Label>
          <Textarea
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Digite a mensagem..."
            rows={3}
            className="mt-2"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={newMessageType}
                onValueChange={(value: "sent" | "received") => setNewMessageType(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Recebida</SelectItem>
                  <SelectItem value="sent">Enviada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Horário</Label>
              <Input
                value={newMessageTime}
                onChange={(e) => setNewMessageTime(e.target.value)}
                placeholder="10:30"
              />
            </div>
          </div>
          <Button onClick={addMessage} className="w-full mt-2">
            <Send className="w-4 h-4 mr-2" />
            Adicionar Mensagem
          </Button>
        </div>

        {/* Lista de Mensagens */}
        <div className="border-t pt-4 mt-4">
          <Label className="mb-2 block">Mensagens ({conversation.messages.length})</Label>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {conversation.messages.map((message) => (
              <div
                key={message.id}
                className={`p-2 rounded-lg border ${
                  message.type === "sent" ? "bg-green-50" : "bg-gray-50"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {message.type === "sent" ? "Enviada" : "Recebida"} - {message.timestamp}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMessage(message.id)}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
                <p className="text-sm">{message.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
