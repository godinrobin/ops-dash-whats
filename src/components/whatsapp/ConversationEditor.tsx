import { useState } from "react";
import { Conversation, WhatsAppMessage } from "@/pages/DepoimentosGenerator";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Send, UserCircle, Edit2, X } from "lucide-react";
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
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [newMediaType, setNewMediaType] = useState<"image" | "video" | "pdf" | undefined>(undefined);
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [pdfName, setPdfName] = useState("");

  const updateField = (field: keyof Conversation, value: any) => {
    onUpdate({ ...conversation, [field]: value });
  };

  const addMessage = () => {
    if (!newMessageText.trim() && !newMediaType) {
      toast.error("Digite uma mensagem ou adicione uma mídia");
      return;
    }

    let replyTo = undefined;
    if (replyToId) {
      const replyMessage = conversation.messages.find(m => m.id === replyToId);
      if (replyMessage) {
        replyTo = {
          senderName: replyMessage.type === "sent" ? "Você" : conversation.contactName,
          text: replyMessage.text
        };
      }
    }

    const newMessage: WhatsAppMessage = {
      id: Date.now().toString(),
      text: newMessageText,
      type: newMessageType,
      timestamp: newMessageTime,
      replyTo,
      mediaType: newMediaType,
      mediaUrl: newMediaUrl || undefined,
      caption: mediaCaption || undefined,
      pdfName: pdfName || undefined
    };

    onUpdate({
      ...conversation,
      messages: [...conversation.messages, newMessage]
    });

    setNewMessageText("");
    setReplyToId(null);
    setNewMediaType(undefined);
    setNewMediaUrl("");
    setMediaCaption("");
    setPdfName("");
    toast.success("Mensagem adicionada!");
  };

  const deleteMessage = (messageId: string) => {
    onUpdate({
      ...conversation,
      messages: conversation.messages.filter(m => m.id !== messageId)
    });
    toast.success("Mensagem removida!");
  };

  const startEditMessage = (message: WhatsAppMessage) => {
    setEditingMessageId(message.id);
    setEditingText(message.text);
  };

  const saveEditMessage = () => {
    if (!editingText.trim()) {
      toast.error("Digite um texto");
      return;
    }

    onUpdate({
      ...conversation,
      messages: conversation.messages.map(m =>
        m.id === editingMessageId ? { ...m, text: editingText } : m
      )
    });

    setEditingMessageId(null);
    setEditingText("");
    toast.success("Mensagem editada!");
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
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

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Sistema Operacional</Label>
            <Select
              value="ios"
              disabled
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ios">iPhone (iOS)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tema</Label>
            <Select
              value={conversation.theme}
              onValueChange={(value: "light" | "dark") => updateField("theme", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
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
          <div>
            <Label>Não Lidas</Label>
            <Input
              type="number"
              min="0"
              value={conversation.unreadCount || 0}
              onChange={(e) => updateField("unreadCount", parseInt(e.target.value))}
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

        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <Label className="mb-0">Contato Online</Label>
          <Select
            value={conversation.isOnline === false ? "offline" : "online"}
            onValueChange={(value) => updateField("isOnline", value === "online")}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
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

        <div className="border-t pt-4 mt-4">
          <Label>Nova Mensagem</Label>
          {replyToId && (
            <div className="mt-2 p-2 bg-muted rounded-lg flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium text-primary">
                  Respondendo: {conversation.messages.find(m => m.id === replyToId)?.text.substring(0, 50)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyToId(null)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
          <Textarea
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Digite a mensagem..."
            rows={3}
            className="mt-2"
          />
          
          <div className="mt-2 space-y-2">
            <Label className="text-xs">Adicionar Mídia (Opcional)</Label>
            <Select
              value={newMediaType || "none"}
              onValueChange={(value) => setNewMediaType(value === "none" ? undefined : value as "image" | "video" | "pdf")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem mídia</SelectItem>
                <SelectItem value="image">Imagem</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
            
            {newMediaType && (
              <>
                <Input
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  placeholder="URL da imagem/vídeo/pdf"
                  className="text-xs"
                />
                
                {newMediaType !== "pdf" && (
                  <Input
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    placeholder="Legenda (opcional)"
                    className="text-xs"
                  />
                )}
                
                {newMediaType === "pdf" && (
                  <Input
                    value={pdfName}
                    onChange={(e) => setPdfName(e.target.value)}
                    placeholder="Nome do PDF (Ex: Documento.pdf)"
                    className="text-xs"
                  />
                )}
              </>
            )}
          </div>

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
          <Button onClick={addMessage} className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white">
            <Send className="w-4 h-4 mr-2" />
            Adicionar Mensagem
          </Button>
        </div>

        <div className="border-t pt-4 mt-4">
          <Label className="mb-2 block">Mensagens ({conversation.messages.length})</Label>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {conversation.messages.map((message) => (
              <div
                key={message.id}
                className={`p-2 rounded-lg border ${
                  message.type === "sent" ? "bg-green-50 dark:bg-green-950/20" : "bg-gray-50 dark:bg-gray-900/20"
                }`}
              >
                {editingMessageId === message.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEditMessage}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {message.type === "sent" ? "Enviada" : "Recebida"} - {message.timestamp}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReplyToId(message.id)}
                          title="Responder"
                          className="hover:bg-primary/10"
                        >
                          <Send className="w-3 h-3 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditMessage(message)}
                          title="Editar"
                          className="hover:bg-blue-500/10"
                        >
                          <Edit2 className="w-3 h-3 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMessage(message.id)}
                          className="hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {message.replyTo && (
                      <div className="mb-1 p-1 bg-primary/10 border-l-2 border-primary text-xs">
                        <p className="font-medium">{message.replyTo.senderName}</p>
                        <p className="text-muted-foreground">{message.replyTo.text.substring(0, 50)}...</p>
                      </div>
                    )}
                    <p className="text-sm">{message.text}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
