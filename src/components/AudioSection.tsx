import { useState, useRef, useCallback, DragEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Upload, 
  Trash2, 
  Music, 
  Sparkles,
  Loader2,
  Play,
  Pause,
  Check,
  X,
  RefreshCw,
  Clock,
  AlertTriangle,
  Volume2
} from "lucide-react";

interface AudioClip {
  id: string;
  file?: File;
  url: string;
  name: string;
  storageUrl?: string;
  isGenerated?: boolean;
  copy?: string;
  duration?: number;
}

interface Voice {
  id: string;
  name: string;
  category: string;
}

const voices: Voice[] = [
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Mulher 35-40 anos', category: 'mulher' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Mulher Professor', category: 'mulher' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Mulher Idosa', category: 'mulher' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Homem 35-40 anos', category: 'homem' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Homem Idoso', category: 'homem' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Pastor na Igreja', category: 'famosos' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'FreiGilson', category: 'famosos' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Mulher Choramingando', category: 'bonus' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Carioca', category: 'bonus' },
];

const PREVIEW_TEXT = "Esta é a voz selecionada, gostou?";

// Estimate audio duration from text (approx 150 words per minute, avg 5 chars per word)
const estimateAudioDuration = (text: string): number => {
  const wordsPerMinute = 150;
  const avgCharsPerWord = 5;
  const words = text.length / avgCharsPerWord;
  const minutes = words / wordsPerMinute;
  return Math.ceil(minutes * 60); // Return seconds
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface AudioSectionProps {
  audioClips: AudioClip[];
  setAudioClips: React.Dispatch<React.SetStateAction<AudioClip[]>>;
  isGenerating: boolean;
  onUploadToStorage: (file: File) => Promise<string | null>;
  totalVideoDuration?: number;
}

export function AudioSection({ 
  audioClips, 
  setAudioClips, 
  isGenerating,
  onUploadToStorage,
  totalVideoDuration = 0
}: AudioSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // AI Copy Generation State
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [copyMode, setCopyMode] = useState<'insert' | 'create'>('create');
  const [productDescription, setProductDescription] = useState('');
  const [insertedCopy, setInsertedCopy] = useState('');
  const [generatedCopy, setGeneratedCopy] = useState('');
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [copyApproved, setCopyApproved] = useState(false);
  const [wantsVariations, setWantsVariations] = useState<boolean | null>(null);
  const [changeRequest, setChangeRequest] = useState('');
  const [showChangeInput, setShowChangeInput] = useState(false);
  
  // Voice Selection State
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Voice preview state
  const [voicePreviews, setVoicePreviews] = useState<Record<string, string>>({});
  const [loadingVoicePreview, setLoadingVoicePreview] = useState<string | null>(null);
  const [playingVoicePreview, setPlayingVoicePreview] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Step tracking
  const [aiStep, setAiStep] = useState<'copy' | 'variations' | 'voice' | 'preview' | 'done'>('copy');

  // Load voice previews from database on mount
  useEffect(() => {
    const loadVoicePreviews = async () => {
      const { data, error } = await supabase
        .from('voice_previews')
        .select('voice_id, audio_base64');
      
      if (data && !error) {
        const previews: Record<string, string> = {};
        data.forEach((item: any) => {
          previews[item.voice_id] = item.audio_base64;
        });
        setVoicePreviews(previews);
      }
    };
    
    loadVoicePreviews();
  }, []);

  // Calculate total audio duration from clips
  const totalAudioDuration = audioClips.reduce((total, clip) => total + (clip.duration || 0), 0);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    
    try {
      for (const file of Array.from(files)) {
        if (!file.type.includes('audio/mpeg') && !file.name.endsWith('.mp3')) {
          toast.error(`${file.name} não é um arquivo MP3 válido`);
          continue;
        }

        const storageUrl = await onUploadToStorage(file);
        
        if (!storageUrl) {
          toast.error(`Erro ao fazer upload de ${file.name}`);
          continue;
        }

        const localUrl = URL.createObjectURL(file);
        
        // Get audio duration
        const audio = new Audio(localUrl);
        const duration = await new Promise<number>((resolve) => {
          audio.addEventListener('loadedmetadata', () => {
            resolve(Math.ceil(audio.duration));
          });
          audio.addEventListener('error', () => resolve(0));
        });
        
        setAudioClips(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          file,
          url: localUrl,
          name: file.name,
          storageUrl,
          duration
        }]);
      }
      
      toast.success('Áudios enviados com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao adicionar áudios');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  }, []);

  const removeAudio = (id: string) => {
    setAudioClips(prev => {
      const audio = prev.find(a => a.id === id);
      if (audio && audio.url.startsWith('blob:')) {
        URL.revokeObjectURL(audio.url);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const generateCopy = async () => {
    if (copyMode === 'insert') {
      if (!insertedCopy.trim()) {
        toast.error('Insira a copy');
        return;
      }
      setGeneratedCopy(insertedCopy);
      setCopyApproved(false);
      setShowChangeInput(false);
      return;
    }

    if (!productDescription.trim()) {
      toast.error('Descreva o produto');
      return;
    }

    setIsGeneratingCopy(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-creative-copy', {
        body: { 
          action: 'generate',
          productDescription 
        }
      });

      if (error) throw error;

      setGeneratedCopy(data.copy);
      setCopyApproved(false);
      setShowChangeInput(false);
    } catch (error) {
      console.error('Error generating copy:', error);
      toast.error('Erro ao gerar copy');
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const modifyCopy = async () => {
    if (!changeRequest.trim()) {
      toast.error('Descreva a alteração desejada');
      return;
    }

    setIsGeneratingCopy(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-creative-copy', {
        body: { 
          action: 'modify',
          currentCopy: generatedCopy,
          changeRequest 
        }
      });

      if (error) throw error;

      setGeneratedCopy(data.copy);
      setChangeRequest('');
      setShowChangeInput(false);
    } catch (error) {
      console.error('Error modifying copy:', error);
      toast.error('Erro ao modificar copy');
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const approveCopy = () => {
    setCopyApproved(true);
    setAiStep('variations');
  };

  const handleVariationsChoice = async (wants: boolean) => {
    setWantsVariations(wants);
    setAiStep('voice');
  };

  const playVoicePreview = async (voiceId: string) => {
    // Stop any currently playing preview
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current = null;
    }
    
    if (playingVoicePreview === voiceId) {
      setPlayingVoicePreview(null);
      return;
    }

    // Check if we have cached preview
    if (voicePreviews[voiceId]) {
      const audioUrl = `data:audio/mpeg;base64,${voicePreviews[voiceId]}`;
      const audio = new Audio(audioUrl);
      voicePreviewAudioRef.current = audio;
      setPlayingVoicePreview(voiceId);
      
      audio.onended = () => {
        setPlayingVoicePreview(null);
      };
      
      audio.play();
      return;
    }

    // Generate preview
    setLoadingVoicePreview(voiceId);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-audio', {
        body: { 
          text: PREVIEW_TEXT,
          voiceId 
        }
      });

      if (error) throw error;

      const base64Audio = data.audioContent;
      
      // Save to database for all users
      const voice = voices.find(v => v.id === voiceId);
      await supabase
        .from('voice_previews')
        .upsert({
          voice_id: voiceId,
          voice_name: voice?.name || voiceId,
          audio_base64: base64Audio
        }, { onConflict: 'voice_id' });

      // Update local cache
      setVoicePreviews(prev => ({ ...prev, [voiceId]: base64Audio }));

      // Play the preview
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      voicePreviewAudioRef.current = audio;
      setPlayingVoicePreview(voiceId);
      
      audio.onended = () => {
        setPlayingVoicePreview(null);
      };
      
      audio.play();
    } catch (error) {
      console.error('Error generating voice preview:', error);
      toast.error('Erro ao gerar prévia da voz');
    } finally {
      setLoadingVoicePreview(null);
    }
  };

  const generateAudios = async () => {
    if (!selectedVoice) {
      toast.error('Selecione uma voz');
      return;
    }

    setIsGeneratingAudio(true);

    try {
      let copies = [generatedCopy];

      // If user wants variations, generate them
      if (wantsVariations) {
        const { data: varData, error: varError } = await supabase.functions.invoke('generate-creative-copy', {
          body: { 
            action: 'createVariations',
            copyToVary: generatedCopy 
          }
        });

        if (varError) throw varError;

        if (varData.variations) {
          copies = [generatedCopy, ...varData.variations];
        }
      }

      // Generate audio for the first copy (preview)
      const { data: audioData, error: audioError } = await supabase.functions.invoke('generate-audio', {
        body: { 
          text: copies[0],
          voiceId: selectedVoice 
        }
      });

      if (audioError) throw audioError;

      // Convert base64 to blob URL for preview
      const base64 = audioData.audioContent;
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mpeg' });
      const previewUrl = URL.createObjectURL(blob);

      setPreviewAudioUrl(previewUrl);
      setAiStep('preview');

      // Store copies for later
      (window as any).__pendingCopies = copies;

    } catch (error) {
      console.error('Error generating audio:', error);
      toast.error('Erro ao gerar áudio');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const playPreview = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const approveVoice = async () => {
    setIsGeneratingAudio(true);

    try {
      const copies = (window as any).__pendingCopies || [generatedCopy];
      const newAudioClips: AudioClip[] = [];

      for (let i = 0; i < copies.length; i++) {
        const copy = copies[i];
        
        // Generate audio
        const { data: audioData, error: audioError } = await supabase.functions.invoke('generate-audio', {
          body: { 
            text: copy,
            voiceId: selectedVoice 
          }
        });

        if (audioError) throw audioError;

        // Convert to blob
        const base64 = audioData.audioContent;
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/mpeg' });
        
        // Upload to storage
        const file = new File([blob], `audio-ia-${i + 1}.mp3`, { type: 'audio/mpeg' });
        const storageUrl = await onUploadToStorage(file);

        if (storageUrl) {
          const localUrl = URL.createObjectURL(blob);
          
          // Get audio duration
          const audio = new Audio(localUrl);
          const duration = await new Promise<number>((resolve) => {
            audio.addEventListener('loadedmetadata', () => {
              resolve(Math.ceil(audio.duration));
            });
            audio.addEventListener('error', () => resolve(estimateAudioDuration(copy)));
          });
          
          newAudioClips.push({
            id: `ia-${Date.now()}-${i}`,
            url: localUrl,
            name: i === 0 ? 'Áudio IA (Original)' : `Áudio IA (Variação ${i})`,
            storageUrl,
            isGenerated: true,
            copy,
            duration
          });
        }
      }

      setAudioClips(prev => [...prev, ...newAudioClips]);
      toast.success(`${newAudioClips.length} áudio(s) gerado(s) com sucesso!`);

      // Reset and close
      setShowAIDialog(false);
      resetAIState();

    } catch (error) {
      console.error('Error finalizing audios:', error);
      toast.error('Erro ao finalizar áudios');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const changeVoice = () => {
    setAiStep('voice');
    setPreviewAudioUrl(null);
    setIsPlaying(false);
  };

  const resetAIState = () => {
    setCopyMode('create');
    setProductDescription('');
    setInsertedCopy('');
    setGeneratedCopy('');
    setCopyApproved(false);
    setWantsVariations(null);
    setChangeRequest('');
    setShowChangeInput(false);
    setSelectedVoice('');
    setPreviewAudioUrl(null);
    setIsPlaying(false);
    setAiStep('copy');
    delete (window as any).__pendingCopies;
  };

  const estimatedCopyDuration = generatedCopy ? estimateAudioDuration(generatedCopy) : 0;

  return (
    <Card className="bg-background/95 border-2 border-accent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Music className="h-5 w-5 text-accent" />
          🎵 Áudio para Criativos (Opcional)
          <Badge variant="secondary" className="ml-auto">
            {audioClips.length} áudio(s)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div 
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging 
              ? 'border-accent bg-accent/10' 
              : 'border-muted-foreground/30'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Input
            type="file"
            accept=".mp3,audio/mpeg"
            multiple
            className="hidden"
            id="upload-audio"
            onChange={(e) => handleFileUpload(e.target.files)}
            disabled={isUploading || isGenerating}
          />
          <Label 
            htmlFor="upload-audio" 
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            {isUploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              Clique ou arraste arquivos MP3 aqui
            </span>
            <span className="text-xs text-muted-foreground/70">
              Apenas arquivos .mp3 são aceitos
            </span>
          </Label>
        </div>

        {/* Generate with AI Button */}
        <Button
          variant="outline"
          className="w-full border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
          onClick={() => setShowAIDialog(true)}
          disabled={isGenerating}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Gerar Áudio com IA
        </Button>

        {/* Audio List */}
        {audioClips.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {audioClips.map((audio) => (
              <div 
                key={audio.id}
                className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
              >
                <Music className="h-5 w-5 text-accent" />
                <span className="text-sm truncate flex-1">
                  {audio.name}
                  {audio.isGenerated && (
                    <Badge variant="outline" className="ml-2 text-xs">IA</Badge>
                  )}
                  {audio.duration && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({formatDuration(audio.duration)})
                    </span>
                  )}
                </span>
                {audio.storageUrl ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAudio(audio.id)}
                  disabled={isGenerating}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Audio Duration Warning */}
        {audioClips.length > 0 && totalAudioDuration > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg border border-muted-foreground/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Duração total dos áudios: <strong>{formatDuration(totalAudioDuration)}</strong></span>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              O tempo total do vídeo deve ser igual ou maior que o tempo do áudio.
            </p>
          </div>
        )}

        {/* AI Dialog */}
        <Dialog open={showAIDialog} onOpenChange={(open) => {
          if (!open) resetAIState();
          setShowAIDialog(open);
        }}>
          <DialogContent className="max-w-2xl bg-background border-2 border-accent max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Gerar Áudio com IA
              </DialogTitle>
            </DialogHeader>

            {aiStep === 'copy' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={copyMode === 'create' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCopyMode('create')}
                    className={copyMode === 'create' ? 'bg-purple-500 hover:bg-purple-600' : ''}
                  >
                    Criar Copy com IA
                  </Button>
                  <Button
                    variant={copyMode === 'insert' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCopyMode('insert')}
                    className={copyMode === 'insert' ? 'bg-purple-500 hover:bg-purple-600' : ''}
                  >
                    Inserir minha Copy
                  </Button>
                </div>

                {copyMode === 'create' ? (
                  <div className="space-y-2">
                    <Label>Descreva o produto/oferta</Label>
                    <Textarea
                      placeholder="Ex: Curso de artesanato em resina para iniciantes, ensina a fazer chaveiros e bijuterias..."
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      rows={4}
                      className="border-accent/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Descreva o que é o produto, público-alvo, principais benefícios, etc.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Cole sua Copy</Label>
                    <Textarea
                      placeholder="Cole aqui a copy que você já tem..."
                      value={insertedCopy}
                      onChange={(e) => setInsertedCopy(e.target.value)}
                      rows={6}
                      className="border-accent/50"
                    />
                    {insertedCopy && (
                      <div className="p-2 bg-muted/30 rounded-lg border border-muted-foreground/20">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Duração estimada do áudio: <strong>~{formatDuration(estimateAudioDuration(insertedCopy))}</strong></span>
                        </div>
                        <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          O tempo total do vídeo deve ser igual ou maior que o tempo do áudio.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={generateCopy}
                  disabled={isGeneratingCopy}
                  className="w-full bg-purple-500 hover:bg-purple-600"
                >
                  {isGeneratingCopy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {copyMode === 'create' ? 'Gerar Copy' : 'Usar esta Copy'}
                    </>
                  )}
                </Button>

                {generatedCopy && (
                  <div className="space-y-4 mt-4 p-4 bg-muted/50 rounded-lg">
                    <Label>Copy Gerada:</Label>
                    <p className="text-sm whitespace-pre-wrap">{generatedCopy}</p>
                    
                    {/* Duration estimate */}
                    <div className="p-2 bg-muted/30 rounded-lg border border-muted-foreground/20">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Duração estimada do áudio: <strong>~{formatDuration(estimatedCopyDuration)}</strong></span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        O tempo total do vídeo deve ser igual ou maior que o tempo do áudio.
                      </p>
                    </div>
                    
                    {!copyApproved && (
                      <div className="space-y-2">
                        {showChangeInput ? (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Descreva qual alteração você gostaria..."
                              value={changeRequest}
                              onChange={(e) => setChangeRequest(e.target.value)}
                              rows={2}
                              className="border-accent/50"
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={modifyCopy}
                                disabled={isGeneratingCopy}
                                size="sm"
                                className="bg-accent"
                              >
                                {isGeneratingCopy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar Alteração'}
                              </Button>
                              <Button
                                onClick={() => setShowChangeInput(false)}
                                variant="outline"
                                size="sm"
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              onClick={approveCopy}
                              className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Aprovar Copy
                            </Button>
                            <Button
                              onClick={() => setShowChangeInput(true)}
                              variant="outline"
                              className="flex-1"
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Solicitar Alteração
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {aiStep === 'variations' && (
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <Check className="h-5 w-5 text-green-500 inline mr-2" />
                  <span className="text-green-400">Copy aprovada!</span>
                </div>

                <div className="text-center py-4">
                  <p className="text-lg mb-4">Deseja que a IA crie variações desta copy?</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Serão criadas 2 variações com ganchos e abordagens diferentes, totalizando 3 copys.
                  </p>
                  <div className="flex justify-center gap-4">
                    <Button
                      onClick={() => handleVariationsChoice(true)}
                      className="bg-purple-500 hover:bg-purple-600"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Sim, criar variações
                    </Button>
                    <Button
                      onClick={() => handleVariationsChoice(false)}
                      variant="outline"
                    >
                      Não, usar apenas esta
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {aiStep === 'voice' && (
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <Check className="h-5 w-5 text-green-500 inline mr-2" />
                  <span className="text-green-400">
                    {wantsVariations ? '3 copys serão geradas' : '1 copy será gerada'}
                  </span>
                </div>

                <div className="space-y-3">
                  <Label>Escolha a voz</Label>
                  
                  {/* Voice list with preview buttons */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {['mulher', 'homem', 'famosos', 'bonus'].map((category) => (
                      <div key={category} className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase px-2">
                          {category === 'mulher' ? 'Mulher' : 
                           category === 'homem' ? 'Homem' : 
                           category === 'famosos' ? 'Famosos' : 'Bônus'}
                        </p>
                        {voices.filter(v => v.category === category).map(voice => (
                          <div 
                            key={voice.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                              selectedVoice === voice.id 
                                ? 'bg-purple-500/20 border border-purple-500/50' 
                                : 'bg-muted/30 hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedVoice(voice.id)}
                          >
                            <span className="text-sm">{voice.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoicePreview(voice.id);
                              }}
                              disabled={loadingVoicePreview === voice.id}
                              className="h-8 w-8 p-0"
                            >
                              {loadingVoicePreview === voice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : playingVoicePreview === voice.id ? (
                                <Pause className="h-4 w-4 text-purple-400" />
                              ) : (
                                <Volume2 className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={generateAudios}
                  disabled={!selectedVoice || isGeneratingAudio}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  {isGeneratingAudio ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando preview...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Gerar Preview
                    </>
                  )}
                </Button>
              </div>
            )}

            {aiStep === 'preview' && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-4">Preview do áudio (Copy Original)</p>
                  
                  <audio ref={audioRef} src={previewAudioUrl || ''} onEnded={() => setIsPlaying(false)} />
                  
                  <Button
                    onClick={playPreview}
                    variant="outline"
                    size="lg"
                    className="w-20 h-20 rounded-full border-2 border-accent"
                  >
                    {isPlaying ? (
                      <Pause className="h-8 w-8" />
                    ) : (
                      <Play className="h-8 w-8" />
                    )}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={approveVoice}
                    disabled={isGeneratingAudio}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isGeneratingAudio ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Gerando todos os áudios...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Aprovar e Gerar Todos
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={changeVoice}
                    variant="outline"
                    disabled={isGeneratingAudio}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Trocar Voz
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Ao aprovar, serão gerados {wantsVariations ? '3' : '1'} áudio(s) com esta voz
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
