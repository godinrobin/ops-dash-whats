import { useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Play, Pause, Volume2 } from "lucide-react";

const voices = [
  { id: "Zg3wohd4gJs8guTdTXPb", name: "Voz de Mulher (35-40 anos)" },
  { id: "d7rzPRu3dVSLsvbWCCts", name: "Voz de Mulher (Professora)" },
  { id: "1O6NYpDRqdJzusqK717R", name: "Voz de Mulher Velha" },
  { id: "4vbXGL1xAN936MeSCtyJ", name: "Voz de Pastor Na igreja" },
  { id: "33GOY7Am9tnpSKYpFVxM", name: "Voz de Mulher Choramingando" },
  { id: "6r7vE9xvBmx115WCR9tR", name: "Voz do FreiGilson" },
  { id: "lXxITBwRsXFiIjsjn60h", name: "Voz de Carioca" },
  { id: "ZA5HAcCWFlMQVFIL9S9a", name: "Voz de Homem (35-40 anos)" },
  { id: "RMB4btomRahyVcqXwrav", name: "Voz de Homem Velho" },
];

const AudioGenerator = () => {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira um texto para gerar o áudio.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedVoice) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma voz.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setAudioUrl(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-audio", {
        body: { text, voiceId: selectedVoice },
      });

      if (error) throw error;

      if (data.audioContent) {
        const audioBlob = base64ToBlob(data.audioContent, "audio/mpeg");
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        const audio = new Audio(url);
        audio.onended = () => setIsPlaying(false);
        setAudioElement(audio);

        toast({
          title: "Sucesso",
          description: "Áudio gerado com sucesso!",
        });
      }
    } catch (error: any) {
      console.error("Error generating audio:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao gerar áudio.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const base64ToBlob = (base64: string, mimeType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const handlePlayPause = () => {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    if (!audioUrl) return;

    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `audio-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-3xl">
          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">🎙️ Gerador de Áudio</h1>
            <p className="text-muted-foreground">
              Transforme texto em áudio com vozes realistas
            </p>
          </header>

          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-accent" />
                Configuração do Áudio
              </CardTitle>
              <CardDescription>
                Insira o texto e escolha a voz desejada
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Selecione a Voz</label>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger className="border-accent/50">
                    <SelectValue placeholder="Escolha uma voz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Texto para Converter</label>
                <Textarea
                  placeholder="Digite ou cole o texto que deseja transformar em áudio..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  className="border-accent/50 resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {text.length} caracteres
                </p>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !text.trim() || !selectedVoice}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando áudio...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 mr-2" />
                    Gerar Áudio
                  </>
                )}
              </Button>

              {audioUrl && (
                <div className="pt-4 border-t border-accent/20 space-y-4">
                  <h3 className="font-medium text-center">Áudio Gerado</h3>
                  <div className="flex justify-center gap-4">
                    <Button
                      variant="outline"
                      onClick={handlePlayPause}
                      className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Pausar
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Reproduzir
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleDownload}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar MP3
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default AudioGenerator;
