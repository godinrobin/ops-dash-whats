import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, Trash2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { CommentReply } from "./CommentReply";

const REACTION_EMOJIS = ["🔥", "🚀", "👑", "👍🏻", "🚨"] as const;

interface CommentReaction {
  [emoji: string]: number;
}

interface Reply {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string | null;
    avatar_url?: string | null;
  };
}

interface CommentItemProps {
  comment: {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    profiles?: {
      username: string | null;
      avatar_url?: string | null;
    };
  };
  replies: Reply[];
  reactionCounts: CommentReaction;
  userReaction: string | null;
  onDelete: (commentId: string) => void;
  onRefresh: () => void;
}

export const CommentItem = ({ 
  comment, 
  replies, 
  reactionCounts, 
  userReaction,
  onDelete, 
  onRefresh 
}: CommentItemProps) => {
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [newReply, setNewReply] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isReacting, setIsReacting] = useState(false);
  const reactionRef = useRef<HTMLDivElement>(null);

  const username = comment.profiles?.username || "Usuário";
  const initials = username.slice(0, 2).toUpperCase();
  const avatarUrl = comment.profiles?.avatar_url || null;
  const canDelete = user?.id === comment.user_id || isAdmin;

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
    if (!user || isReacting) return;

    setIsReacting(true);
    setShowReactionPicker(false);
    
    try {
      if (userReaction === emoji) {
        // Remove reaction
        await supabase
          .from("feed_comment_reactions")
          .delete()
          .eq("comment_id", comment.id)
          .eq("user_id", user.id);
      } else if (userReaction) {
        // Update reaction
        await supabase
          .from("feed_comment_reactions")
          .update({ reaction: emoji })
          .eq("comment_id", comment.id)
          .eq("user_id", user.id);
      } else {
        // Add new reaction
        await supabase
          .from("feed_comment_reactions")
          .insert({
            comment_id: comment.id,
            user_id: user.id,
            reaction: emoji,
          });
      }
      onRefresh();
    } catch (error) {
      console.error("Error toggling comment reaction:", error);
    } finally {
      setIsReacting(false);
    }
  };

  const handleReply = async () => {
    if (!user || !newReply.trim() || isReplying) return;

    setIsReplying(true);
    try {
      const { error } = await supabase
        .from("feed_comment_replies")
        .insert({
          comment_id: comment.id,
          user_id: user.id,
          content: newReply.trim(),
        });

      if (error) throw error;

      setNewReply("");
      setShowReplyInput(false);
      setShowReplies(true);
      onRefresh();
    } catch (error) {
      console.error("Error adding reply:", error);
      toast.error("Erro ao adicionar resposta");
    } finally {
      setIsReplying(false);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      const { error } = await supabase
        .from("feed_comment_replies")
        .delete()
        .eq("id", replyId);

      if (error) throw error;

      toast.success("Resposta removida");
      onRefresh();
    } catch (error) {
      console.error("Error deleting reply:", error);
      toast.error("Erro ao remover resposta");
    }
  };

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="py-3 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start gap-3 px-3">
        <Avatar className="w-8 h-8">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={username} />
          ) : null}
          <AvatarFallback className="text-xs bg-accent/20 text-accent">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{username}</p>
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
                  onClick={() => onDelete(comment.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {comment.content}
          </p>

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-2">
            {/* Reactions */}
            <div className="relative flex items-center gap-1" ref={reactionRef}>
              {REACTION_EMOJIS.map((emoji) => {
                const count = reactionCounts[emoji] || 0;
                if (count === 0 && userReaction !== emoji) return null;
                
                return (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    disabled={isReacting}
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-all hover:bg-secondary/50",
                      userReaction === emoji && "bg-accent/20 ring-1 ring-accent/50"
                    )}
                  >
                    <span>{emoji}</span>
                    {count > 0 && <span className="text-muted-foreground">{count}</span>}
                  </button>
                );
              })}

              {!userReaction && (
                <button
                  onClick={() => setShowReactionPicker(!showReactionPicker)}
                  disabled={isReacting}
                  className="text-sm opacity-50 hover:opacity-100 transition-opacity px-1"
                >
                  🔥
                </button>
              )}

              <AnimatePresence>
                {showReactionPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.9 }}
                    transition={{ duration: 0.1 }}
                    className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-lg shadow-lg p-1.5 z-50 flex gap-1"
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(emoji)}
                        className={cn(
                          "text-lg p-1 hover:bg-secondary/50 rounded transition-all hover:scale-110",
                          userReaction === emoji && "bg-accent/20"
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Reply button */}
            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              Responder
            </button>

            {/* Show replies toggle */}
            {replies.length > 0 && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="text-xs text-accent hover:underline"
              >
                {showReplies ? "Ocultar" : `Ver ${replies.length} resposta${replies.length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>

          {/* Reply input */}
          {showReplyInput && (
            <div className="flex items-center gap-2 mt-2">
              <Input
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                placeholder="Escreva uma resposta..."
                className="h-8 text-sm bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReply();
                  }
                }}
              />
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={handleReply}
                disabled={isReplying || !newReply.trim()}
              >
                {isReplying ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
              </Button>
            </div>
          )}

          {/* Replies list */}
          {showReplies && replies.length > 0 && (
            <div className="mt-2 border-l-2 border-border/50">
              {replies.map((reply) => (
                <CommentReply
                  key={reply.id}
                  reply={reply}
                  canDelete={user?.id === reply.user_id || isAdmin}
                  onDelete={handleDeleteReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
