-- Criar enum para tipo de redirecionamento
CREATE TYPE public.announcement_redirect_type AS ENUM ('none', 'custom_link', 'system');

-- Criar tabela de avisos do admin
CREATE TABLE public.admin_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  title TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  redirect_type public.announcement_redirect_type NOT NULL DEFAULT 'none',
  redirect_url TEXT,
  redirect_system TEXT,
  redirect_button_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  views_count INTEGER NOT NULL DEFAULT 0,
  clicks_count INTEGER NOT NULL DEFAULT 0
);

-- Criar tabela de visualizações dos usuários
CREATE TABLE public.user_announcement_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES public.admin_announcements(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  clicked BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, announcement_id)
);

-- Habilitar RLS
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_announcement_views ENABLE ROW LEVEL SECURITY;

-- Políticas para admin_announcements
CREATE POLICY "Admins can manage announcements"
ON public.admin_announcements
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view active announcements"
ON public.admin_announcements
FOR SELECT
TO authenticated
USING (is_active = true);

-- Políticas para user_announcement_views
CREATE POLICY "Users can view their own views"
ON public.user_announcement_views
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own views"
ON public.user_announcement_views
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own views"
ON public.user_announcement_views
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all announcement views"
ON public.user_announcement_views
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar bucket para imagens de avisos
INSERT INTO storage.buckets (id, name, public) VALUES ('announcement-images', 'announcement-images', true);

-- Políticas de storage para imagens de avisos
CREATE POLICY "Admins can upload announcement images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'announcement-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view announcement images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'announcement-images');

CREATE POLICY "Admins can delete announcement images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'announcement-images' AND has_role(auth.uid(), 'admin'::app_role));