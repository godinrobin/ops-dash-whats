import { useState, useEffect, useRef } from "react";
import { SystemLayout } from "@/components/layout/SystemLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/useSplashedToast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Play, Pause, Volume2, Clock, Upload, Trash2, Plus, Mic } from "lucide-react";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useMultiGenerationCooldown } from "@/hooks/useMultiGenerationCooldown";
import { convertToMp3, needsConversion, getConversionInfo } from "@/utils/audioConverter";

interface Voice {
  id: string;
  name: string;
  category: 'mulher' | 'homem' | 'crianca' | 'bonus' | 'personalizado';
}

interface CustomVoice {
  id: string;
  voice_id: string;
  voice_name: string;
  created_at: string;
}

const PREVIEW_TEXT = "Esta é a voz selecionada, gostou?";

const voices: Voice[] = [
  // Mulher
  { id: "Zg3wohd4gJs8guTdTXPb", name: "Voz de Taróloga", category: "mulher" },
  { id: "d7rzPRu3dVSLsvbWCCts", name: "Voz para Atividade Infantil", category: "mulher" },
  { id: "1O6NYpDRqdJzusqK717R", name: "Voz de Mulher Velha", category: "mulher" },
  { id: "EvpLGWrX1AwQb1i7PLlO", name: "Voz de Influencer", category: "mulher" },
  { id: "rRfxJNvibLZ8tabPQWMQ", name: "Voz de Tiktok", category: "mulher" },
  { id: "TU0AKFEDB4rOIzrirWl0", name: "Voz de IA", category: "mulher" },
  { id: "erMftXUmGTCGs1yArsUh", name: "Voz Para Demonstração", category: "mulher" },
  { id: "QTisrsrrHxSoMiznY2EJ", name: "Voz Famosa de Criativo", category: "mulher" },
  { id: "7bLMZKlZ5YeFS6ALdAvc", name: "Voz de Mulher Calma", category: "mulher" },
  { id: "neKWZWCXetZ17gvsMvek", name: "Voz de Mãe", category: "mulher" },
  // Homem
  { id: "4vbXGL1xAN936MeSCtyJ", name: "Voz de Pastor na Igreja", category: "homem" },
  { id: "ZA5HAcCWFlMQVFIL9S9a", name: "Voz de Homem Séria", category: "homem" },
  { id: "RMB4btomRahyVcqXwrav", name: "Voz de Homem Velho", category: "homem" },
  // Criança
  { id: "YqYpIHI7eZmw49lUGLnb", name: "Voz de Criança (Menina)", category: "crianca" },
  { id: "DeM8H9SpaWcLIGAQZ3oz", name: "Voz de Criança (Menino)", category: "crianca" },
  // Bônus
  { id: "6r7vE9xvBmx115WCR9tR", name: "Voz do Frei Gilson", category: "bonus" },
  { id: "X68g7aHdoQtNGel10ep6", name: "Voz do Renato Cariani", category: "bonus" },
  { id: "kMEv5aToYRCssv2CIVuw", name: "Voz da Ana Maria Braga", category: "bonus" },
  { id: "qrEIwKTSkTuEue7RuF9n", name: "Voz da Marcia Sensitiva", category: "bonus" },
  { id: "v6ztLTVuY9k1rdRLQnQU", name: "Voz do Dráuzio Varela", category: "bonus" },
];

const MAX_CUSTOM_VOICES = 3;

