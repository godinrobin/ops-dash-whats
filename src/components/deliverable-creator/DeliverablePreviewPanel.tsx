import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Tablet,
  Monitor,
  Download,
  Code,
  RefreshCw,
  Loader2,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import JSZip from "jszip";
import { DeliverableConfig } from "@/pages/DeliverableCreator";

type Viewport = "mobile" | "tablet" | "desktop";

const viewportSizes: Record<Viewport, { width: number; label: string }> = {
  mobile: { width: 375, label: "Mobile" },
  tablet: { width: 768, label: "Tablet" },
  desktop: { width: 1024, label: "Desktop" },
};

interface DeliverablePreviewPanelProps {
  html: string;
  isGenerating: boolean;
  config: DeliverableConfig;
}

export const DeliverablePreviewPanel = ({
  html,
  isGenerating,
  config,
}: DeliverablePreviewPanelProps) => {
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [showCode, setShowCode] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const handleDownloadZip = async () => {
    if (!html) return;

    const zip = new JSZip();

    // Main HTML file
    zip.file("index.html", html);

    // README with instructions
    const readme = `# Entregável Digital

## Informações do Projeto
- **Nicho:** ${config.niche}
- **Cor Principal:** ${config.primaryColor}
- **Cor Secundária:** ${config.secondaryColor}
- **Público-Alvo:** ${config.targetAudience}

## Como Usar

1. Abra o arquivo \`index.html\` em qualquer navegador
2. Ou faça upload para qualquer hospedagem de sites estáticos (Netlify, Vercel, GitHub Pages)

## Hospedagem Gratuita

### GitHub Pages
1. Crie um repositório no GitHub
2. Faça upload do arquivo index.html
3. Ative o GitHub Pages nas configurações

### Netlify Drop
1. Acesse https://app.netlify.com/drop
2. Arraste a pasta com o index.html
3. Pronto! Seu site estará online

---
Gerado com ❤️ pelo Criador de Entregáveis
`;

    zip.file("README.md", readme);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entregavel-${config.niche?.toLowerCase().replace(/\s+/g, "-") || "app"}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-3 border-b border-border bg-background flex items-center justify-between gap-2 flex-wrap">
        {/* Viewport toggles */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
          {(Object.keys(viewportSizes) as Viewport[]).map((vp) => (
            <Button
              key={vp}
              variant={viewport === vp ? "default" : "ghost"}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewport(vp)}
            >
              {vp === "mobile" && <Smartphone className="w-4 h-4" />}
              {vp === "tablet" && <Tablet className="w-4 h-4" />}
              {vp === "desktop" && <Monitor className="w-4 h-4" />}
              <span className="ml-1.5 hidden sm:inline text-xs">
                {viewportSizes[vp].label}
              </span>
            </Button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={!html}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCode(true)}
            disabled={!html}
          >
            <Code className="w-4 h-4" />
            <span className="ml-1.5 hidden sm:inline">Código</span>
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadZip}
            disabled={!html}
            className="bg-green-600 hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            <span className="ml-1.5">ZIP</span>
          </Button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4 bg-[#1a1a1a]">
        <AnimatePresence mode="wait">
          {!html && !isGenerating ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Eye className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                O preview do seu app aparecerá aqui
              </p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Responda as perguntas no chat para gerar
              </p>
            </motion.div>
          ) : isGenerating && !html ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Gerando seu app...</p>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-lg shadow-2xl overflow-hidden"
              style={{
                width: viewportSizes[viewport].width,
                height: viewport === "mobile" ? 667 : viewport === "tablet" ? 1024 : 768,
                maxHeight: "calc(100% - 20px)",
              }}
            >
              {/* Device frame for mobile */}
              {viewport === "mobile" && (
                <div className="absolute top-0 left-0 right-0 h-6 bg-black rounded-t-lg flex items-center justify-center z-10">
                  <div className="w-20 h-4 bg-black rounded-b-xl" />
                </div>
              )}
              
              <iframe
                key={iframeKey}
                srcDoc={html}
                title="Preview"
                className="w-full h-full border-0"
                style={{
                  paddingTop: viewport === "mobile" ? 24 : 0,
                }}
                sandbox="allow-scripts allow-same-origin"
              />

              {isGenerating && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <Badge variant="secondary" className="gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Atualizando...
                  </Badge>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Code Dialog */}
      <Dialog open={showCode} onOpenChange={setShowCode}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Código HTML</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <pre className="p-4 bg-secondary/50 rounded-lg text-xs overflow-x-auto">
              <code>{html}</code>
            </pre>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(html)}
            >
              Copiar Código
            </Button>
            <Button onClick={handleDownloadZip}>
              <Download className="w-4 h-4 mr-2" />
              Baixar ZIP
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
