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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url).origin;

    console.log('HTML length:', html.length);

    // Extract title - improved regex
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description - improved
    let description = '';
    const descPatterns = [
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    ];
    for (const pattern of descPatterns) {
      const match = html.match(pattern);
      if (match) {
        description = match[1].trim();
        break;
      }
    }

    // Extract all meta tags
    const metaTags: { name: string; content: string }[] = [];
    const metaRegex = /<meta[^>]*(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(html)) !== null) {
      metaTags.push({ name: metaMatch[1], content: metaMatch[2] });
    }
    // Also match reversed order
    const metaRegex2 = /<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']([^"']+)["'][^>]*>/gi;
    while ((metaMatch = metaRegex2.exec(html)) !== null) {
      metaTags.push({ name: metaMatch[2], content: metaMatch[1] });
    }

    // Extract colors from inline styles, style tags, and CSS
    const colors: string[] = [];
    const colorPatterns = [
      /#[0-9A-Fa-f]{3,8}\b/g,
      /rgba?\s*\([^)]+\)/gi,
      /hsla?\s*\([^)]+\)/gi,
    ];
    
    // Get all style content
    const styleBlocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const inlineStyles = html.match(/style=["'][^"']+["']/gi) || [];
    const allStyleContent = [...styleBlocks, ...inlineStyles, html].join(' ');
    
    for (const pattern of colorPatterns) {
      const matches = allStyleContent.match(pattern) || [];
      colors.push(...matches);
    }
    
    // Normalize and dedupe colors
    const normalizedColors = colors.map(c => c.toLowerCase().replace(/\s+/g, ''));
    const uniqueColors = [...new Set(normalizedColors)]
      .filter(c => !c.includes('inherit') && !c.includes('transparent'))
      .slice(0, 20);

    // Extract fonts - improved
    const fontFamilies: string[] = [];
    
    // From font-family declarations
    const fontMatch = html.match(/font-family:\s*["']?([^;"']+)/gi) || [];
    fontMatch.forEach(f => {
      const fonts = f.replace(/font-family:\s*["']?/i, '').split(',');
      fonts.forEach(font => {
        const cleanFont = font.trim().replace(/["']/g, '');
        if (cleanFont && !fontFamilies.includes(cleanFont) && !['inherit', 'sans-serif', 'serif', 'monospace'].includes(cleanFont.toLowerCase())) {
          fontFamilies.push(cleanFont);
        }
      });
    });

    // Extract Google Fonts
    const googleFontsMatch = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&>\s]+)/gi) || [];
    googleFontsMatch.forEach(match => {
      const familyPart = match.split('family=')[1];
      if (familyPart) {
        const fonts = familyPart.split('|');
        fonts.forEach(f => {
          const fontName = f.split(':')[0]?.replace(/\+/g, ' ')?.split('&')[0];
          if (fontName && !fontFamilies.includes(fontName)) {
            fontFamilies.push(fontName);
          }
        });
      }
    });

    // Extract from @font-face
    const fontFaceMatch = html.match(/@font-face\s*{[^}]*font-family:\s*["']?([^"';]+)/gi) || [];
    fontFaceMatch.forEach(f => {
      const match = f.match(/font-family:\s*["']?([^"';]+)/i);
      if (match && !fontFamilies.includes(match[1].trim())) {
        fontFamilies.push(match[1].trim());
      }
    });

    // Detect CSS framework - improved
    let cssFramework = 'Custom CSS';
    const htmlLower = html.toLowerCase();
    if (htmlLower.includes('tailwindcss') || htmlLower.includes('tailwind') || html.includes('tw-')) cssFramework = 'Tailwind CSS';
    else if (htmlLower.includes('bootstrap') || html.includes('class="btn ') || html.includes('class="container')) cssFramework = 'Bootstrap';
    else if (htmlLower.includes('bulma')) cssFramework = 'Bulma';
    else if (htmlLower.includes('materialize') || htmlLower.includes('material-ui') || htmlLower.includes('mui')) cssFramework = 'Material UI';
    else if (htmlLower.includes('foundation')) cssFramework = 'Foundation';
    else if (htmlLower.includes('chakra')) cssFramework = 'Chakra UI';
    else if (htmlLower.includes('antd') || htmlLower.includes('ant-design')) cssFramework = 'Ant Design';

    // Extract images - much improved
    const images: { src: string; alt: string }[] = [];
    
    // Standard img tags
    const imgRegex = /<img[^>]+>/gi;
    const imgMatches = html.match(imgRegex) || [];
    imgMatches.forEach(imgTag => {
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const dataSrcMatch = imgTag.match(/data-src=["']([^"']+)["']/i);
      
      let src = srcMatch?.[1] || dataSrcMatch?.[1];
      if (src) {
        if (src.startsWith('//')) src = 'https:' + src;
        else if (src.startsWith('/')) src = baseUrl + src;
        else if (!src.startsWith('http') && !src.startsWith('data:')) src = baseUrl + '/' + src;
        
        if (!src.startsWith('data:') && !images.some(i => i.src === src)) {
          images.push({ src, alt: altMatch?.[1] || '' });
        }
      }
    });

    // Background images from inline styles
    const bgImageRegex = /background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/gi;
    let bgMatch;
    while ((bgMatch = bgImageRegex.exec(html)) !== null) {
      let src = bgMatch[1];
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = baseUrl + src;
      else if (!src.startsWith('http') && !src.startsWith('data:')) src = baseUrl + '/' + src;
      
      if (!src.startsWith('data:') && !images.some(i => i.src === src)) {
        images.push({ src, alt: 'background' });
      }
    }

    // Picture/source elements
    const sourceRegex = /<source[^>]*srcset=["']([^"']+)["'][^>]*>/gi;
    let sourceMatch;
    while ((sourceMatch = sourceRegex.exec(html)) !== null) {
      const srcset = sourceMatch[1].split(',')[0].trim().split(' ')[0];
      let src = srcset;
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = baseUrl + src;
      else if (!src.startsWith('http')) src = baseUrl + '/' + src;
      
      if (!images.some(i => i.src === src)) {
        images.push({ src, alt: 'responsive' });
      }
    }

    // Extract videos - improved
    const videos: { src: string; type: string }[] = [];
    
    // Video tags
    const videoRegex = /<video[^>]*>[\s\S]*?<\/video>/gi;
    const videoMatches = html.match(videoRegex) || [];
    videoMatches.forEach(video => {
      const srcMatch = video.match(/src=["']([^"']+)["']/);
      const sourceMatch = video.match(/<source[^>]*src=["']([^"']+)["']/);
      const src = srcMatch?.[1] || sourceMatch?.[1];
      if (src) {
        let fullSrc = src;
        if (src.startsWith('/')) fullSrc = baseUrl + src;
        videos.push({ src: fullSrc, type: 'video' });
      }
    });

    // YouTube/Vimeo embeds
    const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let iframeMatch;
    while ((iframeMatch = iframeRegex.exec(html)) !== null) {
      const src = iframeMatch[1];
      if (src.includes('youtube') || src.includes('youtu.be')) {
        videos.push({ src, type: 'YouTube' });
      } else if (src.includes('vimeo')) {
        videos.push({ src, type: 'Vimeo' });
      } else if (src.includes('wistia')) {
        videos.push({ src, type: 'Wistia' });
      }
    }

    // Extract headings - improved to handle nested tags
    const headings: string[] = [];
    const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let headingMatch;
    while ((headingMatch = headingRegex.exec(html)) !== null) {
      const text = headingMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text && text.length > 1 && !headings.includes(text)) {
        headings.push(text);
      }
    }

    // Extract paragraphs - improved
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null && paragraphs.length < 15) {
      const text = pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text && text.length > 30) paragraphs.push(text);
    }

    // Extract buttons - improved
    const buttons: string[] = [];
    
    // Button tags
    const btnTagRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
    let btnMatch;
    while ((btnMatch = btnTagRegex.exec(html)) !== null) {
      const text = btnMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text && text.length > 0 && text.length < 50 && !buttons.includes(text)) buttons.push(text);
    }
    
    // Links with button classes
    const btnLinkRegex = /<a[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((btnMatch = btnLinkRegex.exec(html)) !== null) {
      const text = btnMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text && text.length > 0 && text.length < 50 && !buttons.includes(text)) buttons.push(text);
    }
    
    // Input submit/button
    const inputBtnRegex = /<input[^>]*type=["'](?:submit|button)["'][^>]*value=["']([^"']+)["']/gi;
    while ((btnMatch = inputBtnRegex.exec(html)) !== null) {
      if (btnMatch[1] && !buttons.includes(btnMatch[1])) buttons.push(btnMatch[1]);
    }

    // Extract links
    const links: string[] = [];
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      if (!href.startsWith('#') && !href.startsWith('javascript') && !href.startsWith('mailto') && !href.startsWith('tel')) {
        links.push(href);
      }
    }

    // Detect sections/structure - improved
    const sections: string[] = [];
    const sectionTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div[class*="hero"]', 'div[class*="section"]'];
    
    const headerCount = (html.match(/<header[^>]*>/gi) || []).length;
    const navCount = (html.match(/<nav[^>]*>/gi) || []).length;
    const mainCount = (html.match(/<main[^>]*>/gi) || []).length;
    const sectionCount = (html.match(/<section[^>]*>/gi) || []).length;
    const articleCount = (html.match(/<article[^>]*>/gi) || []).length;
    const asideCount = (html.match(/<aside[^>]*>/gi) || []).length;
    const footerCount = (html.match(/<footer[^>]*>/gi) || []).length;
    
    if (headerCount > 0) sections.push(`header (${headerCount})`);
    if (navCount > 0) sections.push(`nav (${navCount})`);
    if (mainCount > 0) sections.push(`main (${mainCount})`);
    if (sectionCount > 0) sections.push(`section (${sectionCount})`);
    if (articleCount > 0) sections.push(`article (${articleCount})`);
    if (asideCount > 0) sections.push(`aside (${asideCount})`);
    if (footerCount > 0) sections.push(`footer (${footerCount})`);
    
    // Check for common section patterns
    if (html.includes('hero') || html.includes('banner')) sections.push('Hero/Banner');
    if (html.includes('testimonial')) sections.push('Testimonials');
    if (html.includes('pricing')) sections.push('Pricing');
    if (html.includes('faq') || html.includes('FAQ')) sections.push('FAQ');
    if (html.includes('contact')) sections.push('Contact');
    if (html.includes('feature')) sections.push('Features');

    // Detect layout type - improved
    let layout = 'Single column';
    if (html.includes('display: grid') || html.includes('display:grid') || html.match(/grid-template/)) {
      layout = 'CSS Grid layout';
    } else if (html.includes('display: flex') || html.includes('display:flex') || html.includes('flex-wrap')) {
      layout = 'Flexbox layout';
    }
    if (html.includes('sidebar') || html.includes('aside') || asideCount > 0) {
      layout += ' with sidebar';
    }
    if (html.match(/col-\d|grid-cols-/)) {
      layout = 'Multi-column grid layout';
    }

    // Detect technologies - much improved
    const technologies: string[] = [];
    
    // Frameworks
    if (html.includes('__NEXT_DATA__') || html.includes('_next/')) technologies.push('Next.js');
    else if (html.includes('_nuxt') || html.includes('__NUXT__')) technologies.push('Nuxt.js');
    else if (html.includes('react') || html.includes('__react') || html.includes('data-reactroot')) technologies.push('React');
    else if (html.includes('ng-') || html.includes('angular')) technologies.push('Angular');
    else if (html.includes('vue') || html.includes('__VUE__') || html.includes('v-')) technologies.push('Vue.js');
    else if (html.includes('svelte')) technologies.push('Svelte');
    
    // CMS/Platforms
    if (html.includes('wp-content') || html.includes('wordpress')) technologies.push('WordPress');
    if (html.includes('shopify') || html.includes('Shopify')) technologies.push('Shopify');
    if (html.includes('wix.com')) technologies.push('Wix');
    if (html.includes('webflow')) technologies.push('Webflow');
    if (html.includes('squarespace')) technologies.push('Squarespace');
    if (html.includes('elementor')) technologies.push('Elementor');
    if (html.includes('divi')) technologies.push('Divi');
    
    // Libraries
    if (html.includes('jquery') || html.includes('jQuery')) technologies.push('jQuery');
    if (html.includes('gsap') || html.includes('TweenMax')) technologies.push('GSAP');
    if (html.includes('swiper')) technologies.push('Swiper.js');
    if (html.includes('slick')) technologies.push('Slick Slider');
    if (html.includes('aos') || html.includes('data-aos')) technologies.push('AOS Animations');
    if (html.includes('wow.js') || html.includes('wowjs')) technologies.push('WOW.js');
    if (html.includes('lottie')) technologies.push('Lottie');
    
    // Analytics/Marketing
    if (html.includes('gtag') || html.includes('google-analytics') || html.includes('googletagmanager')) technologies.push('Google Analytics');
    if (html.includes('fbq') || (html.includes('facebook') && html.includes('pixel'))) technologies.push('Facebook Pixel');
    if (html.includes('hotjar')) technologies.push('Hotjar');
    if (html.includes('clarity')) technologies.push('Microsoft Clarity');
    if (html.includes('crisp')) technologies.push('Crisp Chat');
    if (html.includes('intercom')) technologies.push('Intercom');
    if (html.includes('tawk')) technologies.push('Tawk.to');
    if (html.includes('zendesk')) technologies.push('Zendesk');
    
    // Payment
    if (html.includes('stripe')) technologies.push('Stripe');
    if (html.includes('paypal')) technologies.push('PayPal');
    
    // Add CSS framework if detected
    if (cssFramework !== 'Custom CSS' && !technologies.includes(cssFramework)) {
      technologies.push(cssFramework);
    }

    // Extract scripts
    const scripts: string[] = [];
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      scripts.push(scriptMatch[1]);
    }

    console.log(`Analysis: ${images.length} images, ${videos.length} videos, ${headings.length} headings, ${technologies.length} technologies`);

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
      images,
      videos,
      technologies,
      links: links.length,
      metaTags,
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
        meta: metaTags.slice(0, 15),
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
  images: { src: string; alt: string }[];
  videos: { src: string; type: string }[];
  technologies: string[];
  links: number;
  metaTags: { name: string; content: string }[];
}): string {
  const colorsList = data.colors.length > 0 
    ? data.colors.slice(0, 10).map(c => `- ${c}`).join('\n')
    : '- Não foram detectadas cores específicas, use cores modernas e harmoniosas';

  const fontsList = data.fonts.length > 0
    ? data.fonts.map(f => `- "${f}"`).join('\n')
    : '- Use fontes modernas como Inter, Poppins, Montserrat ou Roboto';

  const sectionsList = data.sections.length > 0
    ? data.sections.map(s => `- ${s}`).join('\n')
    : '- Header\n- Hero Section\n- Content\n- Footer';

  const headingsList = data.headings.length > 0
    ? data.headings.slice(0, 10).map((h, i) => `${i + 1}. "${h}"`).join('\n')
    : '- Nenhum título específico detectado';

  const buttonsList = data.buttons.length > 0
    ? data.buttons.slice(0, 8).map(b => `- "${b}"`).join('\n')
    : '- Crie CTAs apropriados para o contexto do site';

  const imagesList = data.images.length > 0
    ? `${data.images.length} imagens detectadas:\n${data.images.slice(0, 5).map(img => `  - ${img.alt || 'Imagem'}: ${img.src.substring(0, 80)}...`).join('\n')}`
    : 'Nenhuma imagem específica detectada';

  const videosList = data.videos.length > 0
    ? `${data.videos.length} vídeos detectados:\n${data.videos.map(v => `  - ${v.type}: ${v.src.substring(0, 80)}...`).join('\n')}`
    : 'Nenhum vídeo detectado';

  const techList = data.technologies.length > 0
    ? data.technologies.map(t => `- ${t}`).join('\n')
    : '- Tecnologias padrão de web moderno';

  const paragraphsList = data.paragraphs.length > 0
    ? data.paragraphs.slice(0, 3).map(p => `"${p.substring(0, 200)}${p.length > 200 ? '...' : ''}"`).join('\n\n')
    : 'Use textos persuasivos e relevantes para o contexto do site.';

  return `# 🎯 PROMPT COMPLETO PARA RECRIAR SITE

## 📌 INFORMAÇÕES DO SITE ORIGINAL

**URL:** ${data.url}
**Título:** ${data.title || 'Não detectado'}
**Descrição:** ${data.description || 'Não detectada'}
**Total de Links:** ${data.links}

---

## 🎨 INSTRUÇÕES DETALHADAS DE DESIGN

### 1. ESTRUTURA E LAYOUT

**Tipo de Layout Detectado:** ${data.layout}

**Seções Identificadas:**
${sectionsList}

**Hierarquia de Títulos (H1-H6):**
${headingsList}

### 2. PALETA DE CORES

Utilize EXATAMENTE estas cores para manter a identidade visual:
${colorsList}

### 3. TIPOGRAFIA

Fontes utilizadas no site original:
${fontsList}

**Framework CSS:** ${data.cssFramework}
${data.cssFramework === 'Tailwind CSS' ? '✅ Utilize classes Tailwind nativas para estilização' : '⚠️ Converta os estilos para Tailwind CSS ou CSS modular'}

### 4. MÍDIA E RECURSOS VISUAIS

**Imagens:**
${imagesList}
${data.images.length > 0 ? '\n💡 Para recriar: Use imagens similares do Unsplash, Pexels ou Freepik, ou use placeholders de https://placehold.co' : ''}

**Vídeos:**
${videosList}
${data.videos.length > 0 ? '\n💡 Para recriar: Use iframes de embed ou componentes de vídeo similares' : ''}

### 5. ELEMENTOS INTERATIVOS

**Botões e CTAs detectados:**
${buttonsList}

### 6. CONTEÚDO DE TEXTO PRINCIPAL

${paragraphsList}

### 7. TECNOLOGIAS DETECTADAS

${techList}

---

## 🛠️ ESPECIFICAÇÕES TÉCNICAS PARA DESENVOLVIMENTO

### Stack Recomendado:
- **Framework:** React 18+ com TypeScript
- **Estilização:** Tailwind CSS
- **Build:** Vite
- **Animações:** Framer Motion ou CSS animations
- **Ícones:** Lucide React ou React Icons

### Estrutura de Componentes Sugerida:

\`\`\`
src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── Container.tsx
│   ├── sections/
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   ├── Testimonials.tsx
│   │   ├── Pricing.tsx
│   │   ├── FAQ.tsx
│   │   └── CTA.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Card.tsx
│       └── Input.tsx
├── pages/
│   └── LandingPage.tsx
└── styles/
    └── globals.css
\`\`\`

### Exemplo de Componente Hero:

\`\`\`tsx
import { motion } from 'framer-motion';

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center" 
             style={{ background: 'linear-gradient(135deg, ${data.colors[0] || '#1a1a1a'}, ${data.colors[1] || '#2d2d2d'})' }}>
      <div className="container mx-auto px-4 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-6xl font-bold text-white mb-6"
          style={{ fontFamily: '${data.fonts[0] || 'Inter'}, sans-serif' }}
        >
          ${data.headings[0] || data.title || 'Título Principal'}
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-white/80 mb-8 max-w-2xl mx-auto"
        >
          ${data.description || 'Descrição do produto ou serviço'}
        </motion.p>
        <motion.button 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-4 rounded-lg font-semibold text-lg transition-all shadow-lg hover:shadow-xl"
          style={{ backgroundColor: '${data.colors[0] || '#ffffff'}', color: '${data.colors[1] || '#000000'}' }}
        >
          ${data.buttons[0] || 'Começar Agora'}
        </motion.button>
      </div>
    </section>
  );
};

export default Hero;
\`\`\`

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Estrutura HTML semântica (header, main, section, footer)
- [ ] Design 100% responsivo (mobile-first)
- [ ] Cores e fontes exatamente como especificado
- [ ] Animações de entrada suaves (fade-in, slide-up)
- [ ] Hover effects em botões e links interativos
- [ ] Scroll suave entre seções
- [ ] Header sticky/fixo (se aplicável ao original)
- [ ] Imagens otimizadas com lazy loading
- [ ] Meta tags para SEO
- [ ] Acessibilidade (alt texts, contraste, navegação por teclado)
- [ ] Performance otimizada (Core Web Vitals)

---

## 🎯 OBSERVAÇÕES IMPORTANTES

1. **Fidelidade Visual:** Mantenha proporções, espaçamentos e alinhamentos do original
2. **Responsividade:** Teste em mobile (375px), tablet (768px) e desktop (1440px)
3. **Performance:** Otimize imagens e use lazy loading
4. **Acessibilidade:** Inclua alt texts e garanta contraste adequado
5. **SEO:** Adicione meta tags relevantes

---

**⚡ PROMPT GERADO AUTOMATICAMENTE**
Analisando: ${data.url}
${data.images.length} imagens | ${data.videos.length} vídeos | ${data.headings.length} títulos | ${data.technologies.length} tecnologias

Revise e ajuste conforme necessário para atender às suas necessidades específicas.`;
}
