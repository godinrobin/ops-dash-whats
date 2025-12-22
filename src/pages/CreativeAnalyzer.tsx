import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Loader2, Video, Image, Star, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";

interface AnalysisResult {
  hookScore: number;
  hookAnalysis: string;
  bodyScore: number;
  bodyAnalysis: string;
  ctaScore: number;
  ctaAnalysis: string;
  coherenceScore: number;
  coherenceAnalysis: string;
  overallScore: number;
  overallAnalysis: string;
  transcription?: string;
}

const CreativeAnalyzer = () => {
  useActivityTracker("page_visit", "Analisador de Criativos");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [creativeType, setCreativeType] = useState<"video" | "image">("video");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (creativeType === "video") {
      if (!selectedFile.type.startsWith("video/")) {
        toast.error("Por favor, selecione um arquivo de vídeo válido");
        return;
      }
    } else {
      if (!selectedFile.type.startsWith("image/")) {
        toast.error("Por favor, selecione um arquivo de imagem válido");
        return;
      }
    }

    // Check file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo permitido: 50MB");
      return;
    }

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setAnalysisResult(null);
  };

  const uploadToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('video-clips')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('video-clips')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  const handleAnalyze = async () => {
    if (!file || !user) {
      toast.error("Selecione um arquivo para analisar");
      return;
    }

    setIsAnalyzing(true);
    try {
      // Upload file to storage
      const fileUrl = await uploadToStorage(file);

      if (creativeType === "video") {
        // Use existing analyze-creative-video edge function
        const { data, error } = await supabase.functions.invoke('analyze-creative-video', {
          body: {
            videoUrl: fileUrl,
            videoName: file.name,
            checkExisting: false
          }
        });

        if (error) throw error;

        // The edge function returns { success, analysis: { ...scores, transcription } }
        const analysis = data.analysis || data;

        setAnalysisResult({
          hookScore: analysis.hookScore,
          hookAnalysis: analysis.hookAnalysis,
          bodyScore: analysis.bodyScore,
          bodyAnalysis: analysis.bodyAnalysis,
          ctaScore: analysis.ctaScore,
          ctaAnalysis: analysis.ctaAnalysis,
          coherenceScore: analysis.coherenceScore,
          coherenceAnalysis: analysis.coherenceAnalysis,
          overallScore: analysis.overallScore,
          overallAnalysis: analysis.overallAnalysis,
          transcription: analysis.transcription
        });

        // Save to learnings table
        await supabase.from('ai_creative_learnings').insert({
          user_id: user.id,
          creative_type: 'video',
          creative_url: fileUrl,
          analysis_result: analysis,
          transcription: analysis.transcription
        });

      } else {
        // For images, use GPT Vision
        const { data, error } = await supabase.functions.invoke('analyze-creative-image', {
          body: {
            imageUrl: fileUrl,
            imageName: file.name
          }
        });

        if (error) throw error;

        setAnalysisResult({
          hookScore: data.hookScore,
          hookAnalysis: data.hookAnalysis,
          bodyScore: data.bodyScore,
          bodyAnalysis: data.bodyAnalysis,
          ctaScore: data.ctaScore,
          ctaAnalysis: data.ctaAnalysis,
          coherenceScore: data.coherenceScore,
          coherenceAnalysis: data.coherenceAnalysis,
          overallScore: data.overallScore,
          overallAnalysis: data.overallAnalysis
        });

        // Save to learnings table
        await supabase.from('ai_creative_learnings').insert({
          user_id: user.id,
          creative_type: 'image',
          creative_url: fileUrl,
          analysis_result: data
        });
      }

      toast.success("Análise concluída com sucesso!");
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast.error(error.message || "Erro ao analisar criativo");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const ScoreCard = ({ title, score, analysis }: { title: string; score: number; analysis: string }) => (
    <Card className="border-2 border-accent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {score}/100
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Progress value={score} className={`h-2 ${getProgressColor(score)}`} />
        </div>
        <p className="text-sm text-muted-foreground">{analysis}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-cyan-400" />
              Analisador de Criativos
            </h1>
            <p className="text-muted-foreground">
              Analise seus criativos com IA e receba feedback detalhado
            </p>
          </div>
        </div>

        {/* Type Selection */}
        <Card className="border-2 border-accent mb-6">
          <CardContent className="pt-6">
            <Tabs value={creativeType} onValueChange={(v) => {
              setCreativeType(v as "video" | "image");
              handleReset();
            }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="video" className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Vídeo
                </TabsTrigger>
                <TabsTrigger value="image" className="flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Imagem
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Upload Area */}
        <Card className="border-2 border-accent mb-6">
          <CardContent className="pt-6">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept={creativeType === "video" ? "video/*" : "image/*"}
              className="hidden"
            />
            
            {!previewUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-accent rounded-lg p-12 text-center cursor-pointer hover:bg-accent/5 transition-colors"
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  Clique para selecionar {creativeType === "video" ? "um vídeo" : "uma imagem"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {creativeType === "video" ? "MP4, MOV, WEBM (máx. 50MB)" : "JPG, PNG, WEBP (máx. 50MB)"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-lg overflow-hidden bg-black/50">
                  {creativeType === "video" ? (
                    <video 
                      src={previewUrl} 
                      controls 
                      className="w-full max-h-[400px] object-contain mx-auto"
                    />
                  ) : (
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full max-h-[400px] object-contain mx-auto"
                    />
                  )}
                </div>
                <div className="flex gap-3">
                  <Button 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Analisar Criativo
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Limpar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analysis Results */}
        {analysisResult && (
          <div className="space-y-4">
            {/* Overall Score */}
            <Card className="border-2 border-accent bg-gradient-to-br from-cyan-500/10 to-blue-500/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-400" />
                    Pontuação Geral
                  </CardTitle>
                  <div className={`text-4xl font-bold ${getScoreColor(analysisResult.overallScore)}`}>
                    {analysisResult.overallScore}/100
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={analysisResult.overallScore} className="h-3 mb-4" />
                <p className="text-muted-foreground">{analysisResult.overallAnalysis}</p>
              </CardContent>
            </Card>


            {/* Individual Scores */}
            <div className="grid md:grid-cols-2 gap-4">
              <ScoreCard 
                title="🎣 Hook (Gancho)" 
                score={analysisResult.hookScore} 
                analysis={analysisResult.hookAnalysis} 
              />
              <ScoreCard 
                title="📝 Corpo (Desenvolvimento)" 
                score={analysisResult.bodyScore} 
                analysis={analysisResult.bodyAnalysis} 
              />
              <ScoreCard 
                title="🎯 CTA (Chamada para Ação)" 
                score={analysisResult.ctaScore} 
                analysis={analysisResult.ctaAnalysis} 
              />
              <ScoreCard 
                title="🔗 Coerência" 
                score={analysisResult.coherenceScore} 
                analysis={analysisResult.coherenceAnalysis} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreativeAnalyzer;
