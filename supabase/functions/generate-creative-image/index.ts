import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { productName, includePrice, price, observation, modelType } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    let priceInstruction = '';
    if (includePrice && price) {
      priceInstruction = `\n- Include a price tag showing "R$ ${price}" prominently in the design with elegant typography.`;
    }

    let observationInstruction = '';
    if (observation && observation.trim()) {
      observationInstruction = `\n- Additional user instruction: ${observation}`;
    }

    let prompt = '';

    if (modelType === 'curso-criativo') {
      // Model 2 - Creative Course Style
      prompt = `Create a highly realistic square advertisement image (1:1 aspect ratio) with the following specifications:

LEFT SIDE – PRODUCT PHOTOGRAPHY:
– Photography of a handmade artisan object made with ${productName}, positioned on a light wooden table.
– The object should be centered on the left area, with natural shadows and diffused light, like late afternoon window light.
– Background with soft beige wall, minimalist style, without distractions.
– Include delicate elements around the product, such as dried flowers, small leaves and artisan details, to reinforce the creative and handmade atmosphere.
– Realistic photographic style, warm colors and pastel tones.
– High sharpness on the main object and slight blur in the background (shallow depth of field).

RIGHT SIDE – ORGANIZED TEXT AS ADVERTISEMENT:
Create a clean, well-organized white area with the following style:
– Large and eye-catching title in two colors, with strong contrast:
"TRANSFORME ${productName.toUpperCase()} EM UMA RENDA EXTRA!"
– Subtitle explaining that the user will learn everything in the complete course.
– List of topics with delicate icons like ✨, 🌿, 💐, 🎁, emphasizing what will be learned.
– Examples:
  – Como criar lembrancinhas
  – Técnicas especiais
  – Moldes, fornecedores e materiais
  – Projetos artesanais passo a passo
– Visual highlight for the product name written in vibrant color (red, pink or lilac).
– Footer with simple icons representing:
  – Aulas em vídeo
  – Certificado de participação
– All typography should be balanced, feminine and modern, following tones: black, pink, green and lilac.
${priceInstruction}

OVERALL AESTHETIC:
– Soft palette: white, beige, light pink, soft green, and details in red or lilac for highlight.
– Elegant, clean and artisanal visual.
– Square proportion (1:1), ideal for social networks.
– Style similar to creative course ads sold on Instagram.
${observationInstruction}

Produce in high resolution, realistic style, premium editorial photography.`;
    } else if (modelType === 'cartoon-cristao') {
      // Model 3 - Christian Cartoon Style
      prompt = `Create a digital illustration in Christian children's cartoon style, with simple, rounded strokes and happy expressions. The palette should be composed of warm and soft tones, mainly beige, brown, orange and olive green, conveying coziness and lightness. The scene should depict the theme "${productName}" in a playful and friendly way, with smiling characters in chibi style, big eyes, small mouth and clean strokes.

The composition should follow this format:

1. TOP PART (MAIN TEXT):
– Place a large and centered text, in bold style, with rounded childish typography.
– Example text:
"MAIS DE 30 LIVROS PARA COLORIR
LIBERADOS PARA VOCÊ"
(The text should be perfectly aligned at the top, in dark brown, contrasting with the light background. Adapt the text to match the theme "${productName}".)

2. ILLUSTRATED SCENE (CENTRAL PART):
– Create a scene with characters in cartoon style, with a cheerful, interactive and expressive atmosphere.
– The scene should directly refer to the theme "${productName}".
– Include natural elements such as stylized plants, large leaves and floor with simple texture.
– Soft and uniform lighting, without hard shadows.
– Thick lines and outline in dark brown.

3. CHARACTERS:
– Characters in chibi style, big heads, striking smiles, bright eyes and friendly expression.
– Simple clothes with minimal folds and earthy palette.
– Include at least 3–5 characters interacting or reacting happily to the theme "${productName}".
– If there is an animal (e.g.: donkey in the original image), include it also in chibi style, proportional to the scene style.

4. BOTTOM BUTTON (CTA):
– Create a wide button at the bottom, centered.
– Color: earthy brown with slight shine.
– Text in white, large and legible: "BAIXAR AGORA".
– Rounded format, cartoon style.

5. FINAL STYLE:
– Flat, harmonious visual, without excess information.
– Background in soft beige tone (#F9E3C1).
– Very high sharpness, 1:1 proportion.
– Cozy, friendly and spiritual aesthetic.
${priceInstruction}
${observationInstruction}

Important:
The entire composition should be coherent with a visual advertisement, maintaining adequate space for text and centering focus on the theme "${productName}".

Produce in high resolution (4K), illustration style, square format 1:1 aspect ratio.`;
    } else if (modelType === 'estudo-cinematico') {
      // Model 4 - Cinematic Study Style
      prompt = `Create an image in digital advertisement style, highly professional, following exactly these characteristics:

➡ AD THEME: ${productName}
(this will be the main title of the art)

GENERAL STYLE AND COMPOSITION
• Realistic setting, indoor environment with study, contemplation or focus atmosphere.
• Soft lighting, slightly dramatic, with natural shadows — cinematic style.
• Neutral color palette, with tones of gray, black, brown and white, referring to seriousness and depth.
• Atmosphere of concentration, discipline and personal transformation.

MAIN CHARACTER
• A young adult man studying at a table.
• Natural appearance, expression of deep focus, looking attentively at an open book.
• Dark skin, light shirt with subtle pattern.
• Posture leaning forward, holding a pen and taking notes.

OBJECTS IN THE COMPOSITION
• A light wooden table with two large open books, creating a feeling of intense study.
• Background environment with shelf containing books, decorative items and soft blurred lighting (light bokeh).
• No explicit religious elements unless they match the theme "${productName}".

TEXTS IN THE IMAGE (generated by the model)

1. Main title (at the top):
• Vibrant red background, white text in UPPERCASE.
• Text should strongly highlight the theme:
"${productName.toUpperCase()}"

2. Explanatory subtitle (middle of the image):
• Text in white, black and yellow, with keywords in different colors.
• Style like in the image:
"Método de memorização simples que está transformando o estudo."
(Automatically adapt the text to match the theme "${productName}".)

3. Call to action at the bottom:
• Dark background overlaying the table.
• Text in white:
TOQUE EM "SAIBA MAIS"

TECHNICAL QUALITIES
• Hyper-realistic rendering (cinematic realism).
• High resolution: 4K.
• Extreme sharpness on face and books; slightly blurred background.
• Strong contrast between light and shadow to reinforce emotional depth.
${priceInstruction}
${observationInstruction}

Produce in high resolution (4K), realistic style, square format 1:1 aspect ratio.`;
    } else if (modelType === 'vintage-religioso') {
      // Model 5 - Vintage Religious Style
      prompt = `Create a promotional art in vintage religious style, with classic aesthetic and golden tone, inspired by ancient pages of sacred books. The entire composition should follow an elegant, biblical and traditional visual, with soft baroque ornaments on the edges.

At the top of the art, place a realistic 3D illustration of a book with a cover similar to the "Holy Bible", but without real names. The cover should have detailed golden frames, dark leather texture and soft shine, with noble and antique appearance.

Also include small floating illustrations around (such as mini books, scrolls, stylized religious icons) in drawn style, with tones of gold and light brown.

Right below, insert the main title in classic serif font, with large, elegant letters, in a dark brown tone:

"${productName.toUpperCase()}"
(The theme should fit as the main title of the advertised product.)

Create a golden stripe right below with light 3D effect, like an old seal, but do not include price value unless specifically requested.

In the lower part, add three information blocks in organized and aligned layout, each accompanied by a minimalist golden icon:
1. Short description of what will be delivered, written in an inspiring and simple way.
2. Main benefit, highlighting ease, clarity or quick learning.
3. Final call, motivating the person to start today or receive the content immediately.

Keep the background with soft texture in gradient from beige to light gold, with ornamental arabesques on the sides referring to baroque sacred art.

In the footer, include a phrase in small serif font, also in dark brown, encouraging personal or spiritual transformation.

The entire art should convey authority, tradition, wisdom and clarity, with focus on a product related to knowledge, study or spirituality.
${priceInstruction}
${observationInstruction}

Produce in high resolution (4K), vintage illustration style, square format 1:1 aspect ratio.`;
    } else {
      // Model 1 - Calm Beige Editorial (default)
      prompt = `Create a highly realistic product photography advertisement image with the following specifications:

– Interior scene (living room) with "calm beige" aesthetic, warm, comfortable and soft tones.
– Blurred background with soft bokeh, containing a beige sofa on the left and a plant in a clay pot on the right, slightly out of focus.
– Diffused window light, creating soft and realistic shadows.
– Light wooden table in the foreground, occupying the lower part of the image, where the products will be positioned.
– Place three units of the product "${productName}" side by side on the table, each in a different color, with realistic texture, photographed as if they were handmade objects.
– The product colors should be harmonious: soft turquoise blue, light beige and warm terracotta.
– Photography with shallow depth of field, style of photo taken with 50mm f/1.8 prime lens.
– Extremely clean image, no noise, with sharp focus on the products.
– Editorial style, inspired by craft and decoration magazines.
– Add text boxes in the same style as the model:
– Top with a light yellow banner with text "AGORA DISPONÍVEL!" in dark blue bold font.
– Central text with modern and elegant typography, saying: "Mais de 1.000 modelos de ${productName} para você fazer em casa." in dark blue/navy color.
– At the bottom, another light yellow banner with text: "Toque no botão para receber tudo." in dark text.
– Layout must maintain exactly the proportion and visual structure of the reference ad.
– Overall atmosphere: cozy, artisanal, inviting and professional.
${priceInstruction}
${observationInstruction}

Produce in high resolution (4K), realistic style, premium editorial photography. Square format 1:1 aspect ratio.`;
    }

    console.log('Generating creative image with model:', modelType);
    console.log('Prompt:', prompt);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('OpenAI response received');

    // gpt-image-1 returns base64 data
    const imageData = data.data[0];
    
    return new Response(JSON.stringify({ 
      success: true,
      image: imageData.b64_json ? `data:image/png;base64,${imageData.b64_json}` : imageData.url
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in generate-creative-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
