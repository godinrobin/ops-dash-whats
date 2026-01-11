import React, { useState, useEffect } from "react";
import { Loader2, Lock, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { CreatePostCard } from "./CreatePostCard";
import { FeedPost } from "./FeedPost";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_type: string | null;
  media_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  status: string;
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
  const { isAdmin } = useAdminStatus();
  const [posts, setPosts] = useState<Post[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchPosts = async () => {
    if (!user) return;

    try {
      // Fetch approved posts - remove profiles join that may be causing issues
      const { data: postsData, error: postsError } = await (supabase as any)
        .from("feed_posts")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (postsError) {
        console.error("Error fetching posts:", postsError);
        throw postsError;
      }

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

  const fetchPendingPosts = async () => {
    if (!user || !isAdmin) return;

    try {
      const { data, error } = await (supabase as any)
        .from("feed_posts")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingPosts(data || []);
    } catch (error) {
      console.error("Error fetching pending posts:", error);
    }
  };

  useEffect(() => {
    if (user && !accessLoading) {
      fetchPosts();
    }
  }, [user, accessLoading]);

  useEffect(() => {
    if (isAdmin) {
      fetchPendingPosts();
    }
  }, [isAdmin]);

  const handleApprove = async (postId: string) => {
    setApprovingId(postId);
    try {
      const { error } = await (supabase as any)
        .from("feed_posts")
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user?.id })
        .eq("id", postId);

      if (error) throw error;

      toast.success("Post aprovado!");
      fetchPendingPosts();
      fetchPosts();
    } catch (error) {
      console.error("Error approving post:", error);
      toast.error("Erro ao aprovar post");
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (postId: string) => {
    setApprovingId(postId);
    try {
      const { error } = await (supabase as any)
        .from("feed_posts")
        .update({ status: "rejected" })
        .eq("id", postId);

      if (error) throw error;

      toast.success("Post rejeitado");
      fetchPendingPosts();
    } catch (error) {
      console.error("Error rejecting post:", error);
      toast.error("Erro ao rejeitar post");
    } finally {
      setApprovingId(null);
    }
  };

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
      {/* Create Post Card - only one instance now */}
      {isFullMember && <CreatePostCard onPostCreated={() => { fetchPosts(); fetchPendingPosts(); }} isAdmin={isAdmin} />}

      {/* Admin Pending Posts Section */}
      {isAdmin && pendingPosts.length > 0 && (
        <div className="border border-amber-500/30 rounded-xl bg-amber-500/5">
          <button
            onClick={() => setPendingExpanded(!pendingExpanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-amber-500/10 transition-colors rounded-t-xl"
          >
            <div className="flex items-center gap-2">
              <span className="text-amber-500 font-semibold">📋 Pendentes para Aprovação</span>
              <span className="bg-amber-500/20 text-amber-500 text-xs px-2 py-0.5 rounded-full">
                {pendingPosts.length}
              </span>
            </div>
            {pendingExpanded ? (
              <ChevronUp className="w-5 h-5 text-amber-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-amber-500" />
            )}
          </button>

          <AnimatePresence>
            {pendingExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 pt-0 space-y-3">
                  {pendingPosts.map((post) => (
                    <div key={post.id} className="bg-card/50 border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1">
                            @{post.profiles?.username || "Usuário"}
                          </p>
                          {post.content && (
                            <p className="text-sm whitespace-pre-wrap break-words">{post.content}</p>
                          )}
                          {post.media_url && (
                            <div className="mt-2">
                              {post.media_type === "image" ? (
                                <img src={post.media_url} alt="" className="max-h-32 rounded-lg object-cover" />
                              ) : (
                                <video src={post.media_url} controls className="max-h-32 rounded-lg" />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApprove(post.id)}
                            disabled={approvingId === post.id}
                            className="text-green-500 border-green-500/30 hover:bg-green-500/10"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(post.id)}
                            disabled={approvingId === post.id}
                            className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
