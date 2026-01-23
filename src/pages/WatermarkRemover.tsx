import { useState, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/useSplashedToast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Loader2, Play, ArrowLeft, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WatermarkMaskEditor } from "@/components/WatermarkMaskEditor";
import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { useCredits } from "@/hooks/useCredits";
import { SystemCreditBadge } from "@/components/credits/SystemCreditBadge";
import { InsufficientCreditsModal } from "@/components/credits/InsufficientCreditsModal";

interface MaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CREDIT_COST = 0.25;
const SYSTEM_ID = 'removedor_marca';

const WatermarkRemover = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Credits system
  const { isActive: isCreditsActive } = useCreditsSystem();
  const { deductCredits, canAfford } = useCredits();
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false);
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [maskRegion, setMaskRegion] = useState<MaskRegion | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string>("");
  const [step, setStep] = useState<"upload" | "mask" | "processing" | "done">("upload");

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast({
        title: "Formato inválido",
        description: "Por favor, selecione um arquivo de vídeo",
        variant: "destructive",
      });
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setStep("mask");
    setProcessedVideoUrl("");
    setMaskRegion(null);
  }, [toast]);

  const handleVideoLoad = useCallback(() => {
    if (videoRef.current) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  }, []);

  const handleMaskChange = useCallback((region: MaskRegion) => {
    setMaskRegion(region);
  }, []);

  const processVideo = async () => {
    if (!videoFile || !maskRegion) {
      toast({
        title: "Selecione a região",
        description: "Desenhe um retângulo sobre a marca d'água",
        variant: "destructive",
      });
      return;
    }

    // Check credits if system is active
    if (isCreditsActive) {
      if (!canAfford(CREDIT_COST)) {
        setShowInsufficientCredits(true);
        return;
      }
      
      const deducted = await deductCredits(CREDIT_COST, SYSTEM_ID, 'Remoção de marca d\'água');
      if (!deducted) {
        setShowInsufficientCredits(true);
        return;
      }
    }

    setIsProcessing(true);
    setStep("processing");
    setProgress(10);

    try {
      // Convert video to base64
      const reader = new FileReader();
      const videoBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(videoFile);
      });

      setProgress(30);

      // Send to edge function
      const { data, error } = await supabase.functions.invoke("remove-watermark", {
        body: {
          videoBase64,
          mask: {
            x: Math.round(maskRegion.x),
            y: Math.round(maskRegion.y),
            width: Math.round(maskRegion.width),
            height: Math.round(maskRegion.height),
          },
          videoDimensions,
        },
      });

      if (error) throw error;

      setProgress(90);

      if (data.videoUrl) {
        setProcessedVideoUrl(data.videoUrl);
        setStep("done");
        toast({
          title: "Vídeo processado!",
          description: "A marca d'água foi removida com sucesso",
        });
      } else if (data.requestId) {
        // Async processing - poll for status
        pollForResult(data.requestId);
      }
    } catch (error) {
      console.error("Error processing video:", error);
      toast({
        title: "Erro ao processar",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
      setStep("mask");
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const pollForResult = async (requestId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const checkStatus = async () => {
      attempts++;
      setProgress(30 + (attempts / maxAttempts) * 60);

      try {
        const { data, error } = await supabase.functions.invoke("remove-watermark", {
          body: { checkStatus: true, requestId },
        });

        if (error) throw error;

        if (data.status === "done" && data.videoUrl) {
          setProcessedVideoUrl(data.videoUrl);
          setStep("done");
          setProgress(100);
          toast({
            title: "Vídeo processado!",
            description: "A marca d'água foi removida com sucesso",
          });
        } else if (data.status === "failed") {
          throw new Error(data.error || "Falha no processamento");
        } else if (attempts < maxAttempts) {
          setTimeout(checkStatus, 3000);
        } else {
          throw new Error("Tempo limite excedido");
        }
      } catch (error) {
        console.error("Error checking status:", error);
        toast({
          title: "Erro ao verificar status",
          description: error instanceof Error ? error.message : "Tente novamente",
          variant: "destructive",
        });
        setStep("mask");
      }
    };

    checkStatus();
  };

  const resetProcess = () => {
    setVideoFile(null);
    setVideoUrl("");
    setMaskRegion(null);
    setProcessedVideoUrl("");
    setStep("upload");
    setProgress(0);
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>

          <Card className="border-2 border-accent">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl md:text-3xl flex items-center justify-center gap-2">
                <Wand2 className="w-8 h-8 text-accent" />
                Removedor de Marca d'Água
              </CardTitle>
              <CardDescription>
                Remova a marca d'água de vídeos gerados pela Sora 2
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {step === "upload" && (
                <div className="flex flex-col items-center gap-6">
                  <label className="w-full max-w-md cursor-pointer">
                    <div className="border-2 border-dashed border-accent/50 rounded-xl p-12 text-center hover:border-accent transition-colors">
                      <Upload className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium mb-2">
                        Arraste ou clique para enviar
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Suporta MP4, MOV, WEBM
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="text-center text-sm text-muted-foreground max-w-md">
                    <p className="mb-2">
                      <strong>Como funciona:</strong>
                    </p>
                    <ol className="list-decimal list-inside text-left space-y-1">
                      <li>Faça upload do vídeo com marca d'água</li>
                      <li>Marque a região da marca d'água</li>
                      <li>Clique em processar e aguarde</li>
                      <li>Baixe o vídeo sem marca d'água</li>
                    </ol>
                  </div>
                </div>
              )}

              {step === "mask" && videoUrl && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <p className="text-sm text-muted-foreground">
                      Desenhe um retângulo sobre a marca d'água que deseja remover
                    </p>
                  </div>

                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={handleVideoLoad}
                    className="hidden"
                  />

                  <WatermarkMaskEditor
                    videoUrl={videoUrl}
                    onMaskChange={handleMaskChange}
                  />

                  <div className="flex gap-4 justify-center">
                    <Button variant="outline" onClick={resetProcess}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={processVideo}
                      disabled={!maskRegion || isProcessing}
                      className="bg-accent hover:bg-accent/90"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4 mr-2" />
                          Remover Marca d'Água
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {step === "processing" && (
                <div className="text-center space-y-6">
                  <Loader2 className="w-16 h-16 mx-auto animate-spin text-accent" />
                  <div className="space-y-2">
                    <p className="text-lg font-medium">Processando vídeo...</p>
                    <p className="text-sm text-muted-foreground">
                      Isso pode levar alguns minutos dependendo do tamanho do vídeo
                    </p>
                  </div>
                  <Progress value={progress} className="w-full max-w-md mx-auto" />
                  <p className="text-sm text-muted-foreground">{Math.round(progress)}%</p>
                </div>
              )}

              {step === "done" && processedVideoUrl && (
                <div className="space-y-6">
                  <div className="text-center">
                    <p className="text-lg font-medium text-green-500 mb-4">
                      ✓ Marca d'água removida com sucesso!
                    </p>
                  </div>

                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                    <video
                      src={processedVideoUrl}
                      controls
                      className="w-full h-full"
                    />
                  </div>

                  <div className="flex gap-4 justify-center">
                    <Button variant="outline" onClick={resetProcess}>
                      Processar outro vídeo
                    </Button>
                    <a
                      href={processedVideoUrl}
                      download="video-sem-marca.mp4"
                      className="inline-flex"
                    >
                      <Button className="bg-accent hover:bg-accent/90">
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Vídeo
                      </Button>
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <InsufficientCreditsModal
        open={showInsufficientCredits}
        onOpenChange={setShowInsufficientCredits}
        requiredCredits={CREDIT_COST}
        systemName="Removedor de Marca d'Água"
      />
    </>
  );
};

export default WatermarkRemover;
