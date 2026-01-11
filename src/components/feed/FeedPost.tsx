import React, { useState } from "react";
import { Heart, MessageCircle, Trash2, MoreHorizontal, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
    };
  };
  comments: Array<{
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    profiles?: {
      username: string | null;
    };
  }>;
  userLiked: boolean;
  onRefresh: () => void;
}

export const FeedPost = ({ post, comments, userLiked, onRefresh }: FeedPostProps) => {
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isLiking, setIsLiking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);

  const handleLike = async () => {
    if (!user || isLiking) return;

    setIsLiking(true);
    try {
      if (userLiked) {
        await (supabase as any)
          .from("feed_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
      } else {
        await (supabase as any).from("feed_likes").insert({
          post_id: post.id,
          user_id: user.id,
        });
      }
      onRefresh();
    } catch (error) {
      console.error("Error toggling like:", error);
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

  const username = post.profiles?.username || "Usuário";
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-accent/20 text-accent">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground">{username}</p>
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
              className="w-full rounded-lg max-h-96 object-cover"
            />
          ) : (
            <video
              src={post.media_url}
              controls
              className="w-full rounded-lg max-h-96"
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLike}
          disabled={isLiking}
          className={cn(
            "gap-2",
            userLiked && "text-red-500 hover:text-red-600"
          )}
        >
          <Heart
            className={cn("w-5 h-5", userLiked && "fill-current")}
          />
          <span>{post.likes_count}</span>
        </Button>

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
              const commentUsername = comment.profiles?.username || "Usuário";
              const canDelete = user?.id === comment.user_id || isAdmin;

              return (
                <div
                  key={comment.id}
                  className="flex items-start gap-3 p-3 hover:bg-secondary/30 transition-colors"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-accent/20 text-accent">
                      {commentUsername.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{commentUsername}</p>
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
