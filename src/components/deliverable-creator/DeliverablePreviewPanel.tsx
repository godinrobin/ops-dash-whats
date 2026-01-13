import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Download,
  Code,
  RefreshCw,
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
import { AILoader } from "@/components/ui/ai-loader";

// Fixed mobile viewport
const MOBILE_WIDTH = 375;
const MOBILE_HEIGHT = 667;

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
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="p-3 border-b border-border bg-background flex items-center justify-between gap-2 flex-wrap flex-shrink-0 z-10">
        {/* Mobile indicator */}
        <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-1.5">
          <Smartphone className="w-4 h-4" />
          <span className="text-xs font-medium">Mobile</span>
          <Badge variant="outline" className="text-xs">
            {MOBILE_WIDTH}x{MOBILE_HEIGHT}
          </Badge>
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
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-[#1a1a1a]">
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
              <AILoader size={140} text="Gerando" />
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-lg shadow-2xl overflow-hidden"
              style={{
                width: MOBILE_WIDTH,
                height: MOBILE_HEIGHT,
                maxHeight: "calc(100% - 20px)",
              }}
            >
              {/* Device frame */}
              <div className="absolute top-0 left-0 right-0 h-6 bg-black rounded-t-lg flex items-center justify-center z-10">
                <div className="w-20 h-4 bg-black rounded-b-xl" />
              </div>
              
              <iframe
                key={iframeKey}
                srcDoc={html}
                title="Preview"
                className={`w-full h-full border-0 bg-white transition-all duration-300 ${isGenerating ? "blur-md" : ""}`}
                style={{
                  paddingTop: 24,
                }}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />

              {isGenerating && (
                <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-20">
                  <AILoader size={120} text="Gerando" />
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
