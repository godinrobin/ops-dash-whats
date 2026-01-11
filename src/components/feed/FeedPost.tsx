import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, Trash2, MoreHorizontal, Send, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import VideoPlayer from "@/components/ui/video-player";

const REACTION_EMOJIS = ["🔥", "🚀", "👑", "👍🏻", "🚨"] as const;

interface ReactionCounts {
  [emoji: string]: number;
}

interface FeedPostProps {
  post: {
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
      avatar_url?: string | null;
    };
    is_admin_post?: boolean;
    reactionCounts?: ReactionCounts;
  };
  comments: Array<{
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    profiles?: {
      username: string | null;
      avatar_url?: string | null;
    };
  }>;
  userLiked: boolean;
  userReaction?: string | null;
  onRefresh: () => void;
}

export const FeedPost = ({ post, comments, userLiked, userReaction, onRefresh }: FeedPostProps) => {
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isLiking, setIsLiking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionRef = useRef<HTMLDivElement>(null);

  // Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(event.target as Node)) {
        setShowReactionPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleReaction = async (emoji: string) => {
    if (!user || isLiking) return;

    setIsLiking(true);
    setShowReactionPicker(false);
    try {
      if (userLiked && userReaction === emoji) {
        // Remove reaction if same emoji clicked
        await (supabase as any)
          .from("feed_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
      } else if (userLiked) {
        // Update to new emoji
        await (supabase as any)
          .from("feed_likes")
          .update({ reaction: emoji })
          .eq("post_id", post.id)
          .eq("user_id", user.id);
      } else {
        // Add new reaction
        await (supabase as any).from("feed_likes").insert({
          post_id: post.id,
          user_id: user.id,
          reaction: emoji,
        });
      }
      onRefresh();
    } catch (error) {
      console.error("Error toggling reaction:", error);
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = async () => {
    if (!user || !newComment.trim() || isCommenting) return;

    setIsCommenting(true);
    try {
      const { error } = await (supabase as any).from("feed_comments").insert({
        post_id: post.id,
        user_id: user.id,
        content: newComment.trim(),
      });

      if (error) throw error;

      setNewComment("");
      onRefresh();
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Erro ao adicionar comentário");
    } finally {
      setIsCommenting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("feed_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      toast.success("Comentário removido");
      onRefresh();
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("Erro ao remover comentário");
    }
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await (supabase as any)
        .from("feed_posts")
        .delete()
        .eq("id", post.id);

      if (error) throw error;

      toast.success("Postagem removida");
      onRefresh();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Erro ao remover postagem");
    }
  };

  // Get display name and avatar from profiles
  const profileUsername = post.profiles?.username || "";
  const displayName = profileUsername || "Usuário";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = post.profiles?.avatar_url || null;
  return (
    <div className={cn(
      "bg-card border rounded-xl",
      post.is_admin_post 
        ? "border-2 border-accent ring-1 ring-accent/30" 
        : "border-border"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-accent/20 text-accent">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">{displayName}</p>
              {post.is_admin_post && (
                <Badge variant="outline" className="text-xs bg-accent/10 text-accent border-accent/30 gap-1">
                  <Shield className="w-3 h-3" />
                  Admin
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), {
                addSuffix: true,
                locale: ptBR,
              })}
            </p>
          </div>
        </div>

        {(user?.id === post.user_id || isAdmin) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDeletePost}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content - supports HTML from rich text editor */}
      {post.content && (
        <div className="px-4 pb-3">
          <div 
            className="text-foreground prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }} 
          />
        </div>
      )}

      {/* Media */}
      {post.media_url && (
        <div className="px-4 pb-3">
          {post.media_type === "image" ? (
            <img
              src={post.media_url}
              alt="Post"
              className="w-full rounded-xl max-h-96 object-cover"
            />
          ) : (
            <VideoPlayer src={post.media_url} />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-border/50">
        <div className="relative flex items-center gap-1" ref={reactionRef}>
          {/* Display individual emoji counts */}
          {REACTION_EMOJIS.map((emoji) => {
            const count = post.reactionCounts?.[emoji] || 0;
            if (count === 0 && userReaction !== emoji) return null;
            
            return (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                disabled={isLiking}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all hover:bg-secondary/50",
                  userReaction === emoji && "bg-accent/20 ring-1 ring-accent/50"
                )}
              >
                <span className="text-lg">{emoji}</span>
                {count > 0 && <span className="text-sm text-muted-foreground">{count}</span>}
              </button>
            );
          })}

          {/* Add reaction button (shows picker) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            disabled={isLiking}
            className="px-2 hover:bg-secondary/50"
          >
            <span className="text-lg">😊</span>
          </Button>

          <AnimatePresence>
            {showReactionPicker && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-lg p-2 z-50"
              >
                <div className="flex flex-col gap-1">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className={cn(
                        "text-2xl p-2 hover:bg-secondary/50 rounded-lg transition-all hover:scale-110",
                        userReaction === emoji && "bg-accent/20"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowComments(!showComments)}
          className="gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          <span>{post.comments_count}</span>
        </Button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t border-border/50 bg-secondary/20">
          {/* Comments List */}
          <div className="max-h-64 overflow-y-auto">
            {comments.map((comment) => {
              const profileCommentUsername = comment.profiles?.username || "";
              const commentDisplayName = profileCommentUsername || "Usuário";
              const commentInitials = commentDisplayName.slice(0, 2).toUpperCase();
              const commentAvatarUrl = comment.profiles?.avatar_url || null;
              const canDelete = user?.id === comment.user_id || isAdmin;

              return (
                <div
                  key={comment.id}
                  className="flex items-start gap-3 p-3 hover:bg-secondary/30 transition-colors"
                >
                  <Avatar className="w-8 h-8">
                    {commentAvatarUrl ? (
                      <AvatarImage src={commentAvatarUrl} alt={commentDisplayName} />
                    ) : null}
                    <AvatarFallback className="text-xs bg-accent/20 text-accent">
                      {commentInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{commentDisplayName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {comment.content}
                    </p>
                  </div>
                </div>
              );
            })}

            {comments.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Nenhum comentário ainda. Seja o primeiro!
              </div>
            )}
          </div>

          {/* Add Comment */}
          <div className="flex items-center gap-2 p-3 border-t border-border/50">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escreva um comentário..."
              className="min-h-[40px] max-h-[80px] bg-background resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComment();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleComment}
              disabled={isCommenting || !newComment.trim()}
            >
              {isCommenting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
