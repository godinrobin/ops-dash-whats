import React, { useState, useEffect } from "react";
import { Loader2, Lock, ChevronDown, ChevronUp, Check, X, Clock } from "lucide-react";
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
  is_admin_post?: boolean;
  profiles?: {
    username: string | null;
    avatar_url?: string | null;
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
    avatar_url?: string | null;
  };
}

export const Feed = () => {
  const { user } = useAuth();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const { isAdmin } = useAdminStatus();
  const [posts, setPosts] = useState<Post[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [myPendingPosts, setMyPendingPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchPosts = async () => {
    if (!user) return;

    try {
      const { data: postsData, error: postsError } = await supabase
        .from("feed_posts")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (postsError) {
        console.error("Error fetching posts:", postsError);
        throw postsError;
      }

      if (!postsData || postsData.length === 0) {
        setPosts([]);
        setComments([]);
        setUserLikes(new Set());
        return;
      }

      const postIds = postsData.map((p: any) => p.id);

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from("feed_comments")
        .select("*")
        .in("post_id", postIds)
        .order("created_at", { ascending: true });

      if (commentsError) {
        console.error("Error fetching comments:", commentsError);
      }

      // Collect all unique user IDs
      const postsUserIds = [...new Set(postsData.map((p: any) => p.user_id))];
      const commentUserIds = [...new Set((commentsData || []).map((c: any) => c.user_id))];
      const allUserIds = [...new Set([...postsUserIds, ...commentUserIds])];

      // Fetch profiles for all users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", allUserIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      // Create a map of profiles by user ID
      const profileById = new Map<string, { username: string | null; avatar_url?: string | null }>();
      (profilesData || []).forEach((p: any) => {
        profileById.set(p.id, { username: p.username, avatar_url: p.avatar_url });
      });

      // Determine which authors are admins
      const adminUserIds = new Set<string>();
      if (isAdmin) adminUserIds.add(user.id);

      const { data: adminRoles, error: adminRolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("user_id", postsUserIds)
        .eq("role", "admin");

      if (!adminRolesError) {
        (adminRoles || []).forEach((r: any) => adminUserIds.add(r.user_id));
      }

      // Attach profiles and admin status to posts
      const postsFinal = postsData.map((p: any) => ({
        ...p,
        profiles: profileById.get(p.user_id) || { username: null, avatar_url: null },
        is_admin_post: adminUserIds.has(p.user_id),
      }));

      // Attach profiles to comments
      const commentsFinal = (commentsData || []).map((c: any) => ({
        ...c,
        profiles: profileById.get(c.user_id) || { username: null, avatar_url: null },
      }));

      setPosts(postsFinal);
      setComments(commentsFinal);

      // Likes
      const { data: likesData } = await (supabase as any)
        .from("feed_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", postIds);

      setUserLikes(new Set((likesData || []).map((l: any) => l.post_id)));
    } catch (error) {
      console.error("Error fetching feed:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingPosts = async () => {
    if (!user) return;

    try {
      let allPending: any[] = [];

      // Fetch all pending posts for admin
      if (isAdmin) {
        const { data, error } = await (supabase as any)
          .from("feed_posts")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setPendingPosts(data || []);
        allPending = allPending.concat(data || []);
      }

      // Fetch user's own pending posts
      const { data: myPending, error: myPendingError } = await (supabase as any)
        .from("feed_posts")
        .select("*")
        .eq("status", "pending")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (myPendingError) throw myPendingError;
      setMyPendingPosts(myPending || []);
      allPending = allPending.concat(myPending || []);

      // Attach profiles manually
      const pendingUserIds = [...new Set(allPending.map((p: any) => p.user_id))];
      if (pendingUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", pendingUserIds);

        const profileById = new Map<string, any>();
        (profilesData || []).forEach((p: any) => profileById.set(p.id, {
          username: p.username,
          avatar_url: p.avatar_url
        }));

        if (isAdmin) {
          setPendingPosts((prev) =>
            prev.map((p: any) => ({ ...p, profiles: profileById.get(p.user_id) || { username: null, avatar_url: null } }))
          );
        }

        setMyPendingPosts((prev) =>
          prev.map((p: any) => ({ ...p, profiles: profileById.get(p.user_id) || { username: null, avatar_url: null } }))
        );
      }
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
    if (user && !accessLoading) {
      fetchPendingPosts();
    }
  }, [user, isAdmin, accessLoading]);

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

      {/* User's own pending posts */}
      {!isAdmin && myPendingPosts.length > 0 && (
        <div className="space-y-4">
          {myPendingPosts.map((post) => (
            <div key={post.id} className="relative">
              <div className="absolute inset-0 bg-background/40 rounded-xl z-10 pointer-events-none" />
              <div className="absolute top-3 right-3 z-20">
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-amber-500/20 text-amber-500 rounded-full font-medium border border-amber-500/30">
                  <Clock className="w-3 h-3" />
                  Aguardando aprovação
                </span>
              </div>
              <div className="opacity-70">
                <FeedPost
                  key={post.id}
                  post={post}
                  comments={[]}
                  userLiked={false}
                  onRefresh={() => { fetchPosts(); fetchPendingPosts(); }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {posts.length === 0 && myPendingPosts.length === 0 ? (
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
