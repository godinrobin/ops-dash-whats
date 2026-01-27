import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um desenvolvedor web especialista em criar sites mobile-first completos e funcionais. Sua tarefa é gerar um código HTML completo, moderno e funcional para um entregável digital em formato de site/app.

⚠️ LIMITAÇÕES IMPORTANTES - O QUE VOCÊ NÃO PODE FAZER:
- NÃO pode criar sistemas com banco de dados, autenticação de usuários, login/cadastro funcional
- NÃO pode criar sistemas de pagamento integrado (apenas exibição de chave PIX para cópia)
- NÃO pode criar e-commerce com carrinho funcional ou checkout real
- NÃO pode criar formulários que salvam dados em servidor
- NÃO pode criar sistemas de agendamento funcional com backend
- NÃO pode integrar com APIs externas ou serviços terceiros

Se o usuário pedir algo fora do escopo, responda APENAS com este HTML:
\`\`\`html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Fora do Escopo</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#1a1a2e,#16213e);color:white;text-align:center;padding:20px}.card{background:rgba(255,255,255,0.1);border-radius:20px;padding:40px;max-width:400px;backdrop-filter:blur(10px)}h1{font-size:1.5rem;margin-bottom:1rem}p{opacity:0.8;line-height:1.6}.emoji{font-size:3rem;margin-bottom:1rem}</style>
</head><body><div class="card"><div class="emoji">🚧</div><h1>Funcionalidade não disponível</h1><p>Desculpe, não consigo ajudar com essa solicitação. Meu objetivo é criar <strong>sites HTML simples e de alta conversão</strong> - landing pages, páginas de vendas, apps de conteúdo.</p><p style="margin-top:1rem;font-size:0.9rem">Não consigo criar sistemas com banco de dados, login, pagamentos integrados ou funcionalidades de backend.</p></div></body></html>
\`\`\`

✅ O QUE VOCÊ PODE FAZER:
- Sites de vendas/landing pages de alta conversão
- Apps de conteúdo (cursos, devocionais, ebooks)
- Páginas de captura de leads (visual apenas)
- Catálogos de produtos (visual)
- Portfolios e páginas institucionais
- Sites com navegação interna via JavaScript

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

=== MODELO: APP COM ACESSO PROTEGIDO (template_id: protected-app) ===

Quando o usuário escolher este modelo, crie um app elegante com múltiplas telas navegáveis via JavaScript:

**ESTRUTURA DE TELAS:**

1. TELA 1 - BOAS-VINDAS (tela inicial, class="screen active" data-screen="welcome")
   - Fundo com gradiente suave escuro (#1a1a2e -> #16213e ou tons escuros da cor secundária)
   - Círculos decorativos com blur posicionados no fundo (efeito bokeh, position: absolute)
   - Container centralizado (display: flex, flex-direction: column, align-items: center)
   - Foto de perfil circular (150x150) com borda ring na cor principal
   - Use placeholder: https://picsum.photos/150/150
   - Título em duas linhas:
     - Linha 1: texto claro/branco (ex: "Bolos Caseiros da")
     - Linha 2: nome em cor principal com gradiente (ex: "Chef Ana Clara")
   - Parágrafo de boas-vindas centralizado, texto claro com opacidade
   - Frase decorativa com corações: "❤️ Feito com amor para você ❤️" na cor principal
   - Botão CTA grande com gradiente (cor principal -> tom âmbar/laranja), border-radius grande
   - Texto do botão: "Acessar Conteúdo"
   - O botão deve chamar função JavaScript para ir para próxima tela

2. TELA 2 - CONTAGEM REGRESSIVA (class="screen" data-screen="countdown")
   - Mesmo fundo escuro
   - Ícone de relógio ou loading animado
   - Título: "Preparando seu conteúdo..."
   - Timer visual com caixas para minutos e segundos
   - Cada número em card com fundo semi-transparente, texto grande
   - Separador ":" entre minutos e segundos
   - Texto motivacional abaixo (ex: "Seu conteúdo exclusivo será liberado em breve!")
   - JavaScript: countdown que decrementa a cada segundo e ao zerar vai para próxima tela

3. TELA 3 - INSERIR SENHA (class="screen" data-screen="password")
   - Fundo escuro consistente
   - Ícone de cadeado grande (🔒 ou SVG)
   - Título: "Área Exclusiva" 
   - Subtítulo: "Insira a senha fornecida para acessar o conteúdo"
   - Input de senha (type="password") com estilo elegante
   - Botão "Acessar Conteúdo"
   - Div para mensagem de erro (display: none por padrão)
   - JavaScript: validar senha, mostrar erro com shake animation se incorreta

4. TELA 4 - CONTEÚDO PRINCIPAL (class="screen" data-screen="content")
   - Fundo claro (branco ou cor secundária clara)
   - Header com foto pequena e título
   - Área de conteúdo que muda conforme aba
   - Cada aba em uma div com data-page (ex: data-page="home", data-page="receitas")
   - Menu inferior fixo com ícones e labels
   - Indicador visual da aba ativa

**JAVASCRIPT OBRIGATÓRIO:**
\`\`\`javascript
<script>
  const PASSWORD = 'SENHA_AQUI';
  let countdownSeconds = MINUTOS * 60;
  const hasCountdown = INCLUIR_COUNTDOWN;
  const hasPassword = INCLUIR_PASSWORD;

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.querySelector('[data-screen="' + name + '"]');
    if (el) el.classList.add('active');
  }

  function startCountdown() {
    showScreen('countdown');
    const interval = setInterval(() => {
      countdownSeconds--;
      const m = Math.floor(countdownSeconds / 60);
      const s = countdownSeconds % 60;
      document.getElementById('timer-min').textContent = m.toString().padStart(2,'0');
      document.getElementById('timer-sec').textContent = s.toString().padStart(2,'0');
      if (countdownSeconds <= 0) {
        clearInterval(interval);
        showScreen(hasPassword ? 'password' : 'content');
      }
    }, 1000);
  }

  function checkPassword() {
    const input = document.getElementById('pwd-input').value;
    if (input === PASSWORD) {
      showScreen('content');
    } else {
      document.getElementById('pwd-error').style.display = 'block';
      document.getElementById('pwd-input').classList.add('shake');
      setTimeout(() => document.getElementById('pwd-input').classList.remove('shake'), 500);
    }
  }

  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-page="' + name + '"]').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-nav="' + name + '"]').classList.add('active');
  }

  document.getElementById('start-btn').onclick = () => {
    if (hasCountdown) startCountdown();
    else if (hasPassword) showScreen('password');
    else showScreen('content');
  };
</script>
\`\`\`

**CSS OBRIGATÓRIO:**
\`\`\`css
.screen { display: none; min-height: 100vh; }
.screen.active { display: flex; flex-direction: column; }
.page { display: none; }
.page.active { display: block; }
@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-10px)} 75%{transform:translateX(10px)} }
.shake { animation: shake 0.5s; }
.blur-circle { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.3; }
.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-around; padding: 12px; background: rgba(255,255,255,0.95); border-top: 1px solid rgba(0,0,0,0.1); }
\`\`\`

=== MODELO: BIBLIOTECA DE PDFs (template_id: pdf-library) ===

Quando o usuário escolher este modelo, crie um site elegante para exibição de materiais/PDFs em grid:

**ESTRUTURA:**

1. HEADER
   - Fundo com cor principal (gradiente opcional)
   - Logo/imagem centralizada (max-height: 150px)
   - Use placeholder: https://picsum.photos/200/150
   - Padding generoso, bordas arredondadas opcionais

2. MARQUEE ANIMADO (se configurado)
   - Barra horizontal com cor de destaque/secundária
   - Texto repetido rolando infinitamente
   - Símbolo separador entre repetições (• ou ●)
   
   \`\`\`html
   <div class="marquee-container">
     <div class="marquee-content">
       <span>TEXTO_DO_USUARIO • TEXTO_DO_USUARIO • TEXTO_DO_USUARIO • TEXTO_DO_USUARIO • </span>
       <span>TEXTO_DO_USUARIO • TEXTO_DO_USUARIO • TEXTO_DO_USUARIO • TEXTO_DO_USUARIO • </span>
     </div>
   </div>
   \`\`\`

   \`\`\`css
   .marquee-container {
     overflow: hidden;
     white-space: nowrap;
     background: COR_PRINCIPAL;
     padding: 10px 0;
   }
   .marquee-content {
     display: inline-block;
     animation: marquee 25s linear infinite;
   }
   .marquee-content span {
     color: white;
     font-weight: 600;
     font-size: 14px;
     text-transform: uppercase;
     letter-spacing: 1px;
   }
   @keyframes marquee {
     0% { transform: translateX(0); }
     100% { transform: translateX(-50%); }
   }
   \`\`\`

3. BARRA DE CONTATO (opcional)
   - Link de WhatsApp centralizado
   - Ícone + texto clicável
   - Fundo suave

4. GRID DE CARDS DE PDF
   - Container com padding lateral (16-24px)
   - Grid responsivo: repeat(auto-fill, minmax(150px, 1fr))
   - Gap: 16px

   \`\`\`html
   <div class="pdf-grid">
     <a href="#" class="pdf-card">
       <img src="https://picsum.photos/300/400?random=1" alt="Material 1">
       <h3>Título do Material</h3>
     </a>
     <!-- mais cards... -->
   </div>
   \`\`\`

   \`\`\`css
   .pdf-grid {
     display: grid;
     grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
     gap: 16px;
     padding: 20px;
     max-width: 600px;
     margin: 0 auto;
   }
   .pdf-card {
     background: white;
     border-radius: 16px;
     overflow: hidden;
     box-shadow: 0 4px 15px rgba(0,0,0,0.08);
     transition: all 0.3s ease;
     text-decoration: none;
     display: block;
   }
   .pdf-card:hover {
     transform: scale(1.05);
     box-shadow: 0 8px 25px rgba(0,0,0,0.15);
   }
   .pdf-card img {
     width: 100%;
     aspect-ratio: 3/4;
     object-fit: cover;
   }
   .pdf-card h3 {
     padding: 12px;
     text-align: center;
     font-size: 14px;
     font-weight: 600;
     color: COR_TEXTO;
     margin: 0;
   }
   \`\`\`

5. ESTILO DOS CARDS
   - Imagem de capa com aspect-ratio: 3/4
   - Cantos arredondados (border-radius: 16px)
   - Sombra suave
   - Hover: scale(1.05) + sombra maior
   - Título centralizado abaixo

6. CARDS "EM BREVE" (opcional)
   - Alguns cards podem ter overlay escuro
   - Badge "Em breve" centralizado
   - Pointer-events: none para desabilitar clique

CORES:
- Use a cor principal no header, marquee e elementos de destaque
- Fundo geral branco ou cor secundária muito clara
- Cards com fundo branco
- Texto escuro para contraste

=== MODELO: SUPER APP DE CONTEÚDO (template_id: super-app) ===

Este é o modelo mais completo e avançado. Gera um aplicativo web com múltiplas páginas navegáveis via JavaScript, similar a um app nativo.

**ESTRUTURA GLOBAL DO HTML:**

\`\`\`html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NOME_DO_APP</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>/* CSS AQUI */</style>
</head>
<body>
  <!-- Barra Superior com Timer -->
  <header class="trial-bar">
    <span>⏱️ Período de teste: <strong id="trialTimer">23h 59min</strong> restantes</span>
  </header>

  <!-- Conteúdo Principal (múltiplas páginas) -->
  <main id="app-content">
    <section data-page="home" class="page active"><!-- HOME --></section>
    <section data-page="aulas" class="page"><!-- AULAS --></section>
    <section data-page="ebooks" class="page"><!-- EBOOKS --></section>
    <section data-page="calculadora" class="page"><!-- CALCULADORA --></section>
    <section data-page="etiquetas" class="page"><!-- ETIQUETAS --></section>
    <section data-page="rendimento" class="page"><!-- RENDIMENTO --></section>
    <section data-page="catalogo" class="page"><!-- CATÁLOGO --></section>
    <section data-page="validade" class="page"><!-- VALIDADE --></section>
    <section data-page="quiz" class="page"><!-- QUIZ --></section>
    <section data-page="desafios" class="page"><!-- DESAFIOS --></section>
    <section data-page="favoritos" class="page"><!-- FAVORITOS --></section>
    <section data-page="agenda" class="page"><!-- AGENDA --></section>
    <section data-page="materiais" class="page"><!-- MATERIAIS --></section>
    <section data-page="config" class="page"><!-- CONFIG --></section>
  </main>

  <!-- Menu Inferior Fixo -->
  <nav class="bottom-nav">
    <button data-nav="materiais" onclick="showPage('materiais')">📦 Materiais</button>
    <button data-nav="home" class="active" onclick="showPage('home')">🏠 Início</button>
    <button data-nav="config" onclick="showPage('config')">⚙️ Config</button>
  </nav>

  <script>/* JAVASCRIPT AQUI */</script>
</body>
</html>
\`\`\`

**CSS GLOBAL OBRIGATÓRIO:**

\`\`\`css
:root {
  --primary: COR_PRINCIPAL;
  --primary-light: COR_SECUNDARIA;
  --gradient: linear-gradient(135deg, COR_SECUNDARIA 0%, white 100%);
  --text-dark: #1f2937;
  --text-muted: #6b7280;
  --shadow: 0 4px 15px rgba(0,0,0,0.08);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #f9fafb;
  min-height: 100vh;
  padding-bottom: 80px;
  padding-top: 45px;
}

.trial-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--primary-light);
  text-align: center;
  padding: 10px;
  font-size: 14px;
  z-index: 100;
  color: var(--text-dark);
}
.trial-bar strong { color: var(--primary); }

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
  z-index: 100;
}
.bottom-nav button {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.2s;
}
.bottom-nav button.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 600;
}

.page { display: none; padding: 16px; }
.page.active { display: block; }

.card {
  background: white;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}

.btn-primary {
  background: var(--primary);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  font-size: 16px;
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.15);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.back-btn {
  background: var(--primary-light);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 18px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-dark);
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 16px;
}
.menu-item {
  background: white;
  border-radius: 16px;
  padding: 20px 16px;
  text-align: left;
  cursor: pointer;
  border: none;
  box-shadow: var(--shadow);
  transition: transform 0.2s;
}
.menu-item:hover { transform: translateY(-2px); }
.menu-item-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 12px;
}
.menu-item-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-dark);
}
.menu-item-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}
\`\`\`

**PÁGINAS A GERAR (baseado nas funcionalidades selecionadas):**

**1. HOME (sempre incluir)**
- Header com gradiente usando cor secundária
- Foto de perfil circular centralizada (use https://picsum.photos/120/120)
- Nome do curso/app em destaque
- Subtítulo com cor principal
- Card de boas-vindas com emoji
- Botão "Grupo WhatsApp" (restrito/bloqueado)
- Título de seção "Menu Principal"
- Grid de menu com cards para cada funcionalidade ativa
- Título de seção "Ferramentas" (se houver calculadoras)
- Título de seção "Extras" (se houver quiz/desafios)

**2. AULAS (se includeVideoLessons)**
- Lista de aulas numeradas
- Cada aula com: número, título, iframe YouTube placeholder
- Botão favoritar (coração) em cada aula

**3. EBOOKS (se includePdfSection)**
- Cards para cada ebook/PDF
- Ícone colorido, título, descrição
- Botão "Abrir"

**4. CALCULADORA DE PRECIFICAÇÃO (se includePricingCalculator)**
\`\`\`html
<div class="card">
  <h3>💰 Calcule seu Preço</h3>
  <form id="pricingForm">
    <div class="form-group">
      <label>Custo dos Ingredientes (R$)</label>
      <input type="number" id="ingredientCost" placeholder="0.00" step="0.01">
    </div>
    <div class="form-group">
      <label>Rendimento (unidades)</label>
      <input type="number" id="yieldUnits" placeholder="1">
    </div>
    <div class="form-group">
      <label>Tempo Gasto (horas)</label>
      <input type="number" id="timeSpent" placeholder="1" step="0.5">
    </div>
    <div class="form-group">
      <label>Custos Operacionais (R$)</label>
      <input type="number" id="operationalCost" placeholder="0.00" step="0.01">
    </div>
    <button type="submit" class="btn-primary">Calcular</button>
  </form>
  <div id="pricingResults" class="results-box" style="display:none;">
    <div class="result-item"><span>Custo por Unidade:</span><strong id="costPerUnit">R$ 0,00</strong></div>
    <div class="result-item"><span>Preço Sugerido:</span><strong id="suggestedPrice">R$ 0,00</strong></div>
    <div class="result-item success"><span>Lucro por Unidade:</span><strong id="profit">R$ 0,00</strong></div>
  </div>
</div>
\`\`\`

**5. GERADOR DE ETIQUETAS (se includeLabelGenerator)**
- Campos: Sabor, Validade, Alérgenos, Peso
- Preview visual da etiqueta
- Estilo de etiqueta clean

**6. CALCULADORA DE RENDIMENTO (se includeYieldCalculator)**
- Input: Rendimento original da receita
- Input: Quantidade desejada
- Exibe fator multiplicador
- Card de dica

**7. CATÁLOGO (se includeFlavorsGuide)**
- Filtros: Todos, Fácil, Médio, Avançado
- Cards de produtos/sabores
- Badge de dificuldade
- Botão favoritar

**8. VALIDADE (se includeExpirationGuide)**
- Tabela com colunas: Produto, Ambiente, Geladeira, Freezer
- Seção de boas práticas
- Card de atenção/dica

**9. QUIZ (se includeQuiz)**
- Pergunta X de Y
- 4 opções de resposta (cards clicáveis)
- Feedback visual de acerto/erro
- Pontuação final
- Botão reiniciar

**10. DESAFIOS (se includeChallenges)**
- Card com pontos totais acumulados
- Lista de desafios semanais
- Cada desafio: título, descrição, pontos, checkbox
- Progresso salvo em localStorage

**11. FAVORITOS (se includeFavorites)**
- Lista de itens favoritados (localStorage)
- Estado vazio com ícone e instrução
- Botão remover de cada item

**12. AGENDA (se includeScheduler)**
- Botão "+ Novo Pedido"
- Lista de pedidos (localStorage)
- Cada pedido: cliente, data, quantidade, valor, status
- Botão deletar

**13. MATERIAIS & FORNECEDORES (se includeSuppliersPage)**
- Grid de cards com materiais/fornecedores
- Ícone, nome, descrição
- Badge "Em breve" se não disponível

**14. CONFIG**
- Card perfil com avatar e nome
- Opções: Notificações, Suporte, Sobre, Sair
- Versão do app

**JAVASCRIPT OBRIGATÓRIO:**

\`\`\`javascript
// Navegação entre páginas
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.querySelector('[data-page="' + pageName + '"]');
  if (page) page.classList.add('active');
  window.scrollTo(0, 0);
  
  // Atualiza nav ativa
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector('[data-nav="' + pageName + '"]');
  if (navBtn) navBtn.classList.add('active');
}

// Sistema de favoritos
function toggleFavorite(itemId, itemName) {
  let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  const index = favorites.findIndex(f => f.id === itemId);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push({ id: itemId, name: itemName, addedAt: Date.now() });
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateFavoriteButtons();
  renderFavorites();
}

function updateFavoriteButtons() {
  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const itemId = btn.dataset.itemId;
    const isFav = favorites.some(f => f.id === itemId);
    btn.textContent = isFav ? '❤️' : '🤍';
  });
}

function renderFavorites() {
  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  const container = document.getElementById('favoritesList');
  if (!container) return;
  
  if (favorites.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">💝</span><p>Nenhum favorito ainda</p><small>Toque no coração para adicionar</small></div>';
    return;
  }
  
  container.innerHTML = favorites.map(f => 
    '<div class="fav-item card"><span>' + f.name + '</span><button onclick="toggleFavorite(\\''+f.id+'\\', \\''+f.name+'\\')">🗑️</button></div>'
  ).join('');
}

// Timer de período de teste
function startTrialTimer(hours) {
  if (!hours) return;
  let totalSeconds = hours * 60 * 60;
  const timerEl = document.getElementById('trialTimer');
  if (!timerEl) return;
  
  setInterval(() => {
    totalSeconds--;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    timerEl.textContent = h + 'h ' + m + 'min';
    if (totalSeconds <= 0) timerEl.textContent = 'Expirado';
  }, 1000);
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
  updateFavoriteButtons();
  renderFavorites();
  startTrialTimer(TRIAL_HOURS);
});
\`\`\`

**CALCULADORA DE PRECIFICAÇÃO - JavaScript:**
\`\`\`javascript
document.getElementById('pricingForm')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const ingredientCost = parseFloat(document.getElementById('ingredientCost').value) || 0;
  const yieldUnits = parseFloat(document.getElementById('yieldUnits').value) || 1;
  const timeSpent = parseFloat(document.getElementById('timeSpent').value) || 0;
  const operationalCost = parseFloat(document.getElementById('operationalCost').value) || 0;
  
  const hourlyRate = 30;
  const laborCost = timeSpent * hourlyRate;
  const totalCost = ingredientCost + operationalCost + laborCost;
  const costPerUnit = totalCost / yieldUnits;
  const suggestedPrice = costPerUnit * 2.5;
  const profit = suggestedPrice - costPerUnit;
  
  document.getElementById('costPerUnit').textContent = 'R$ ' + costPerUnit.toFixed(2).replace('.', ',');
  document.getElementById('suggestedPrice').textContent = 'R$ ' + suggestedPrice.toFixed(2).replace('.', ',');
  document.getElementById('profit').textContent = 'R$ ' + profit.toFixed(2).replace('.', ',');
  document.getElementById('pricingResults').style.display = 'block';
});
\`\`\`

IMPORTANTE: Gere APENAS as páginas que o usuário selecionou nas funcionalidades. Adapte o menu da HOME para mostrar apenas os itens correspondentes às funcionalidades ativas.

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
    const { messages, config, chatMode, currentHtml, userAttachments } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // Handle chat mode - free conversation without HTML generation
    if (chatMode) {
      const chatSystemPrompt = `Você é um assistente especialista em criação de entregáveis digitais (sites, landing pages, apps de conteúdo). 
