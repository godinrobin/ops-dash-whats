import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Check } from "lucide-react";
import deliverableAppPreview from "@/assets/deliverable-model-app.png";

interface Template {
  id: string;
  name: string;
  description: string;
  image: string;
  features: string[];
  badge?: string;
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
  },
];

interface DeliverableTemplateSelectorProps {
  onSelect: (templateId: string) => void;
}

export const DeliverableTemplateSelector = ({ onSelect }: DeliverableTemplateSelectorProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Escolha um Modelo</h2>
        <p className="text-muted-foreground">
          Selecione o formato do seu entregável digital
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template, index) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card
              className="cursor-pointer hover:border-accent transition-all hover:shadow-lg group overflow-hidden"
              onClick={() => onSelect(template.id)}
            >
              <CardHeader className="p-0 relative">
                <div className="aspect-[9/16] max-h-80 overflow-hidden bg-gradient-to-b from-muted/50 to-muted flex items-center justify-center">
                  <img
                    src={template.image}
                    alt={template.name}
                    className="w-auto h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                {template.badge && (
                  <Badge className="absolute top-3 right-3 bg-accent text-accent-foreground">
                    {template.badge}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-5 h-5 text-accent" />
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                </div>
                <CardDescription className="mb-4">
                  {template.description}
                </CardDescription>
                <div className="space-y-1.5">
                  {template.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Coming Soon Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="opacity-50 cursor-not-allowed overflow-hidden">
            <CardHeader className="p-0">
              <div className="aspect-[9/16] max-h-80 bg-muted flex items-center justify-center">
                <div className="text-center p-6">
                  <Smartphone className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">Mais modelos em breve</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <CardTitle className="text-lg text-muted-foreground">Em breve</CardTitle>
              <CardDescription>
                Novos modelos de entregáveis serão adicionados
              </CardDescription>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};
