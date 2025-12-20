import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Curated list of video prompts with previews from various sources
const CURATED_PROMPTS = [
  // Cinematic
  {
    title: "Ocean Storm Lighthouse",
    prompt_text: "A dramatic cinematic shot of a lighthouse standing against massive ocean waves during a storm. The lighthouse beacon cuts through the rain and mist, waves crashing against the rocky shore. Dark stormy clouds overhead with occasional lightning. 4K, epic cinematic quality.",
    category: "cinematic",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
    source: "community",
    tags: ["ocean", "storm", "lighthouse", "dramatic", "nature"],
    ai_model: "sora"
  },
  {
    title: "Astronaut in Space",
    prompt_text: "A photorealistic close up video of an astronaut floating in space, the visor reflecting distant galaxies and nebulas, stars twinkling in the infinite black void. Cinematic lighting, 4K quality, slow motion.",
    category: "cinematic",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400",
    source: "openai",
    tags: ["space", "astronaut", "sci-fi", "cinematic"],
    ai_model: "sora"
  },
  {
    title: "Tokyo Neon Streets",
    prompt_text: "A cinematic shot of Tokyo's neon-lit streets at night during rain. Reflections on wet pavement, steam rising from vents, people with umbrellas walking by. Blade Runner aesthetic, vibrant colors, 4K.",
    category: "cinematic",
    preview_url: "https://cdn.openai.com/sora/videos/tokyo-walk.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400",
    source: "openai",
    tags: ["tokyo", "neon", "night", "rain", "urban", "cyberpunk"],
    ai_model: "sora"
  },
  // Nature
  {
    title: "Northern Lights Over Mountains",
    prompt_text: "Breathtaking timelapse of the Aurora Borealis dancing over snow-capped mountains in Norway. Green and purple lights swirling in the night sky, reflected in a calm lake below. 4K, high quality.",
    category: "nature",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400",
    source: "community",
    tags: ["aurora", "nature", "mountains", "norway", "timelapse"],
    ai_model: "sora"
  },
  {
    title: "Underwater Coral Reef",
    prompt_text: "Stunning underwater footage of a vibrant coral reef teeming with colorful tropical fish. Sunlight filtering through crystal clear water, gentle ocean currents moving the coral. 4K, documentary style.",
    category: "nature",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1546026423-cc4642628d2b?w=400",
    source: "community",
    tags: ["underwater", "coral", "fish", "ocean", "nature", "documentary"],
    ai_model: "sora"
  },
  {
    title: "Sunset Over Savanna",
    prompt_text: "Golden hour cinematic shot of the African savanna at sunset. Silhouettes of acacia trees against an orange and purple sky, gentle wind moving the tall grass. Documentary style, 4K quality.",
    category: "nature",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=400",
    source: "community",
    tags: ["africa", "savanna", "sunset", "nature", "wildlife"],
    ai_model: "sora"
  },
  // Anime
  {
    title: "Anime Character Power Up",
    prompt_text: "Anime style scene of a hero character powering up with intense energy aura surrounding them. Hair flowing upward, glowing eyes, energy particles swirling. Dynamic camera angles, vibrant colors.",
    category: "anime",
    preview_url: "https://cdn.openai.com/sora/videos/paper-airplanes.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400",
    source: "community",
    tags: ["anime", "action", "power", "hero", "energy"],
    ai_model: "sora"
  },
  {
    title: "Cherry Blossom Walk",
    prompt_text: "Soft anime-style scene of a young woman walking through a path lined with cherry blossom trees. Petals falling gently in the wind, soft spring sunlight, peaceful atmosphere. Studio Ghibli inspired.",
    category: "anime",
    preview_url: "https://cdn.openai.com/sora/videos/paper-airplanes.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400",
    source: "community",
    tags: ["anime", "cherry blossom", "peaceful", "spring", "ghibli"],
    ai_model: "sora"
  },
  {
    title: "Mecha Battle Scene",
    prompt_text: "Epic anime mecha battle scene in a futuristic city. Giant robots clashing with energy weapons, explosions, debris flying. Dynamic camera movements, intense action sequences.",
    category: "anime",
    preview_url: "https://cdn.openai.com/sora/videos/paper-airplanes.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400",
    source: "community",
    tags: ["anime", "mecha", "battle", "action", "robots", "sci-fi"],
    ai_model: "sora"
  },
  // Commercial/Advertising
  {
    title: "Luxury Watch Product Shot",
    prompt_text: "High-end product commercial shot of a luxury watch rotating slowly. Dramatic lighting highlighting the chrome and glass details, reflections on a dark surface. 4K, advertising quality.",
    category: "commercial",
    preview_url: "https://cdn.openai.com/sora/videos/gold-rush.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=400",
    source: "community",
    tags: ["product", "luxury", "watch", "commercial", "advertising"],
    ai_model: "sora"
  },
  {
    title: "Coffee Pour in Slow Motion",
    prompt_text: "Ultra slow motion shot of coffee being poured into a white ceramic cup. Steam rising, creamy coffee texture visible, perfect lighting. Professional food advertisement quality.",
    category: "commercial",
    preview_url: "https://cdn.openai.com/sora/videos/gold-rush.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400",
    source: "community",
    tags: ["food", "coffee", "slow motion", "product", "commercial"],
    ai_model: "sora"
  },
  {
    title: "Perfume Bottle Reveal",
    prompt_text: "Elegant reveal shot of a luxury perfume bottle emerging from golden mist. Light particles and reflections, dramatic shadows, premium advertising aesthetic. 4K cinematic.",
    category: "commercial",
    preview_url: "https://cdn.openai.com/sora/videos/gold-rush.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400",
    source: "community",
    tags: ["perfume", "luxury", "product", "commercial", "elegant"],
    ai_model: "sora"
  },
  // Abstract/Artistic
  {
    title: "Liquid Metal Morphing",
    prompt_text: "Abstract visualization of liquid metal morphing into various geometric shapes. Chrome reflections, satisfying smooth transitions, dark background with subtle lighting. ASMR-satisfying visuals.",
    category: "abstract",
    preview_url: "https://cdn.openai.com/sora/videos/abstract-fluid.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=400",
    source: "community",
    tags: ["abstract", "metal", "morphing", "satisfying", "artistic"],
    ai_model: "sora"
  },
  {
    title: "Fractal Universe Zoom",
    prompt_text: "Infinite zoom into a colorful fractal universe. Mandelbrot-like patterns unfolding endlessly, vibrant colors transitioning smoothly. Hypnotic and mesmerizing visual journey.",
    category: "abstract",
    preview_url: "https://cdn.openai.com/sora/videos/abstract-fluid.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?w=400",
    source: "community",
    tags: ["fractal", "abstract", "zoom", "colorful", "hypnotic"],
    ai_model: "sora"
  },
  // Fantasy
  {
    title: "Dragon Flight Over Castle",
    prompt_text: "Epic fantasy scene of a massive dragon flying over a medieval castle at sunset. Dragon breathing fire, wings casting shadows over the fortress, cinematic camera tracking shot.",
    category: "fantasy",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400",
    source: "community",
    tags: ["dragon", "fantasy", "castle", "medieval", "epic"],
    ai_model: "sora"
  },
  {
    title: "Enchanted Forest Portal",
    prompt_text: "Magical portal opening in an enchanted forest. Glowing runes, mystical energy swirling, ancient trees surrounding, fireflies dancing. Fantasy game cinematic quality.",
    category: "fantasy",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400",
    source: "community",
    tags: ["magic", "portal", "forest", "fantasy", "mystical"],
    ai_model: "sora"
  },
  {
    title: "Wizard Casting Spell",
    prompt_text: "Powerful wizard casting an elemental spell, hands glowing with magical energy. Robes flowing in magical wind, runes floating around, dramatic lighting. Epic fantasy style.",
    category: "fantasy",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=400",
    source: "community",
    tags: ["wizard", "magic", "spell", "fantasy", "epic"],
    ai_model: "sora"
  },
  // Sci-Fi
  {
    title: "Cyberpunk City Flythrough",
    prompt_text: "Drone flythrough of a massive cyberpunk megacity. Holographic advertisements, flying cars, neon lights everywhere, rain and fog. Blade Runner meets Akira aesthetic.",
    category: "sci-fi",
    preview_url: "https://cdn.openai.com/sora/videos/tokyo-walk.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400",
    source: "community",
    tags: ["cyberpunk", "city", "futuristic", "neon", "sci-fi"],
    ai_model: "sora"
  },
  {
    title: "Spaceship Launch",
    prompt_text: "Massive spacecraft launching from a futuristic spaceport. Engines igniting with brilliant blue flames, ground crew watching, dust and debris flying. Interstellar quality.",
    category: "sci-fi",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=400",
    source: "community",
    tags: ["spaceship", "launch", "space", "sci-fi", "futuristic"],
    ai_model: "sora"
  },
  {
    title: "AI Robot Awakening",
    prompt_text: "Close-up of a humanoid AI robot opening its eyes for the first time. LEDs lighting up, mechanical irises adjusting, subtle facial expressions. Emotional sci-fi moment.",
    category: "sci-fi",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400",
    source: "community",
    tags: ["robot", "AI", "awakening", "sci-fi", "emotional"],
    ai_model: "sora"
  },
  // Horror
  {
    title: "Haunted Mansion Approach",
    prompt_text: "POV walking towards an abandoned Victorian mansion at night. Fog rolling across the overgrown lawn, windows flickering with ghostly light, ominous atmosphere. Horror movie quality.",
    category: "horror",
    preview_url: "https://cdn.openai.com/sora/videos/mitten-astronaut.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1509248961725-aec71c53e5b1?w=400",
    source: "community",
    tags: ["horror", "haunted", "mansion", "creepy", "night"],
    ai_model: "sora"
  },
  // Food
  {
    title: "Chocolate Dripping",
    prompt_text: "Ultra slow motion of thick chocolate dripping and flowing over fresh strawberries. Rich glossy texture, studio lighting, food photography quality. Satisfying ASMR visual.",
    category: "food",
    preview_url: "https://cdn.openai.com/sora/videos/gold-rush.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=400",
    source: "community",
    tags: ["chocolate", "food", "slow motion", "satisfying", "dessert"],
    ai_model: "sora"
  },
  {
    title: "Sushi Chef Preparation",
    prompt_text: "Skilled sushi chef preparing nigiri with precise movements. Hands shaping rice, placing fresh fish, beautiful plating. Japanese restaurant atmosphere, cinematic food documentary.",
    category: "food",
    preview_url: "https://cdn.openai.com/sora/videos/gold-rush.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400",
    source: "community",
    tags: ["sushi", "food", "chef", "japanese", "cooking"],
    ai_model: "sora"
  },
  // Music/Dance
  {
    title: "Ballet Dancer in Spotlight",
    prompt_text: "Elegant ballet dancer performing pirouettes in a single spotlight on dark stage. Flowing tutu, graceful movements, dust particles in the light. Artistic and emotional.",
    category: "dance",
    preview_url: "https://cdn.openai.com/sora/videos/paper-airplanes.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1518834107812-67b0b7c58434?w=400",
    source: "community",
    tags: ["ballet", "dance", "artistic", "performance", "elegant"],
    ai_model: "sora"
  },
  {
    title: "Hip Hop Street Dance",
    prompt_text: "Urban street dancer performing breakdance moves on a Brooklyn rooftop at sunset. City skyline in background, boombox playing, graffiti art on walls. Energetic and dynamic.",
    category: "dance",
    preview_url: "https://cdn.openai.com/sora/videos/paper-airplanes.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1535525153412-5a42439a210d?w=400",
    source: "community",
    tags: ["hip hop", "dance", "urban", "street", "breakdance"],
    ai_model: "sora"
  },
  // Sports
  {
    title: "Extreme Snowboarding",
    prompt_text: "GoPro POV of extreme snowboarder descending a pristine powder mountain. Snow spraying, jumps and tricks, breathtaking alpine scenery. Action sports cinematography.",
    category: "sports",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400",
    source: "community",
    tags: ["snowboarding", "extreme", "sports", "winter", "action"],
    ai_model: "sora"
  },
  {
    title: "Surfing Giant Wave",
    prompt_text: "Professional surfer riding a massive wave at Pipeline. Slow motion barrel ride, water droplets catching sunlight, powerful ocean force. Surf documentary quality.",
    category: "sports",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400",
    source: "community",
    tags: ["surfing", "ocean", "waves", "sports", "extreme"],
    ai_model: "sora"
  },
  // Timelapse
  {
    title: "City Day to Night",
    prompt_text: "Stunning timelapse of a major city transitioning from day to night. Sun setting, lights turning on, traffic flowing like rivers of light. 4K hyperlapse quality.",
    category: "timelapse",
    preview_url: "https://cdn.openai.com/sora/videos/tokyo-walk.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400",
    source: "community",
    tags: ["timelapse", "city", "day to night", "urban", "lights"],
    ai_model: "sora"
  },
  {
    title: "Flower Blooming",
    prompt_text: "Macro timelapse of a rose blooming from closed bud to full flower. Petals slowly unfurling, dewdrops glistening, soft studio lighting. Nature documentary quality.",
    category: "timelapse",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400",
    source: "community",
    tags: ["flower", "timelapse", "nature", "bloom", "macro"],
    ai_model: "sora"
  },
  // Retro/Vintage
  {
    title: "80s Synthwave Drive",
    prompt_text: "Retro 80s style night drive through neon-lit streets. Synthwave aesthetic, VHS effects, palm trees and sunset. Outrun/retrowave visual style.",
    category: "retro",
    preview_url: "https://cdn.openai.com/sora/videos/tokyo-walk.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=400",
    source: "community",
    tags: ["80s", "synthwave", "retro", "neon", "vaporwave"],
    ai_model: "sora"
  },
  {
    title: "VHS Home Video Style",
    prompt_text: "Nostalgic 90s home video footage of a family beach day. VHS tracking lines, date stamp, slightly washed out colors. Authentic camcorder aesthetic.",
    category: "retro",
    preview_url: "https://cdn.openai.com/sora/videos/paper-airplanes.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
    source: "community",
    tags: ["VHS", "90s", "retro", "nostalgic", "family"],
    ai_model: "sora"
  },
  // Architecture
  {
    title: "Modern Architecture Reveal",
    prompt_text: "Cinematic reveal of a stunning modern architectural masterpiece. Drone flying around the building showcasing clean lines, glass facades, integration with nature.",
    category: "architecture",
    preview_url: "https://cdn.openai.com/sora/videos/gold-rush.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400",
    source: "community",
    tags: ["architecture", "modern", "building", "design", "drone"],
    ai_model: "sora"
  },
  // Weather
  {
    title: "Thunderstorm Over Plains",
    prompt_text: "Dramatic timelapse of a massive thunderstorm rolling across the Great Plains. Lightning strikes, rotating supercell, ominous clouds. Storm chasing documentary quality.",
    category: "weather",
    preview_url: "https://cdn.openai.com/sora/videos/big-sur.mp4",
    preview_thumbnail: "https://images.unsplash.com/photo-1461511669078-d46bf351cd6e?w=400",
    source: "community",
    tags: ["storm", "lightning", "weather", "dramatic", "timelapse"],
    ai_model: "sora"
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Importing ${CURATED_PROMPTS.length} video prompts...`);

    // Check existing prompts to avoid duplicates
    const { data: existingPrompts } = await supabase
      .from('video_prompts')
      .select('title');

    const existingTitles = new Set(existingPrompts?.map(p => p.title) || []);

    // Filter out duplicates
    const newPrompts = CURATED_PROMPTS.filter(p => !existingTitles.has(p.title));

    if (newPrompts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All prompts already exist', 
          imported: 0,
          total: existingPrompts?.length || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new prompts
    const { data, error } = await supabase
      .from('video_prompts')
      .insert(newPrompts)
      .select();

    if (error) {
      console.error('Error inserting prompts:', error);
      throw error;
    }

    console.log(`Successfully imported ${data?.length || 0} prompts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: data?.length || 0,
        total: (existingPrompts?.length || 0) + (data?.length || 0),
        message: `Imported ${data?.length || 0} new prompts`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in import-video-prompts:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