O usuário está usando uma ferramenta para criar sites HTML personalizados. 

Seu papel é:
- Responder perguntas sobre o projeto
- Dar sugestões de melhoria
- Ajudar a planejar o conteúdo
- Explicar conceitos de design e marketing

${config ? `
Contexto do projeto atual:
- Nicho: ${config.niche || "Não definido"}
- Cores: ${config.primaryColor || "Não definida"} (principal) / ${config.secondaryColor || "Não definida"} (secundária)
- Template: ${config.templateId || "Não definido"}
- Público-alvo: ${config.targetAudience || "Não definido"}
` : ""}

${currentHtml ? "O usuário já gerou um HTML para o projeto." : "O usuário ainda não gerou o HTML do projeto."}

IMPORTANTE: Você está no modo CONVERSA. NÃO gere código HTML. Apenas converse e ajude o usuário.
Responda de forma amigável, clara e concisa.`;

      const chatResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: chatSystemPrompt },
            ...messages,
          ],
          stream: false,
        }),
      });

      if (!chatResponse.ok) {
        if (chatResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errorText = await chatResponse.text();
        console.error("Chat mode error:", chatResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: "Erro ao processar mensagem" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const chatData = await chatResponse.json();
      const aiMessage = chatData.choices?.[0]?.message?.content || "Não consegui processar sua mensagem.";
      
      return new Response(
        JSON.stringify({ response: aiMessage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from config if provided
    let contextMessage = "";
    if (config) {
      let templateInfo = "Use o MODELO: APP DE CURSO conforme descrito no system prompt.";
      if (config.templateId === "video-course") {
        templateInfo = "Use o MODELO: CURSO COM VIDEO AULAS conforme descrito no system prompt.";
      } else if (config.templateId === "devotional-app") {
        templateInfo = "Use o MODELO: APP DEVOCIONAL conforme descrito no system prompt.";
      } else if (config.templateId === "protected-app") {
        templateInfo = "Use o MODELO: APP COM ACESSO PROTEGIDO conforme descrito no system prompt.";
      } else if (config.templateId === "pdf-library") {
        templateInfo = "Use o MODELO: BIBLIOTECA DE PDFs conforme descrito no system prompt.";
      } else if (config.templateId === "super-app") {
        templateInfo = "Use o MODELO: SUPER APP DE CONTEÚDO conforme descrito no system prompt.";
      }
      
      contextMessage = `