const AudioGenerator = () => {
  useActivityTracker("page_visit", "Gerador de Áudio");
  const { toast } = useToast();
  const { canGenerate, formattedTime, startCooldown, isAdmin, generationsLeft } = useMultiGenerationCooldown("audio_generations", 3);
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Voice preview states
  const [voicePreviews, setVoicePreviews] = useState<Record<string, string>>({});
  const [loadingVoicePreview, setLoadingVoicePreview] = useState<string | null>(null);
  const [playingVoicePreview, setPlayingVoicePreview] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Custom voice states
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cached previews and custom voices from Supabase
  useEffect(() => {
    const loadData = async () => {
      // Load previews
      const { data: previewData } = await supabase
        .from("voice_previews")
        .select("voice_id, audio_base64");
      
      if (previewData) {
        const previews: Record<string, string> = {};
        previewData.forEach((item: any) => {
          previews[item.voice_id] = item.audio_base64;
        });
        setVoicePreviews(previews);
      }

      // Load custom voices
      const { data: customVoicesData } = await supabase
        .from("user_custom_voices")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (customVoicesData) {
        setCustomVoices(customVoicesData);
      }
    };
    loadData();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Accept all audio types - we'll convert if needed
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|opus|ogg|webm|aac|flac)$/i)) {
        toast({
          title: "Formato inválido",
          description: "Por favor, selecione um arquivo de áudio.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUploadVoice = async () => {
    if (!selectedFile || !newVoiceName.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha o nome da voz e selecione um arquivo de áudio.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingVoice(true);

    try {
      let fileToUpload = selectedFile;
      
      // Check if conversion is needed
      if (needsConversion(selectedFile)) {
        setIsConverting(true);
        try {
          fileToUpload = await convertToMp3(selectedFile, (status) => {
            setConversionStatus(status);
          });
          toast({
            title: "Conversão concluída",
            description: "Áudio convertido para MP3 com sucesso!",
          });
        } catch (conversionError: any) {
          console.error("Conversion error:", conversionError);
          toast({
            title: "Erro na conversão",
            description: "Não foi possível converter o arquivo de áudio. Tente um arquivo MP3 ou WAV.",
            variant: "destructive",
          });
          return;
        } finally {
          setIsConverting(false);
          setConversionStatus("");
        }
      }
      
      const formData = new FormData();
      formData.append('name', newVoiceName.trim());
      formData.append('file', fileToUpload);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Você precisa estar logado para criar vozes personalizadas.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-custom-voice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar voz personalizada');
      }

      // Add to local state
      setCustomVoices(prev => [{
        id: crypto.randomUUID(),
        voice_id: result.voiceId,
        voice_name: result.voiceName,
        created_at: new Date().toISOString(),
      }, ...prev]);

      // Reset form
      setNewVoiceName("");
      setSelectedFile(null);
      setIsUploadDialogOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      toast({
        title: "Sucesso!",
        description: `Voz "${result.voiceName}" criada com sucesso!`,
      });
    } catch (error: any) {
      console.error("Error uploading voice:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar voz personalizada.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const handleDeleteVoice = async (voiceId: string, voiceName: string) => {
    if (!confirm(`Tem certeza que deseja excluir a voz "${voiceName}"?`)) {
      return;
    }

    setDeletingVoiceId(voiceId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Você precisa estar logado.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-custom-voice`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ voiceId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao excluir voz');
      }

      // Remove from local state
      setCustomVoices(prev => prev.filter(v => v.voice_id !== voiceId));
      
      // Clear selection if this voice was selected
      if (selectedVoice === voiceId) {
        setSelectedVoice("");
      }

      toast({
        title: "Sucesso!",
        description: `Voz "${voiceName}" excluída com sucesso.`,
      });
    } catch (error: any) {
      console.error("Error deleting voice:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao excluir voz.",
        variant: "destructive",
      });
    } finally {
      setDeletingVoiceId(null);
    }
  };

  const playVoicePreview = async (voiceId: string) => {
    // Stop current preview if playing
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current = null;
    }

    // If same voice is playing, just stop
    if (playingVoicePreview === voiceId) {
      setPlayingVoicePreview(null);
      return;
    }

    // Check cache first
    if (voicePreviews[voiceId]) {
      const audioBlob = base64ToBlob(voicePreviews[voiceId], "audio/mpeg");
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => setPlayingVoicePreview(null);
      voicePreviewAudioRef.current = audio;
      audio.play();
      setPlayingVoicePreview(voiceId);
      return;
    }

    // Generate preview
    setLoadingVoicePreview(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-audio", {
        body: { text: PREVIEW_TEXT, voiceId },
      });

      if (error) throw error;

      if (data.audioContent) {
        // Cache the preview
        setVoicePreviews((prev) => ({ ...prev, [voiceId]: data.audioContent }));

        // Save to database for other users
        const voiceName = voices.find(v => v.id === voiceId)?.name || voiceId;
        await supabase.from("voice_previews").upsert({
          voice_id: voiceId,
          voice_name: voiceName,
          audio_base64: data.audioContent,
        }, { onConflict: 'voice_id' });

        // Play the audio
        const audioBlob = base64ToBlob(data.audioContent, "audio/mpeg");
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audio.onended = () => setPlayingVoicePreview(null);
        voicePreviewAudioRef.current = audio;
        audio.play();
        setPlayingVoicePreview(voiceId);
      }
    } catch (error: any) {
      console.error("Error generating voice preview:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o preview da voz.",
        variant: "destructive",
      });
    } finally {
      setLoadingVoicePreview(null);
    }
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast({
        title: "Aguarde",
        description: `Você atingiu o limite de 3 gerações. Aguarde ${formattedTime} para gerar novamente.`,
        variant: "destructive",
      });
      return;
    }

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

        startCooldown();
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
    <SystemLayout>
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
              {/* Vozes Personalizadas Header with Add Button */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Mic className="w-4 h-4 text-accent" />
                    Vozes Personalizadas
                    <span className="text-xs text-muted-foreground">({customVoices.length}/{MAX_CUSTOM_VOICES})</span>
                  </label>
                  <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={customVoices.length >= MAX_CUSTOM_VOICES}
                        className="border-accent hover:bg-accent/10"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Adicionar Voz
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar Voz Personalizada</DialogTitle>
                        <DialogDescription>
                          Faça upload de um áudio para clonar a voz. Use gravações de 30 segundos a 5 minutos para melhores resultados.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Nome da Voz</label>
                          <Input
                            placeholder="Ex: Minha Voz, Narrador, etc..."
                            value={newVoiceName}
                            onChange={(e) => setNewVoiceName(e.target.value)}
                            disabled={isUploadingVoice}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Arquivo de Áudio</label>
                          <div className="flex items-center gap-2">
                            <Input
                              ref={fileInputRef}
                              type="file"
                              accept="audio/*"
                              onChange={handleFileSelect}
                              disabled={isUploadingVoice || isConverting}
                              className="flex-1"
                            />
                          </div>
                          {selectedFile && (
                            <p className="text-xs text-muted-foreground">
                              Selecionado: {selectedFile.name}
                              {needsConversion(selectedFile) && (
                                <span className="text-yellow-500 ml-1">(será convertido para MP3)</span>
                              )}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {getConversionInfo()}
                          </p>
                        </div>
                        
                        {isConverting && (
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                            <Loader2 className="w-4 h-4 animate-spin text-accent" />
                            <span className="text-sm">{conversionStatus || "Convertendo áudio..."}</span>
                          </div>
                        )}
                        
                        <Button
                          onClick={handleUploadVoice}
                          disabled={isUploadingVoice || isConverting || !selectedFile || !newVoiceName.trim()}
                          className="w-full bg-accent hover:bg-accent/90"
                        >
                          {isConverting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Convertendo...
                            </>
                          ) : isUploadingVoice ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Criando voz...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              Criar Voz
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {customVoices.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                    Nenhuma voz personalizada criada ainda. Clique em "Adicionar Voz" para criar uma.
                  </p>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou escolha uma voz pronta</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Vozes Disponíveis</label>
                <div className="flex gap-2">
                  <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                    <SelectTrigger className="border-accent/50 flex-1">
                      <SelectValue placeholder="Escolha uma voz..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customVoices.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="flex items-center justify-between">
                            <span>⭐ Voz Personalizada</span>
                          </SelectLabel>
                          {customVoices.map((voice) => (
                            <div key={voice.voice_id} className="flex items-center justify-between pr-2">
                              <SelectItem value={voice.voice_id} className="flex-1">
                                {voice.voice_name}
                              </SelectItem>
                              <div className="flex items-center gap-1 ml-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playVoicePreview(voice.voice_id);
                                  }}
                                  disabled={loadingVoicePreview === voice.voice_id}
                                  className="p-1 hover:bg-accent/20 rounded"
                                  title="Testar voz"
                                >
                                  {loadingVoicePreview === voice.voice_id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : playingVoicePreview === voice.voice_id ? (
                                    <Pause className="w-3 h-3" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteVoice(voice.voice_id, voice.voice_name);
                                  }}
                                  disabled={deletingVoiceId === voice.voice_id}
                                  className="p-1 hover:bg-destructive/20 rounded text-destructive"
                                  title="Excluir voz"
                                >
                                  {deletingVoiceId === voice.voice_id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </SelectGroup>
                      )}
                      <SelectGroup>
                        <SelectLabel>👩 Mulher</SelectLabel>
                        {voices.filter(v => v.category === 'mulher').map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>👨 Homem</SelectLabel>
                        {voices.filter(v => v.category === 'homem').map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>👶 Criança</SelectLabel>
                        {voices.filter(v => v.category === 'crianca').map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>🎁 Bônus</SelectLabel>
                        {voices.filter(v => v.category === 'bonus').map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {selectedVoice && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => playVoicePreview(selectedVoice)}
                      disabled={loadingVoicePreview === selectedVoice}
                      className="border-accent/50 hover:bg-accent/10"
                      title="Testar voz"
                    >
                      {loadingVoicePreview === selectedVoice ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : playingVoicePreview === selectedVoice ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
                {selectedVoice && (
                  <p className="text-xs text-muted-foreground">
                    Clique no botão ao lado para testar a voz selecionada
                  </p>
                )}
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
                disabled={isGenerating || !text.trim() || !selectedVoice || !canGenerate}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando áudio...
                  </>
                ) : !canGenerate ? (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    Aguarde {formattedTime}
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
    </SystemLayout>
  );
};

export default AudioGenerator;
