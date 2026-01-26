import { useState, useEffect } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TutorialButtonProps {
  playerId: string;
  title?: string;
}

export function TutorialButton({ playerId, title = "Tutorial" }: TutorialButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      // Load the vturb player script when dialog opens
      const scriptId = `vturb-script-${playerId}`;
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://scripts.converteai.net/574be7f8-d9bf-450a-9bfb-e024758a6c13/players/${playerId}/v4/player.js`;
        script.async = true;
        document.head.appendChild(script);
      }
    }
  }, [open, playerId]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-muted-foreground hover:text-foreground h-8 px-2"
      >
        <PlayCircle className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">Tutorial</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-0">
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              {open && (
                <div
                  dangerouslySetInnerHTML={{
                    __html: `<vturb-smartplayer id="vid-${playerId}" style="display: block; width: 100%; height: 100%;"></vturb-smartplayer>`,
                  }}
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
