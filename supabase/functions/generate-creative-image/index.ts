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
    const { productName, includePrice, price, observation, creativeType } = await req.json();

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    let priceInstruction = '';
    if (includePrice && price) {
      priceInstruction = `
- Adicione uma tag de preço elegante perto dos produtos mostrando "R$ ${price}" em uma fonte moderna e legível.`;
    }

    let observationInstruction = '';
    if (observation && observation.trim()) {
      observationInstruction = `
- Consideração adicional do usuário: ${observation}`;
    }

    const prompt = `Create a highly realistic product photography advertisement image with the following specifications:

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

    console.log('Generating creative image with prompt:', prompt);

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
