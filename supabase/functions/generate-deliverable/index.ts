import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um desenvolvedor web especialista em criar sites mobile-first completos e funcionais. Sua tarefa é gerar um código HTML completo, moderno e funcional para um entregável digital em formato de site/app.

REGRAS OBRIGATÓRIAS:
1. SEMPRE retorne APENAS o código HTML completo, sem explicações ou comentários fora do código
2. O HTML deve ser um documento completo e funcional que pode ser renderizado diretamente no navegador
3. Use CSS inline ou em tags <style> dentro do HTML
4. Use JavaScript vanilla em tags <script> quando necessário
5. Design mobile-first (width: 100%, max-width: 430px, margin: auto)
6. Use gradientes, sombras, animações suaves
7. Imagens de placeholder: use https://picsum.photos/LARGURA/ALTURA

ESTRUTURA DO SITE:
- Header com foto de perfil, nome do curso e instrutor
- Banner principal com imagem de boas-vindas
- Botão de WhatsApp para grupo
- Barra de progresso do curso
- Seção de certificado (bloqueado até completar)
- Menu principal com módulos/aulas
- Navegação inferior estilo app

NAVEGAÇÃO INFERIOR - MUITO IMPORTANTE:
O footer deve ter navegação entre páginas. Implemente um sistema de navegação JavaScript com múltiplas "telas" no mesmo HTML.
Cada aba deve mostrar conteúdo REAL e FUNCIONAL:

1. **Início/Home** - Conteúdo principal do curso
2. **Estudos/Aulas** - Lista de módulos e aulas com conteúdo
3. **Artigos/Blog** - Artigos educativos com texto real sobre o nicho
4. **Ajustes/Config** - Configurações do perfil, notificações, etc.

Exemplo de implementação:
\`\`\`javascript
// No HTML, cada seção deve ter um data-page
<section data-page="home" class="page active">...</section>
<section data-page="estudos" class="page">...</section>
<section data-page="artigos" class="page">...</section>
<section data-page="config" class="page">...</section>

// CSS
.page { display: none; }
.page.active { display: block; }

// JavaScript
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="' + pageName + '"]').classList.add('active');
  // Update navigation active state
}
\`\`\`

CONTEÚDO DAS PÁGINAS (NÃO DEIXE VAZIO):
- **Estudos**: Liste 4-6 módulos com ícones, título e descrição. Ao clicar, mostre lista de aulas.
- **Artigos**: Crie 3-4 cards de artigos com título, resumo e data sobre o nicho do usuário.
- **Config**: Seções para perfil, notificações, suporte, sobre, sair.

Se o usuário pedir para adicionar vídeo aulas:
- Crie seções de módulos expansíveis
- Para links do YouTube, use iframe embed
- Para códigos Vturb, use o formato: <div id="vid_CODIGO"></div><script src="https://scripts.converteai.net/ID/players/CODIGO.js"></script>

SEMPRE siga as cores e nicho especificados pelo usuário. Todos os textos devem ser relevantes ao nicho.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, config } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // Build context from config if provided
    let contextMessage = "";
    if (config) {
      contextMessage = `
CONFIGURAÇÕES DO USUÁRIO:
- Nicho: ${config.niche || "Não especificado"}
- Cor Principal: ${config.primaryColor || "#E91E63"}
- Cor Secundária: ${config.secondaryColor || "#FCE4EC"}
- Público Alvo: ${config.targetAudience || "Não especificado"}
- Incluir Vídeo Aulas: ${config.includeVideos ? "Sim" : "Não"}
${config.videoLinks?.length > 0 ? `- Links de Vídeos: ${config.videoLinks.join(", ")}` : ""}

Gere o HTML completo do app seguindo essas especificações.`;
    }

    const allMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(contextMessage ? [{ role: "user", content: contextMessage }] : []),
      ...messages,
    ];

    console.log("Generating deliverable with config:", config);
    console.log("Messages count:", allMessages.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: allMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar conteúdo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("generate-deliverable error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
