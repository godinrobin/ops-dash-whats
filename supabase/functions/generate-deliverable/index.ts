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

=== MODELO: APP DEVOCIONAL (template_id: devotional-app) ===

Quando o usuário escolher este modelo, crie um app de devocionais espiritual com esta estrutura:

1. HERO/HEADER
   - Fundo com gradiente suave (tons âmbar/dourado/bege)
   - Ícone circular com símbolo espiritual (livro aberto, coração, cruz estilizada)
   - Título do devocional grande e elegante (fonte serif)
   - Subtítulo com estrelas decorativas

2. CARD DE VERSÍCULO EM DESTAQUE
   - Card com efeito glass-morphism (fundo semi-transparente)
   - Ícone de coração ao lado
   - Texto do versículo em itálico
   - Referência bíblica em cor âmbar/dourada
   - Decorações sutis (folhas, estrelas)

3. BARRA DE BUSCA
   - Input com ícone de lupa
   - Placeholder: "Buscar por título ou tema..."
   - Bordas arredondadas, sombra suave

4. LISTA DE DEVOCIONAIS
   - Título da seção com emoji ✨
   - Cards com:
     - Emoji/ícone à esquerda
     - Título do devocional (ex: "Salmos 1-30")
     - Barra de progresso
     - Seta de navegação
   - Ao clicar, mostrar página do devocional

5. PÁGINA DO DEVOCIONAL (navegação inline)
   - Título do dia
   - Card do versículo principal
   - Seção "Reflexão" com texto
   - Seção "Para Refletir" com pergunta
   - Seção "Oração" com texto
   - Botão "Concluir Devocional"

6. SEÇÃO DE MATERIAIS (opcional)
   - Cards para PDFs com emoji 📄
   - Título e descrição
   - Botão de download

7. SEÇÃO DE CONTRIBUIÇÃO (opcional)
   - Card elegante com fundo gradiente
   - Título: "Apoie nosso ministério" ou similar
   - Valores pré-definidos (R$ 10, R$ 25, R$ 50)
   - Opção de valor customizado
   - Botão de confirmar

