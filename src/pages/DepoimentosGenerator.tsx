import { useState } from "react";
import { Header } from "@/components/Header";
import { WhatsAppSimulator } from "@/components/whatsapp/WhatsAppSimulator";
import { ConversationEditor } from "@/components/whatsapp/ConversationEditor";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import html2canvas from "html2canvas";
import { toast } from "sonner";

export interface WhatsAppMessage {
  id: string;
  text: string;
  type: "sent" | "received";
  timestamp: string;
  replyTo?: {
    senderName: string;
    text: string;
  };
}

export interface Conversation {
  id: string;
  name: string;
  contactName: string;
  contactPhoto: string;
  phoneTime: string;
  batteryLevel: number;
  carrier: string;
  os: "ios" | "android";
  theme: "light" | "dark";
  messages: WhatsAppMessage[];
  unreadCount?: number;
  isOnline?: boolean;
}

const DepoimentosGenerator = () => {
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: "1",
      name: "Conversa 1",
      contactName: "Cliente",
      contactPhoto: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cliente",
      phoneTime: "09:41",
      batteryLevel: 85,
      carrier: "Vivo",
      os: "ios",
      theme: "light",
      unreadCount: 0,
      isOnline: true,
      messages: [
        {
          id: "1",
          text: "Olá! Queria saber mais sobre o produto",
          type: "received",
          timestamp: "10:30"
        },
        {
          id: "2",
          text: "Olá! Claro, posso te ajudar. O que gostaria de saber?",
          type: "sent",
          timestamp: "10:31"
        }
      ]
    }
  ]);

  const [selectedConversationId, setSelectedConversationId] = useState<string>("1");

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  const addConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      name: `Conversa ${conversations.length + 1}`,
      contactName: "Novo Contato",
      contactPhoto: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`,
      phoneTime: "09:41",
      batteryLevel: 85,
      carrier: "Vivo",
      os: "ios",
      theme: "light",
      unreadCount: 0,
      isOnline: true,
      messages: []
    };
    setConversations([...conversations, newConversation]);
    setSelectedConversationId(newConversation.id);
    toast.success("Nova conversa criada!");
  };

  const updateConversation = (updatedConversation: Conversation) => {
    setConversations(conversations.map(c => 
      c.id === updatedConversation.id ? updatedConversation : c
    ));
  };

  const deleteConversation = (id: string) => {
    if (conversations.length === 1) {
      toast.error("Você precisa ter pelo menos uma conversa");
      return;
    }
    setConversations(conversations.filter(c => c.id !== id));
    if (selectedConversationId === id) {
      setSelectedConversationId(conversations[0].id);
    }
    toast.success("Conversa excluída!");
  };

  const downloadScreenshot = async () => {
    const element = document.getElementById('whatsapp-simulator');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: null,
        scale: 2,
        logging: false,
      });

      const link = document.createElement('a');
      link.download = `depoimento-${selectedConversation?.contactName || 'conversa'}.png`;
      link.href = canvas.toDataURL();
      link.click();
      
      toast.success("Imagem baixada com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar imagem");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gerador de Depoimentos</h1>
            <p className="text-muted-foreground mt-1">Crie conversas realistas do WhatsApp</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={addConversation} variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Nova Conversa
            </Button>
            <Button onClick={downloadScreenshot} size="sm">
              <Download className="mr-2 h-4 w-4" />
              Baixar Imagem
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Conversas */}
          <Card className="p-4">
            <h2 className="font-semibold mb-4">Conversas</h2>
            <div className="space-y-2">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedConversationId === conv.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={conv.contactPhoto}
                        alt={conv.contactName}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <p className="font-medium">{conv.name}</p>
                        <p className="text-xs opacity-80">{conv.messages.length} mensagens</p>
                      </div>
                    </div>
                    <span className="text-xs opacity-60">{conv.os === "ios" ? "iOS" : "Android"}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Simulador do WhatsApp */}
          <div className="lg:col-span-1">
            {selectedConversation && (
              <WhatsAppSimulator conversation={selectedConversation} />
            )}
          </div>

          {/* Editor */}
          <div className="lg:col-span-1">
            {selectedConversation && (
              <ConversationEditor
                conversation={selectedConversation}
                onUpdate={updateConversation}
                onDelete={deleteConversation}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DepoimentosGenerator;
