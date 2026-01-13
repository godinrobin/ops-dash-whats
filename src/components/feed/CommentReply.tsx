import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CommentReplyProps {
  reply: {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    profiles?: {
      username: string | null;
      avatar_url?: string | null;
    };
  };
  canDelete: boolean;
  onDelete: (replyId: string) => void;
}

export const CommentReply = ({ reply, canDelete, onDelete }: CommentReplyProps) => {
  const username = reply.profiles?.username || "Usuário";
  const initials = username.slice(0, 2).toUpperCase();
  const avatarUrl = reply.profiles?.avatar_url || null;

  return (
    <div className="flex items-start gap-2 pl-10 py-2">
      <Avatar className="w-6 h-6">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={username} />
        ) : null}
        <AvatarFallback className="text-[10px] bg-accent/20 text-accent">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">{username}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(reply.created_at), {
                addSuffix: true,
                locale: ptBR,
              })}
            </span>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(reply.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {reply.content}
        </p>
      </div>
    </div>
  );
};