CONFIGURAÇÕES DO USUÁRIO (OBRIGATÓRIAS - SIGA EXATAMENTE):

- Template: ${config.templateId || "app-course"}
- ${templateInfo}
- Nicho/Tema: ${config.niche || "Não especificado"}

🎨 **CORES DO USUÁRIO (OBRIGATÓRIAS - USE EXATAMENTE ESTAS CORES EM TODO O SITE)**:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ COR PRINCIPAL: ${config.primaryColor} ⭐
   → Use para: botões, títulos, badges, ícones, links, bordas de destaque, gradientes
   
⭐ COR SECUNDÁRIA: ${config.secondaryColor} ⭐  
   → Use para: fundos, cards, containers, elementos complementares
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 REGRAS ABSOLUTAS DE CORES:
1. NÃO USE rosa (#E91E63, #FCE4EC) se o usuário NÃO escolheu rosa
2. NÃO USE as cores padrão do template - use APENAS as cores acima
3. Substitua TODAS as cores do template original pelas cores do usuário
4. Se a cor do usuário for "amarelo" → use tons de amarelo (#FFD700, #FFF59D, etc.)
5. Se a cor do usuário for "azul" → use tons de azul (#2196F3, #BBDEFB, etc.)
6. Cores default como #E91E63 e #FCE4EC só devem aparecer SE o usuário escolheu rosa

- Público Alvo: ${config.targetAudience || "Não especificado"}
${config.templateId === "devotional-app" ? `
- Número de Devocionais: ${config.numberOfLessons || 30}
- Incluir Seção de Contribuição: ${config.includeContributionSection ? "Sim" : "Não"}
` : ""}
${config.templateId === "protected-app" ? `
- Incluir Contagem Regressiva: ${config.includeCountdown ? "Sim, " + (config.countdownMinutes || 3) + " minutos" : "Não"}
- Proteção por Senha: ${config.includePasswordProtection ? "Sim" : "Não"}
${config.includePasswordProtection ? `- Senha de Acesso: ${config.accessPassword}` : ""}
- Abas do Menu: ${config.menuTabs?.join(", ") || "Início, Conteúdo, Materiais, Config"}
` : ""}
${config.templateId === "pdf-library" ? `
- Número de Cards/PDFs: ${config.numberOfPdfs || 12}
- Incluir Marquee Animado: ${config.includeMarquee ? "Sim" : "Não"}
${config.includeMarquee ? `- Texto do Marquee: "${config.marqueeText || "Conteúdo exclusivo •"}"` : ""}
` : ""}
${config.templateId === "super-app" ? `
- Nome do Produto: ${config.productName || config.niche || "Produto"}
- Período de Teste: ${config.trialPeriod || "24h"}
- FUNCIONALIDADES SELECIONADAS (gere APENAS estas páginas além da Home):
  - Vídeo Aulas: ${config.includeVideoLessons ? "SIM - Gerar página de aulas" : "NÃO"}
  - Ebooks/PDFs: ${config.includePdfSection ? "SIM - Gerar página de ebooks" : "NÃO"}
  - Calculadora de Precificação: ${config.includePricingCalculator ? "SIM - Gerar calculadora funcional" : "NÃO"}
  - Gerador de Etiquetas: ${config.includeLabelGenerator ? "SIM - Gerar página de etiquetas" : "NÃO"}
  - Calculadora de Rendimento: ${config.includeYieldCalculator ? "SIM - Gerar calculadora de rendimento" : "NÃO"}
  - Catálogo de Produtos: ${config.includeFlavorsGuide ? "SIM - Gerar catálogo com filtros" : "NÃO"}
  - Guia de Validade: ${config.includeExpirationGuide ? "SIM - Gerar tabela de validade" : "NÃO"}
  - Quiz Interativo: ${config.includeQuiz ? "SIM - Gerar quiz com perguntas" : "NÃO"}
  - Desafios Semanais: ${config.includeChallenges ? "SIM - Gerar sistema de desafios" : "NÃO"}
  - Sistema de Favoritos: ${config.includeFavorites ? "SIM - Gerar página de favoritos" : "NÃO"}
  - Agenda de Pedidos: ${config.includeScheduler ? "SIM - Gerar agenda com localStorage" : "NÃO"}
  - Materiais & Fornecedores: ${config.includeSuppliersPage ? "SIM - Gerar página de materiais" : "NÃO"}
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

🔴🔴🔴 LEMBRETE CRÍTICO DE CORES 🔴🔴🔴
A COR PRINCIPAL É: ${config.primaryColor}
A COR SECUNDÁRIA É: ${config.secondaryColor}
NÃO USE #E91E63 ou #FCE4EC (rosa padrão) a menos que o usuário tenha explicitamente escolhido rosa!
Se aparecer rosa no código e o usuário não pediu rosa, TROQUE pela cor que ele informou!

Gere o HTML completo seguindo EXATAMENTE o modelo indicado e usando AS CORES DO USUÁRIO.`;

      // Add user attachments info if provided
      if (userAttachments && Array.isArray(userAttachments) && userAttachments.length > 0) {
        contextMessage += `

📎 ARQUIVOS ENVIADOS PELO USUÁRIO PARA INCLUSÃO NO SITE:
${userAttachments.map((att: { index: number; type: string; name: string; url: string }) => 
  `- [ARQUIVO_${att.index}] ${att.type.toUpperCase()}: "${att.name}"`
).join('\n')}

🔴 INSTRUÇÕES OBRIGATÓRIAS PARA ARQUIVOS:
- Para IMAGENS enviadas: COPIE a URL completa do arquivo (data:image/...) e use em <img src="URL_AQUI" alt="descrição">
- Para PDFs enviados: COPIE a URL completa e use em <a href="URL_AQUI" download="nome.pdf">Baixar</a>
- Para VÍDEOS enviados: COPIE a URL completa e use em <video src="URL_AQUI" controls>
- As URLs completas dos arquivos estão nas mensagens do usuário marcadas como ARQUIVO_X_URL
- COPIE E COLE a URL INTEIRA (começando com data:...) no atributo src ou href`;
      }
    }

    // Build messages array
    const allMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(contextMessage ? [{ role: "user", content: contextMessage }] : []),
    ];

    // Process messages - if there are image attachments, convert to multimodal format
    for (const msg of messages) {
      if (msg.role === "user" && userAttachments && userAttachments.length > 0) {
        // Check if this message contains the attachment URLs
        const hasAttachmentUrls = typeof msg.content === "string" && msg.content.includes("ARQUIVO_");
        
        if (hasAttachmentUrls) {
          // Build multimodal content with text + images
          const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
            { type: "text", text: msg.content }
          ];
          
          // Add image attachments as image_url parts for better AI understanding
          for (const att of userAttachments) {
            if (att.type === "image" && att.url) {
              contentParts.push({
                type: "image_url",
                image_url: { url: att.url }
              });
            }
          }
          
          allMessages.push({ role: msg.role, content: contentParts });
        } else {
          allMessages.push({ role: msg.role, content: msg.content });
        }
      } else {
        allMessages.push({ role: msg.role, content: msg.content });
      }
    }

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