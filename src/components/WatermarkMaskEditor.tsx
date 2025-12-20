import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Square } from "lucide-react";

interface MaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WatermarkMaskEditorProps {
  videoUrl: string;
  onMaskChange: (region: MaskRegion) => void;
}

export const WatermarkMaskEditor = ({ videoUrl, onMaskChange }: WatermarkMaskEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<MaskRegion | null>(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Handle video load
  const handleVideoLoad = useCallback(() => {
    if (videoRef.current && containerRef.current) {
      const video = videoRef.current;
      const container = containerRef.current;
      
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });

      // Calculate canvas size to fit container while maintaining aspect ratio
      const containerWidth = container.clientWidth;
      const aspectRatio = video.videoWidth / video.videoHeight;
      const canvasWidth = Math.min(containerWidth, 800);
      const canvasHeight = canvasWidth / aspectRatio;

      setCanvasDimensions({ width: canvasWidth, height: canvasHeight });
    }
  }, []);

  // Draw frame and mask
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw current rectangle if exists
    if (currentRect) {
      // Semi-transparent overlay
      ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
      
      // Border
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
      ctx.setLineDash([]);
    }
  }, [currentRect]);

  // Update canvas when video or rect changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, currentRect]);

  // Set default Sora watermark position (bottom right)
  const setDefaultSoraPosition = useCallback(() => {
    if (canvasDimensions.width === 0) return;

    // Sora watermark is typically in bottom right corner
    const rect: MaskRegion = {
      x: canvasDimensions.width - 150,
      y: canvasDimensions.height - 60,
      width: 140,
      height: 50,
    };

    setCurrentRect(rect);

    // Convert to video coordinates
    const scaleX = videoDimensions.width / canvasDimensions.width;
    const scaleY = videoDimensions.height / canvasDimensions.height;

    onMaskChange({
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    });
  }, [canvasDimensions, videoDimensions, onMaskChange]);

  // Get mouse position relative to canvas
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Handle touch position
  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentRect(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    const rect: MaskRegion = {
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    };

    setCurrentRect(rect);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect) return;
    
    setIsDrawing(false);

    // Convert canvas coordinates to video coordinates
    const scaleX = videoDimensions.width / canvasDimensions.width;
    const scaleY = videoDimensions.height / canvasDimensions.height;

    onMaskChange({
      x: currentRect.x * scaleX,
      y: currentRect.y * scaleY,
      width: currentRect.width * scaleX,
      height: currentRect.height * scaleY,
    });
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getTouchPos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentRect(null);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;

    const pos = getTouchPos(e);
    const rect: MaskRegion = {
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    };

    setCurrentRect(rect);
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  const clearMask = () => {
    setCurrentRect(null);
    drawCanvas();
  };

  // Seek video to first frame
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0.1;
    }
  }, [videoUrl]);

  return (
    <div ref={containerRef} className="space-y-4">
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={handleVideoLoad}
        onSeeked={drawCanvas}
        className="hidden"
        muted
      />

      <div className="flex justify-center gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={setDefaultSoraPosition}
        >
          <Square className="w-4 h-4 mr-2" />
          Posição padrão Sora
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearMask}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Limpar
        </Button>
      </div>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          className="border-2 border-accent rounded-lg cursor-crosshair touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {currentRect && (
        <p className="text-center text-sm text-muted-foreground">
          Região selecionada: {Math.round(currentRect.width)}x{Math.round(currentRect.height)} pixels
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Clique e arraste para desenhar um retângulo sobre a marca d'água
      </p>
    </div>
  );
};
