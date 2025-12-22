import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      throw new Error('URL is required');
    }

    console.log('Fetching URL:', url);

    // Fetch the page HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url).origin;

    console.log('HTML length:', html.length);

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract all meta tags
    const metaTags: { name: string; content: string }[] = [];
    const metaRegex = /<meta[^>]*(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
      metaTags.push({ name: metaMatch[1], content: metaMatch[2] });
    }

    // Extract colors from inline styles and style tags
    const colors: string[] = [];
    const colorPatterns = [
      /#[0-9A-Fa-f]{3,8}\b/g,
      /rgba?\([^)]+\)/gi,
      /hsla?\([^)]+\)/gi,
    ];
    
    for (const pattern of colorPatterns) {
      const matches = html.match(pattern) || [];
      colors.push(...matches);
    }
    const uniqueColors = [...new Set(colors)].slice(0, 20);

    // Extract fonts
    const fontFamilies: string[] = [];
    const fontMatch = html.match(/font-family:\s*["']?([^;"']+)/gi) || [];
    fontMatch.forEach(f => {
      const font = f.replace(/font-family:\s*["']?/i, '').split(',')[0].trim();
      if (font && !fontFamilies.includes(font)) {
        fontFamilies.push(font);
      }
    });

    // Extract Google Fonts
    const googleFontsMatch = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi) || [];
    googleFontsMatch.forEach(match => {
      const fontName = match.split('family=')[1]?.split('&')[0]?.replace(/\+/g, ' ')?.split(':')[0];
      if (fontName && !fontFamilies.includes(fontName)) {
        fontFamilies.push(fontName);
      }
    });

    // Detect CSS framework
    let cssFramework = 'Custom CSS';
    if (html.includes('tailwind') || html.includes('tw-')) cssFramework = 'Tailwind CSS';
    else if (html.includes('bootstrap')) cssFramework = 'Bootstrap';
    else if (html.includes('bulma')) cssFramework = 'Bulma';
    else if (html.includes('materialize')) cssFramework = 'Materialize';
    else if (html.includes('foundation')) cssFramework = 'Foundation';

    // Extract images
    const images: { src: string; alt: string }[] = [];
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      let src = imgMatch[1];
      if (src.startsWith('/')) src = baseUrl + src;
      else if (!src.startsWith('http')) src = baseUrl + '/' + src;
      images.push({ src, alt: imgMatch[2] || '' });
    }

    // Also check for background images
    const bgImageRegex = /background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/gi;
    let bgMatch;
    while ((bgMatch = bgImageRegex.exec(html)) !== null) {
      let src = bgMatch[1];
      if (src.startsWith('/')) src = baseUrl + src;
      else if (!src.startsWith('http')) src = baseUrl + '/' + src;
      images.push({ src, alt: 'background' });
    }

    // Extract videos
    const videos: { src: string; type: string }[] = [];
    const videoRegex = /<video[^>]*>[\s\S]*?<\/video>/gi;
    const videoMatches = html.match(videoRegex) || [];
    videoMatches.forEach(video => {
      const srcMatch = video.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        let src = srcMatch[1];
        if (src.startsWith('/')) src = baseUrl + src;
        videos.push({ src, type: 'video' });
      }
    });

    // Check for iframes (YouTube, Vimeo, etc.)
    const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let iframeMatch;
    while ((iframeMatch = iframeRegex.exec(html)) !== null) {
      const src = iframeMatch[1];
      if (src.includes('youtube') || src.includes('vimeo') || src.includes('wistia')) {
        videos.push({ src, type: 'embed' });
      }
    }

    // Extract headings
    const headings: string[] = [];
    const headingRegex = /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi;
    let headingMatch;
    while ((headingMatch = headingRegex.exec(html)) !== null) {
      const text = headingMatch[1].replace(/<[^>]+>/g, '').trim();
      if (text) headings.push(text);
    }

    // Extract paragraphs (first few for context)
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([^<]+)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null && paragraphs.length < 10) {
      const text = pMatch[1].replace(/<[^>]+>/g, '').trim();
      if (text && text.length > 20) paragraphs.push(text);
    }

    // Extract buttons
    const buttons: string[] = [];
    const btnRegex = /<button[^>]*>([^<]+)<\/button>|<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*>([^<]+)<\/a>|<input[^>]*type=["'](?:submit|button)["'][^>]*value=["']([^"']+)["']/gi;
    let btnMatch;
    while ((btnMatch = btnRegex.exec(html)) !== null) {
      const text = (btnMatch[1] || btnMatch[2] || btnMatch[3])?.replace(/<[^>]+>/g, '').trim();
      if (text && !buttons.includes(text)) buttons.push(text);
    }

    // Extract links
    const links: string[] = [];
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      if (!linkMatch[1].startsWith('#') && !linkMatch[1].startsWith('javascript')) {
        links.push(linkMatch[1]);
      }
    }

    // Detect sections/structure
    const sections: string[] = [];
    const sectionTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer'];
    sectionTags.forEach(tag => {
      const count = (html.match(new RegExp(`<${tag}[^>]*>`, 'gi')) || []).length;
      if (count > 0) sections.push(`${tag} (${count})`);
    });

    // Detect layout type
    let layout = 'Single column';
    if (html.includes('grid') || html.includes('display: grid')) layout = 'CSS Grid layout';
    else if (html.includes('flex') || html.includes('display: flex')) layout = 'Flexbox layout';
    if (html.includes('sidebar') || html.includes('aside')) layout += ' with sidebar';

    // Detect technologies
    const technologies: string[] = [];
    if (html.includes('react') || html.includes('__NEXT')) technologies.push('React');
    if (html.includes('vue') || html.includes('__VUE')) technologies.push('Vue.js');
    if (html.includes('angular')) technologies.push('Angular');
    if (html.includes('jquery') || html.includes('jQuery')) technologies.push('jQuery');
    if (html.includes('wordpress') || html.includes('wp-content')) technologies.push('WordPress');
    if (html.includes('shopify')) technologies.push('Shopify');
    if (html.includes('wix')) technologies.push('Wix');
    if (html.includes('webflow')) technologies.push('Webflow');
    if (html.includes('gtag') || html.includes('google-analytics')) technologies.push('Google Analytics');
    if (html.includes('facebook') && html.includes('pixel')) technologies.push('Facebook Pixel');
    if (html.includes('hotjar')) technologies.push('Hotjar');
    if (cssFramework !== 'Custom CSS') technologies.push(cssFramework);

    // Extract scripts
    const scripts: string[] = [];
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      scripts.push(scriptMatch[1]);
    }

    // Generate the detailed prompt
    const generatedPrompt = generatePrompt({
      url,
      title,
      description,
      layout,
      sections,
      colors: uniqueColors,
      fonts: fontFamilies,
      cssFramework,
      headings,
      paragraphs,
      buttons,
      images: images.length,
      videos: videos.length,
      technologies,
    });

    const result = {
      structure: {
        title,
        description,
        sections,
        layout,
      },
      styles: {
        colors: uniqueColors,
        fonts: fontFamilies,
        cssFramework,
      },
      media: {
        images: images.slice(0, 20),
        videos,
      },
      content: {
        headings: headings.slice(0, 20),
        paragraphs: paragraphs.slice(0, 5),
        buttons: buttons.slice(0, 10),
        links: links.slice(0, 20),
      },
      technical: {
        technologies,
        scripts: scripts.slice(0, 10),
        meta: metaTags.slice(0, 10),
      },
      generatedPrompt,
    };

    console.log('Analysis complete');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in clone-site function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generatePrompt(data: {
  url: string;
  title: string;
  description: string;
  layout: string;
  sections: string[];
  colors: string[];
  fonts: string[];
  cssFramework: string;
  headings: string[];
  paragraphs: string[];
  buttons: string[];
  images: number;
  videos: number;
  technologies: string[];
}): string {
  return `# Prompt para Recriar Site

## Site Original
URL: ${data.url}
Título: ${data.title}
Descrição: ${data.description}

---

## INSTRUÇÕES DETALHADAS

Crie um site landing page em **React com Tailwind CSS** que replique fielmente o design e estrutura do site original. Siga estas especificações:

### 1. ESTRUTURA E LAYOUT

**Tipo de Layout:** ${data.layout}

**Seções do Site (em ordem):**
${data.sections.map(s => `- ${s}`).join('\n')}

**Hierarquia de Conteúdo:**
${data.headings.slice(0, 10).map((h, i) => `${i + 1}. ${h}`).join('\n')}

### 2. DESIGN E ESTILO

**Paleta de Cores:**
Use EXATAMENTE estas cores no design:
${data.colors.slice(0, 10).map(c => `- ${c}`).join('\n')}

**Tipografia:**
${data.fonts.length > 0 ? data.fonts.map(f => `- Fonte: "${f}"`).join('\n') : '- Use fontes modernas como Inter, Poppins ou Montserrat'}

**Framework CSS:** ${data.cssFramework}
${data.cssFramework === 'Tailwind CSS' ? '- Utilize classes Tailwind nativas' : '- Converta os estilos para Tailwind CSS'}

### 3. COMPONENTES NECESSÁRIOS

**Botões/CTAs identificados:**
${data.buttons.slice(0, 8).map(b => `- "${b}"`).join('\n') || '- Crie CTAs apropriados para o contexto'}

**Elementos de Mídia:**
- ${data.images} imagens (use placeholders de https://placehold.co ou imagens relevantes do Unsplash)
- ${data.videos} vídeos (use iframes de exemplo ou componentes de vídeo)

### 4. CONTEÚDO DE TEXTO

**Parágrafos principais:**
${data.paragraphs.slice(0, 3).map(p => `"${p.substring(0, 150)}..."`).join('\n\n')}

### 5. FUNCIONALIDADES TÉCNICAS

**Tecnologias detectadas no original:**
${data.technologies.map(t => `- ${t}`).join('\n')}

**Implemente:**
- Design 100% responsivo (mobile-first)
- Animações suaves de entrada (fade-in, slide-up)
- Hover effects nos botões e links
- Scroll suave entre seções
- Header fixo/sticky (se aplicável)

### 6. ESTRUTURA DE COMPONENTES

Organize o código em componentes React reutilizáveis:
\`\`\`
src/
├── components/
│   ├── Header.tsx
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── Testimonials.tsx
│   ├── Pricing.tsx
│   ├── FAQ.tsx
│   ├── CTA.tsx
│   └── Footer.tsx
├── pages/
│   └── LandingPage.tsx
\`\`\`

### 7. EXEMPLO DE CÓDIGO INICIAL

\`\`\`tsx
// Exemplo de estrutura do componente Hero
const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[COR_PRIMARIA] to-[COR_SECUNDARIA]">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
          ${data.headings[0] || 'Título Principal'}
        </h1>
        <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
          ${data.description || 'Descrição do produto/serviço'}
        </p>
        <button className="bg-white text-[COR_PRIMARIA] px-8 py-4 rounded-lg font-semibold hover:shadow-xl transition-all">
          ${data.buttons[0] || 'Começar Agora'}
        </button>
      </div>
    </section>
  );
};
\`\`\`

### 8. CONSIDERAÇÕES FINAIS

- Mantenha a **proporção e espaçamento** visual do original
- Use **sombras sutis** para dar profundidade
- Implemente **transições suaves** (300ms ease-in-out)
- Garanta **acessibilidade** (alt texts, contraste adequado, navegação por teclado)
- O código deve ser **limpo, organizado e bem comentado**

---

**IMPORTANTE:** Este prompt foi gerado automaticamente analisando o site ${data.url}. Revise e ajuste conforme necessário para atender às suas necessidades específicas.`;
}
