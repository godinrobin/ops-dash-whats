import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Video, Check, Eye, X } from "lucide-react";
import deliverableAppPreview from "@/assets/deliverable-model-app.png";
import cursoVideoaulasPreview from "@/assets/curso-videoaulas-preview.png";

interface Template {
  id: string;
  name: string;
  description: string;
  image: string;
  features: string[];
  badge?: string;
  icon?: typeof Smartphone;
}

const templates: Template[] = [
  {
    id: "app-course",
    name: "App de Curso",
    description: "Entregável em formato de aplicativo móvel com módulos, progresso e certificado",
    image: deliverableAppPreview,
    features: [
      "Design mobile-first",
      "Barra de progresso",
      "Módulos expansíveis",
      "Certificado de conclusão",
      "Botão de WhatsApp",
      "Navegação estilo app",
    ],
    badge: "Popular",
    icon: Smartphone,
  },
  {
    id: "video-course",
    name: "Curso com Video Aulas",
    description: "Site com grid de aulas em vídeo, thumbnails e seção de materiais PDF",
    image: cursoVideoaulasPreview,
    features: [
      "Grid de vídeo aulas",
      "Thumbnails automáticos",
      "Numeração de aulas",
      "Seção de materiais PDF",
      "Design responsivo",
      "Player integrado",
    ],
    badge: "Novo",
    icon: Video,
  },
];

interface DeliverableTemplateSelectorProps {
  onSelect: (templateId: string) => void;
}

export const DeliverableTemplateSelector = ({ onSelect }: DeliverableTemplateSelectorProps) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  return (
    <>
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Escolha um Modelo</h2>
          <p className="text-muted-foreground">
            Selecione o formato do seu entregável digital
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {templates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredTemplate(template.id)}
              onMouseLeave={() => setHoveredTemplate(null)}
            >
              <Card
                className="cursor-pointer hover:border-accent transition-all hover:shadow-lg group overflow-hidden"
                onClick={() => onSelect(template.id)}
              >
                <CardHeader className="p-0 relative">
                  {/* Image container that fills and crops */}
                  <div className="aspect-[3/4] overflow-hidden bg-gradient-to-b from-muted/50 to-muted relative">
                    <img
                      src={template.image}
                      alt={template.name}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                    />
                    
                    {/* Preview button on hover */}
                    <AnimatePresence>
                      {hoveredTemplate === template.id && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(template.image);
                          }}
                          className="absolute top-2 left-2 p-1.5 bg-background/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-background transition-colors z-10"
                          title="Ver imagem completa"
                        >
                          <Eye className="w-3.5 h-3.5 text-foreground" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                  {template.badge && (
                    <Badge className="absolute top-2 right-2 bg-accent text-accent-foreground text-xs px-1.5 py-0.5">
                      {template.badge}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {template.icon ? <template.icon className="w-4 h-4 text-accent" /> : <Smartphone className="w-4 h-4 text-accent" />}
                    <CardTitle className="text-sm">{template.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs line-clamp-2">
                    {template.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}

        </div>
      </div>

      {/* Full Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative max-w-md max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-3 -right-3 p-2 bg-background rounded-full shadow-lg hover:bg-muted transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={previewImage}
                alt="Preview completo"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
