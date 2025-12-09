import { useState, useRef } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, Copy, FileAudio, Check } from "lucide-react";

const MAX_FILE_SIZE_MB = 25;
const MAX_DURATION_MINUTES = 10;
const ALLOWED_TYPES = ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/opus", "audio/webm"];

const AudioTranscriber = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.some(type => file.type.includes(type.split('/')[1]))) {
      toast({
        title: "Formato não suportado",
        description: "Por favor, envie arquivos MP3, OGG ou OPUS.",
        variant: "destructive",
      });
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      toast({
        title: "Arquivo muito grande",
        description: `O arquivo deve ter no máximo ${MAX_FILE_SIZE_MB}MB.`,
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    await transcribeAudio(file);
  };

  const transcribeAudio = async (file: File) => {
    setIsTranscribing(true);
    setTranscription("");

    try {
      const base64 = await fileToBase64(file);
      
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio: base64, mimeType: file.type },
      });

      if (error) throw error;

      if (data.text) {
        setTranscription(data.text);
        toast({
          title: "Sucesso",
          description: "Áudio transcrito com sucesso!",
        });
      }
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao transcrever áudio.",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcription);
      setCopied(true);
      toast({
        title: "Copiado!",
        description: "Texto copiado para a área de transferência.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar o texto.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-3xl">
          <header className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">📝 Transcrição de Áudio</h1>
            <p className="text-muted-foreground">
              Converta áudios em texto automaticamente
            </p>
          </header>

          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileAudio className="w-5 h-5 text-accent" />
                Enviar Áudio
              </CardTitle>
              <CardDescription>
                Formatos aceitos: MP3, OGG, OPUS (máx. {MAX_DURATION_MINUTES} minutos / {MAX_FILE_SIZE_MB}MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".mp3,.ogg,.opus,.webm,audio/mpeg,audio/ogg,audio/opus,audio/webm"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-accent/50 rounded-lg p-8 text-center cursor-pointer hover:border-accent transition-colors"
              >
                {isTranscribing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-10 h-10 animate-spin text-accent" />
                    <p className="text-sm text-muted-foreground">Transcrevendo áudio...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-accent" />
                    <p className="font-medium">
                      {fileName || "Clique para enviar um arquivo de áudio"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ou arraste e solte aqui
                    </p>
                  </div>
                )}
              </div>

              {transcription && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Transcrição</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copiar
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={transcription}
                    readOnly
                    rows={10}
                    className="border-accent/50 resize-none bg-muted/30"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {transcription.length} caracteres
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default AudioTranscriber;
