import React, { useState, useEffect } from "react";
import { Loader2, Lock } from "lucide-react";
import { CreatePostCard } from "./CreatePostCard";
import { FeedPost } from "./FeedPost";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { supabase } from "@/integrations/supabase/client";

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_type: string | null;
  media_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles?: {
    username: string | null;
  };
}

interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string | null;
  };
}

export const Feed = () => {
  const { user } = useAuth();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    if (!user) return;

    try {
      // Using type assertion because types aren't synced yet
      const { data: postsData, error: postsError } = await (supabase as any)
        .from("feed_posts")
        .select(`
          *,
          profiles:user_id (username)
        `)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (postsError) throw postsError;

      setPosts(postsData || []);

      // Fetch all comments for these posts
      if (postsData && postsData.length > 0) {
        const postIds = postsData.map((p: any) => p.id);

        const { data: commentsData } = await (supabase as any)
          .from("feed_comments")
          .select(`
            *,
            profiles:user_id (username)
          `)
          .in("post_id", postIds)
          .order("created_at", { ascending: true });

        setComments(commentsData || []);

        // Fetch user likes
        const { data: likesData } = await (supabase as any)
          .from("feed_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds);

        setUserLikes(new Set((likesData || []).map((l: any) => l.post_id)));
      }
    } catch (error) {
      console.error("Error fetching feed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !accessLoading) {
      fetchPosts();
    }
  }, [user, accessLoading]);

  // Blurred overlay for non-members
  if (!accessLoading && !isFullMember) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-center p-6 bg-background/95 rounded-xl border border-border shadow-lg max-w-md mx-4">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-bold mb-2">Conteúdo Exclusivo</h3>
            <p className="text-muted-foreground">
              O feed da comunidade está disponível apenas para membros completos.
            </p>
          </div>
        </div>
        
        <div className="filter blur-md pointer-events-none select-none space-y-4">
          {/* Fake blurred posts */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CreatePostCard onPostCreated={fetchPosts} />

      {posts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhuma postagem ainda. Seja o primeiro a compartilhar!</p>
        </div>
      ) : (
        posts.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            comments={comments.filter((c) => c.post_id === post.id)}
            userLiked={userLikes.has(post.id)}
            onRefresh={fetchPosts}
          />
        ))
      )}
    </div>
  );
};