PALETA DE CORES:
- Principal: tons âmbar/dourado (#F59E0B, #D97706)
- Fundo: bege/cream claro (#FEF3C7, #FFFBEB)
- Texto: marrom escuro (#78350F, #451A03)
- Acentos: verde suave para CTAs (#059669)

ANIMAÇÕES:
- fade-in-up nos cards
- glow-pulse no versículo destaque
- float suave em elementos decorativos

=== MODELO: APP DE CURSO (template_id: app-course) ===

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

=== MODELO: CURSO COM VIDEO AULAS (template_id: video-course) ===

Quando o usuário escolher este modelo, siga EXATAMENTE esta estrutura:

1. HEADER SIMPLES
   - Fundo branco/claro
   - Ícone circular decorativo (ex: chapéu de formatura, símbolo relacionado ao nicho)
   - Fundo do ícone em tom rosa/cor principal claro

2. TÍTULO DO CURSO
   - Título grande e impactante centralizado (fonte bold, cor escura)
   - Subtítulo em itálico na cor principal (ex: "Aprenda do Zero!")
   - Descrição curta abaixo

3. GRID DE AULAS - MUITO IMPORTANTE
   Crie cards de aulas com este formato:
   
   \`\`\`html
   <div class="lesson-card">
     <div class="lesson-thumbnail">
       <span class="lesson-number">01</span>
       <img src="THUMBNAIL_URL" alt="Aula 1">
       <div class="play-button">▶</div>
     </div>
     <div class="lesson-info">
       <span class="lesson-label">AULA 01</span>
       <h3>Título da Aula</h3>
     </div>
   </div>
   \`\`\`
   
   ESTILOS DO CARD:
   - Thumbnail com aspect-ratio 16:9
   - Badge numérico (01, 02, 03...) no canto superior esquerdo
   - Badge circular com fundo da cor principal e texto branco
   - Botão de play centralizado sobre o thumbnail (círculo branco semi-transparente)
   - Label "AULA XX" em caixa alta, cor principal
   - Título da aula abaixo em preto/escuro
   
   Para YouTube: use https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg como thumbnail
   Para Vturb: use placeholder ou imagem fornecida
   
   GRID: 1 coluna no mobile, pode expandir em telas maiores

4. SEÇÃO DE MATERIAIS (opcional)
   Se o usuário quiser:
   - Título com emoji 📄 ou 📚
   - Cards simples para downloads de PDF
   - Link ou botão para cada material

5. NAVEGAÇÃO INFERIOR (estilo app)
   - Ícones para: Início, Aulas, Materiais, Perfil
   - Estilo fixo no bottom
   - Indicador visual da aba ativa

CORES:
- Use a cor principal para elementos de destaque (labels, badges, botões)
- Fundo geral branco ou muito claro
- Thumbnails com cantos arredondados (border-radius: 12px ou similar)
- Sombras suaves nos cards

=== REGRAS PARA VÍDEOS ===

Se o usuário pedir para adicionar vídeo aulas:
- Para links do YouTube, use iframe embed: <iframe src="https://www.youtube.com/embed/VIDEO_ID" ...></iframe>
- Para códigos Vturb, use o formato: <div id="vid_CODIGO"></div><script src="https://scripts.converteai.net/ID/players/CODIGO.js"></script>

=== SEÇÃO DE PIX (quando configurada) ===

Se o usuário configurar PIX, adicione uma seção elegante no final do site:
- Card com fundo suave (gradiente ou cor secundária)
- Ícone de PIX ou cifrão
- Título: "Apoie nosso trabalho" ou "Pagamento via PIX"
- Nome do titular em destaque
- Chave PIX em um campo copiável com botão "Copiar"
- Nome do banco abaixo
- Estilo clean e confiável
- Use o código de copiar COM FALLBACK para funcionar em iframes

Exemplo de estrutura:
\`\`\`html
<div class="pix-section">
  <div class="pix-card">
    <div class="pix-icon">💳</div>
    <h3>Pagamento via PIX</h3>
    <p class="pix-name">Nome do Titular</p>
    <div class="pix-key-container">
      <input type="text" readonly value="CHAVE_PIX" id="pixKey">
      <button onclick="
        var pixValue = document.getElementById('pixKey').value;
        var btn = this;
        try {
          navigator.clipboard.writeText(pixValue).then(function() {
            btn.textContent = 'Copiado!';
            setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
          }).catch(function() {
            var input = document.getElementById('pixKey');
            input.select();
            input.setSelectionRange(0, 99999);
            document.execCommand('copy');
            btn.textContent = 'Copiado!';
            setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
          });
        } catch(e) {
          var input = document.getElementById('pixKey');
          input.select();
          input.setSelectionRange(0, 99999);
          document.execCommand('copy');
          btn.textContent = 'Copiado!';
          setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
        }
      ">Copiar</button>
    </div>
    <p class="pix-bank">Banco: Nome do Banco</p>
  </div>
</div>
\`\`\`

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
      let templateInfo = "Use o MODELO: APP DE CURSO conforme descrito no system prompt.";
      if (config.templateId === "video-course") {
        templateInfo = "Use o MODELO: CURSO COM VIDEO AULAS conforme descrito no system prompt.";
      } else if (config.templateId === "devotional-app") {
        templateInfo = "Use o MODELO: APP DEVOCIONAL conforme descrito no system prompt.";
      }
      
      contextMessage = `
CONFIGURAÇÕES DO USUÁRIO (OBRIGATÓRIAS - SIGA EXATAMENTE):

- Template: ${config.templateId || "app-course"}
- ${templateInfo}
- Nicho/Tema: ${config.niche || "Não especificado"}

🎨 **CORES (OBRIGATÓRIAS - USE EXATAMENTE ESTAS CORES, NÃO INVENTE OUTRAS)**:
- COR PRINCIPAL: ${config.primaryColor || "#E91E63"} - Use esta cor para: botões, títulos, badges, elementos de destaque, gradientes primários
- COR SECUNDÁRIA: ${config.secondaryColor || "#FCE4EC"} - Use esta cor para: fundos, cards, elementos complementares, versões claras

⚠️ REGRA DE CORES: NÃO use rosa, roxo, magenta ou qualquer outra cor que NÃO seja as cores especificadas acima. 
Se a cor principal for "amarelo claro", use tons de amarelo (#FFEB3B, #FFF59D, #FFFDE7).
Se a cor secundária for "marrom escuro", use tons de marrom (#5D4037, #795548, #3E2723).
NUNCA substitua as cores do usuário por cores padrão do template!

- Público Alvo: ${config.targetAudience || "Não especificado"}
${config.templateId === "devotional-app" ? `
- Número de Devocionais: ${config.numberOfLessons || 30}
- Incluir Seção de Contribuição: ${config.includeContributionSection ? "Sim" : "Não"}
` : ""}
- Incluir Vídeo Aulas: ${config.includeVideos ? "Sim" : "Não"}
- Número de Aulas: ${config.numberOfLessons || "Não especificado"}
${config.videoLinks?.length > 0 ? `- Links de Vídeos: ${config.videoLinks.join(", ")}` : ""}
${config.includePdfSection ? "- Incluir seção de materiais PDF: Sim" : ""}
${config.includePix ? `
- INCLUIR SEÇÃO DE PIX: Sim
- Nome do Titular PIX: ${config.pixName || "Não especificado"}
- Chave PIX: ${config.pixKey || "Não especificada"}
- Banco: ${config.pixBank || "Não especificado"}
` : ""}
${config.additionalObservations ? `
- OBSERVAÇÕES ADICIONAIS DO USUÁRIO (IMPORTANTE, LEVE EM CONSIDERAÇÃO):
${config.additionalObservations}
` : ""}

🔴 LEMBRETE FINAL: Use EXATAMENTE as cores ${config.primaryColor} e ${config.secondaryColor} escolhidas pelo usuário. Não use cores padrão do template!

Gere o HTML completo seguindo EXATAMENTE o modelo indicado e essas especificações.`;
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
