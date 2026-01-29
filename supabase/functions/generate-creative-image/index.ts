import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateUserAccess, forbiddenResponse } from "../_shared/validateAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Validate premium membership before processing
    const authHeader = req.headers.get('Authorization');
    const access = await validateUserAccess(authHeader, 'member');
    
    if (!access.isValid) {
      console.log('[SECURITY] Access denied for generate-creative-image:', access.error);
      return forbiddenResponse(access.error || 'Premium membership required', corsHeaders);
    }

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
    } else if (modelType === 'calistenia-urbano') {
      // Model 6 - Calistenia Urbano - Anúncio impactante estilo fitness
      prompt = `Create a highly impactful advertising image, in square format (1:1), professional digital ad style, focused on conversion, following these guidelines:

MAIN CONCEPT:
The image must clearly communicate the theme "${productName}", conveying transformation, power, results, simplicity and autonomy, in a visually intense and emotional way.

MAIN CHARACTER:
- A main character representing the target audience for "${productName}"
- Appearance appropriate for the product theme (confident, focused, determined)
- Strong and expressive body posture, demonstrating action, effort or mastery
- Performing an action directly related to "${productName}"
- Dramatic lighting with well-defined shadows creating depth and impact
- Setting appropriate for the product theme
- Warm color palette with reds, oranges and dark tones

SCENARIO:
- Environment appropriate for "${productName}"
- Slightly blurred background to highlight the character
- Sunset/dramatic lighting atmosphere
- Color palette: deep reds, oranges, blacks

VISUAL STYLE:
- Digital realistic or semi-realistic illustration
- High contrast
- Strong and emotional colors
- Modern, clean and aggressive visual
- Ultra HD quality, 4K, cinematic lighting
- Professional paid ads creative appearance

TEXT IN IMAGE (STRONG AND LEGIBLE TYPOGRAPHY):

MAIN TITLE (TOP):
Large text, uppercase, attention-grabbing and direct about "${productName.toUpperCase()}"

BENEFITS LIST (with prohibition icons ⊘ or checkmarks ✅):
- List 3-4 key benefits of "${productName}"
- Each benefit in short, impactful phrases

SUPPORT PHRASE with fire emoji 🔥:
A motivational phrase related to "${productName}"

CHECKLIST with checkmarks ✅:
- Key features included in "${productName}"
- Quantity of content or time to results

CTA (bottom right):
"Acesse agora" or "Saiba mais"
${priceInstruction}
${observationInstruction}

IMPORTANT RULES:
- Do NOT include real brands
- Do NOT visually pollute
- Do NOT use long texts
- All text must be about "${productName}", NOT about fitness/calisthenics unless that's the actual product

Produce in ultra HD, 4K resolution, extreme sharpness, perfectly legible texts, no distortions, square format 1:1 aspect ratio.`;
    } else if (modelType === 'curso-tecnico-cartoon') {
      // Model 7 - Curso Técnico Cartoon - Ilustração vetorial educativa
      prompt = `Create a highly professional digital advertising image, in square format (1:1), modern semi-realistic vector illustration style, with educational and commercial aesthetic, ideal for social media ads.

MAIN THEME: ${productName}

SCENARIO:
Visual environment related to the theme "${productName}", with graphic elements and objects that clearly represent this product niche. The background should be clean, with smooth gradients or modern solid colors, conveying authority, clarity and professionalism.
- Dark teal/green background with gradient (or color appropriate for "${productName}")

MAIN CHARACTER:
A friendly and confident illustrated character (man or woman appropriate for the theme), in modern and well-detailed cartoon style, looking at the camera, smiling slightly, conveying confidence, mastery and didactics.
- Wearing attire appropriate for "${productName}" theme
- Holding or interacting with elements directly linked to "${productName}"
- Professional appearance, friendly smile
- Workbook or material with "${productName}" visible

COMPLEMENTARY VISUAL ELEMENTS:
- Floating icons or objects related to "${productName}"
- Visual details reinforcing learning, method, practice or transformation
- Clean, well-lit illustration with defined contours and harmonic colors
- Flat + depth style (soft shadows and slight depth)
- Elements visually representing "${productName}"

TEXT IN IMAGE (STRONG AND LEGIBLE TYPOGRAPHY):

MAIN TITLE (LARGE, IN HIGHLIGHT):
"${productName.toUpperCase()}"

EXPLANATORY SUBTITLE:
A subtitle describing the main content/benefit of "${productName}"

BOTTOM CTA:
"AULAS AO VIVO DIRETO NO" with WhatsApp icon, or similar CTA
${priceInstruction}
${observationInstruction}

IMPORTANT:
- Do NOT include price or monetary values unless specified
- Texts should be short, impactful and highly legible
- Use high contrast between text and background
- Visual language compatible with high conversion ads
- ALL content must be about "${productName}"

GRAPHIC STYLE:
Professional digital illustration, premium infographic style, clean stroke, vibrant but balanced colors, modern and reliable appearance, similar to educational materials and ads for courses, training or digital products.

QUALITY:
Ultra high resolution, extremely sharp, perfect lighting, balanced composition, ready for Instagram, Facebook and WhatsApp ads, square format 1:1 aspect ratio.`;
    } else if (modelType === 'curso-tecnico-realista') {
      // Model 8 - Curso Técnico Realista - Anúncio profissional tecnológico
      prompt = `Create a highly professional, modern and persuasive digital advertising image, in square format (1:1), high conversion ad style for social media, with premium, technological and reliable aesthetic, focused on education, training or practical solution.

MAIN THEME: ${productName}

MAIN CHARACTER:
Include a realistic or semi-realistic human character, with professional and reliable appearance, related to the theme "${productName}", demonstrating mastery, concentration or practical teaching.
- Person appropriate for the "${productName}" theme
- Professional appearance, focused expression
- Working with tools/equipment related to "${productName}"
- Wearing appropriate work clothes or attire

VISUAL ELEMENTS:
Add objects related to "${productName}":
- Tablet/screen showing video call or online class about "${productName}"
- Workbook/material with content about "${productName}" visible
- Tools or equipment specific to "${productName}"
- Spark/particle effects in background

VISUAL STYLE:
- Cinematic lighting
- Background with particle effects, lights, gradients or technological texture
- Dominant color palette: GREEN and BLACK (or colors appropriate for "${productName}")
- High contrast, extreme sharpness, premium appearance
- Modern, clean, eye-catching and reliable style

TEXT IN IMAGE (STRONG AND LEGIBLE TYPOGRAPHY):

MAIN TITLE (TOP - LARGE LETTERS):
"${productName.toUpperCase()}"

BENEFITS CHECKLIST with green checkmarks ✅:
- Key features of "${productName}"
- Main benefits included
- Bonus or extra content

CTA (BOTTOM):
Visual button or highlight with WhatsApp icon:
"RECEBA NO WhatsApp" or similar
${priceInstruction}
${observationInstruction}

COMPOSITION:
- Character on right side or center
- Text organized on left or top
- Balanced elements, no visual pollution
- Clear reading even on small screens (mobile first)

IMPORTANT RESTRICTIONS:
- Do NOT use real brands
- Do NOT pollute with long texts
- Do NOT use hard-to-read fonts
- ALL text must be about "${productName}"

FINAL QUALITY:
Ultra-realistic, high resolution, professional ad style, ready for Facebook Ads, Instagram, WhatsApp and Stories, square format 1:1 aspect ratio.`;
    } else if (modelType === 'fitness-urgente') {
      // Model 9 - Fitness Urgente - Estilo urgência com transformação
      prompt = `Create a highly persuasive vertical advertising image (1:1 or 4:5 format), with urgent offer aesthetic, quick transformation and high visual impact, focused on the theme "${productName}".

CENTRAL CONCEPT:
The image must convey:
- Urgency
- Immediate transformation or result
- Overcoming / visible benefit
- Authority and confidence
- Action now

The visual should resemble high conversion ads used in Facebook Ads, Instagram Ads and WhatsApp, with cinematic + commercial style.

MAIN CHARACTER:
- A realistic, expressive and charismatic person representing the target audience for "${productName}"
- Appearance appropriate for the theme (could be fitness, business, education, etc. based on "${productName}")
- Facial expression of focus, achievement, satisfaction
- Active and dynamic pose related to "${productName}"
- Showing determination and success

SCENARIO:
- Environment appropriate for "${productName}" (home, office, studio, outdoor)
- Dramatic and contrasted lighting
- Fire/flame effects on the borders for urgency
- Slightly blurred background to highlight character

VISUAL STYLE:
- Hyper-realistic photo or ultra realistic illustration
- Vibrant and contrasting colors
- Effects of: fire, flames, sparks, dynamic lights
- Sensation of energy, movement and impact

TEXTS IN IMAGE:

URGENCY BANNER (TOP - red/orange):
"🏆 SÓ HOJE - ÚLTIMA CHANCE" or similar urgency phrase

MAIN PROMISE (large golden text):
Main benefit of "${productName}" in short impactful phrase

TRANSFORMATION PHRASE:
Motivational phrase about "${productName}"

BEFORE/AFTER small frames (if applicable to "${productName}")

URGENCY TEXT:
"HOJE" with time indicator
"ACABA ÀS 23:59"
"ÚLTIMAS VAGAS!"

WhatsApp icon floating

CTA BUTTONS (BOTTOM):
"CLIQUE AGORA!" and "COMECE HOJE!"
${priceInstruction}
${observationInstruction}

EXTRA ELEMENTS:
- Fire/energy effect borders
- Metallic or dynamic textures
- Strong, modern and legible typography
- Aggressive high conversion ad style

IMPORTANT:
- ALL content must be about "${productName}", not generic fitness
- Adapt character and scenario to match the product theme

TECHNICAL SETTINGS:
High resolution, ultra quality, professional lighting, maximum sharpness, focus on conversion, square format 1:1 aspect ratio.`;
    } else if (modelType === 'whatsapp-mobile') {
      // Model 10 - WhatsApp Mobile - Mockup de celular com entrega
      prompt = `Create an ultra-realistic, highly persuasive advertising image focused on conversion, in square format (1:1), optimized for ads on Instagram, Facebook and WhatsApp, with modern, clean and professional aesthetic.

MAIN SCENE:
A realistic human hand holding a modern smartphone in the foreground, with the phone screen clearly displaying a digital library/app interface related to the theme "${productName}".

On the phone screen should appear:
- Content thumbnails related to "${productName}" (videos, tutorials, images)
- "Play" buttons, "view" or "access" buttons
- Layout similar to an organized digital content library
- Header showing content about "${productName}"
- Simple and intuitive icons
- Grid of content previews related to "${productName}"

Next to or slightly overlapping the phone, add a large eye-catching icon appropriate for "${productName}" (could be relevant emoji or symbol)

CONTEXT / ENVIRONMENT:
- Blurred background (bokeh) of modern, clean and cozy domestic environment
- Living room with couch, plant, modern decor
- Soft natural lighting, sensation of comfort and practicality
- Realistic lifestyle style, without artificial exaggerations

HIGHLIGHTED VISUAL ELEMENTS:
- Floating visual icons reinforcing the main benefit
- Vivid and contrasting colors on important elements
- Well-defined depth of field (phone in focus, background blurred)
- Professional photographic quality, premium advertising level

TEXTS IN IMAGE:

MAIN TEXT (TOP - LARGE AND IMPACTFUL):
"Receba ${productName} no Seu WhatsApp Agora."

Font: Bold, modern, legible
White or light color with dark background/gradient for contrast

SECONDARY TEXT (OPTIONAL):
"*acesso imediato pelo WhatsApp"

CTA (FOOTER OR VISUAL HIGHLIGHT):
"Receba agora no WhatsApp"
Green button (WhatsApp style), rounded edges, clickable appearance
${priceInstruction}
${observationInstruction}

COLOR PALETTE:
- Blue/teal accents
- Black, dark gray or dark blue for background
- White for texts
- Accent color appropriate for "${productName}"

STYLE AND ART DIRECTION:
- High conversion ad style
- Clean visual, no pollution
- Focus on clarity, immediate benefit and ease
- "Tap → receive now" sensation
- No values, prices or numerical promotions unless specified

IMPORTANT RULES:
- Do NOT mention values or discounts unless specified
- Do NOT use real registered brands
- Do NOT visually pollute
- ALL content must be about "${productName}"

Produce in high resolution, 4K quality, realistic style, square format 1:1 aspect ratio.`;
    } else if (modelType === 'fitness-energetico') {
      // Model 11 - Fitness Energético - Visual energético com benefícios
      prompt = `Create a high conversion digital advertising image, professional ad style for social media (Instagram Ads / Facebook Ads / WhatsApp Ads), focused on the theme "${productName}".

GENERAL COMPOSITION:
- Vertical format (1:1 or 4:5), optimized for ads
- Impactful, energetic and eye-catching visual style, with sensation of transformation, result and urgency
- Ultra realistic quality / hyper detailed illustration, 4K resolution, cinematic lighting, high contrast
- Intense and strategic color palette: RED, YELLOW, ORANGE on dark background
- Dynamic background with visual effects like:
  - Energy rays, particles, sparks, glow, lightning
  - Red/orange gradient atmosphere

MAIN CHARACTER:
- Central character representing the target audience for "${productName}"
- Person appropriate for the theme (athletic, professional, student, etc. based on "${productName}")
- Victory pose or confident pose with positive energy
- Confident appearance, determined or motivated expression
- Body and posture consistent with the theme
- Aspirational, inspiring style, "result achieved" sensation

PRODUCT VISUAL ELEMENTS:
- Insert visual representations like:
  - Floating icons (check ✔️, fire 🔥, lightning ⚡)
  - Energy/lightning effects around the character
- Elements should appear digital, modern and professional

TEXTS IN IMAGE (STRONG TYPOGRAPHY):

Top of image (large headline, bold font):
"${productName.toUpperCase()}"

Side blocks or secondary (in boxes or seals):
- Main benefit of "${productName}"
- Format/type of content included
- Bonus or extras
- Time to results or transformation
- Access type (lifetime, etc.)

Visual CTA (button or bottom highlight):
"Acesse agora" or similar
Eye-catching button style with glow, shadow and contrast
${priceInstruction}
${observationInstruction}

GRAPHIC STYLE:
- Large, legible typography with clear hierarchy
- Highlighted elements with boxes, stripes or seals
- "Viral ads" effect, champion infoproduct aesthetic
- Professional, modern and persuasive appearance
- No visual pollution, everything organized and strategic

IMPORTANT RESTRICTIONS:
- Do NOT use real brands
- Do NOT include small illegible texts
- Do NOT look like generic stock image
- ALL text must be about "${productName}", NOT generic fitness content

EXPECTED FINAL RESULT:
An extremely eye-catching, professional and persuasive image about "${productName}", with appearance of ad that generates clicks, curiosity and immediate conversion.

Produce in high resolution (4K), realistic style, square format 1:1 aspect ratio.`;
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
