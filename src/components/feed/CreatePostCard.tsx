import React, { useState, useRef } from "react";
import { Image, Video, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreatePostCardProps {
  onPostCreated: () => void;
  isAdmin?: boolean;
}

export const CreatePostCard = ({ onPostCreated, isAdmin = false }: CreatePostCardProps) => {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"text" | "image" | "video">("text");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (type: "image" | "video") => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === "image" ? "image/*" : "video/*";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setMediaType(file.type.startsWith("video") ? "video" : "image");
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType("text");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!user || (!content.trim() && !mediaFile)) return;

    setIsSubmitting(true);

    try {
      let mediaUrl = null;

      // Upload media if exists
      if (mediaFile) {
        const fileExt = mediaFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError, data } = await supabase.storage
          .from("feed-media")
          .upload(fileName, mediaFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("feed-media")
          .getPublicUrl(fileName);

        mediaUrl = publicUrlData.publicUrl;
      }

      // Create post - admin posts are auto-approved
      const postStatus = isAdmin ? "approved" : "pending";
      const { error } = await (supabase as any).from("feed_posts").insert({
        user_id: user.id,
        content: content.trim() || null,
        media_type: mediaFile ? mediaType : "text",
        media_url: mediaUrl,
        status: postStatus,
        ...(isAdmin ? { approved_at: new Date().toISOString(), approved_by: user.id } : {}),
      });

      if (error) throw error;

      toast.success(isAdmin ? "Postagem publicada!" : "Postagem enviada para aprovação!");
      setContent("");
      removeMedia();
      onPostCreated();
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error("Erro ao criar postagem");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative p-4 rounded-xl bg-card border border-border">
      {/* Glow effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent/5 via-primary/5 to-accent/5 blur-xl opacity-50 pointer-events-none" />

      <div className="relative z-10">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="O que você está pensando? ✨"
          className="min-h-[80px] bg-transparent border-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
        />

        {/* Media Preview */}
        {mediaPreview && (
          <div className="relative mt-3 mb-3">
            <button
              onClick={removeMedia}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            {mediaType === "image" ? (
              <img
                src={mediaPreview}
                alt="Preview"
                className="w-full max-h-64 object-cover rounded-lg"
              />
            ) : (
              <video
                src={mediaPreview}
                controls
                className="w-full max-h-64 rounded-lg"
              />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-3 border-t border-border/50">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleFileSelect("image")}
              disabled={isSubmitting}
              className="text-muted-foreground hover:text-foreground hover:-translate-y-0.5 transition-all"
            >
              <Image className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleFileSelect("video")}
              disabled={isSubmitting}
              className="text-muted-foreground hover:text-foreground hover:-translate-y-0.5 transition-all"
            >
              <Video className="w-5 h-5" />
            </Button>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (!content.trim() && !mediaFile)}
            size="sm"
            className="gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Publicar
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};
