import React, { useRef, useCallback, useEffect, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, Palette, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const COLORS = [
  "#ffffff", "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", 
  "#4dabf7", "#9775fa", "#f783ac", "#868e96"
];

export const RichTextEditor = ({ value, onChange, placeholder }: RichTextEditorProps) => {
  const { user } = useAuth();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInternalChange = useRef(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Sync external value changes (like clearing after submit)
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (value === "" && editorRef.current.innerHTML !== "") {
        editorRef.current.innerHTML = "";
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    if (!user) {
      toast.error("Faça login para enviar imagens");
      return null;
    }

    try {
      const fileExt = file.name.split(".").pop() || "png";
      const fileName = `${user.id}/inline-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("feed-media")
        .upload(fileName, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error("Erro ao enviar imagem");
        return null;
      }

      const { data: publicUrlData } = supabase.storage
        .from("feed-media")
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erro ao enviar imagem");
      return null;
    }
  };

  const insertImageAtCursor = (imageUrl: string) => {
    if (!editorRef.current) return;

    // Create the image HTML
    const imgHtml = `<div style="text-align: center; margin: 12px 0;"><img src="${imageUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; display: inline-block;" /></div><p><br/></p>`;

    // Focus the editor
    editorRef.current.focus();

    // Insert at cursor position
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = imgHtml;
      
      const frag = document.createDocumentFragment();
      let lastNode: Node | null = null;
      while (tempDiv.firstChild) {
        lastNode = tempDiv.firstChild;
        frag.appendChild(lastNode);
      }
      
      range.insertNode(frag);
      
      // Move cursor after the inserted content
      if (lastNode) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastNode);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else {
      // If no selection, append at the end
      editorRef.current.innerHTML += imgHtml;
    }

    // Trigger change
    isInternalChange.current = true;
    onChange(editorRef.current.innerHTML);
  };

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Apenas imagens são suportadas");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 10MB)");
      return;
    }

    setIsUploadingImage(true);
    const imageUrl = await uploadImageToStorage(file);
    setIsUploadingImage(false);

    if (imageUrl) {
      insertImageAtCursor(imageUrl);
    }
  };

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleImageFile(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const execCommand = useCallback((command: string, cmdValue?: string) => {
    document.execCommand(command, false, cmdValue);
    editorRef.current?.focus();
    
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleBold = () => execCommand("bold");
  const handleItalic = () => execCommand("italic");
  const handleUnderline = () => execCommand("underline");
  const handleStrikethrough = () => execCommand("strikeThrough");
  const handleColor = (color: string) => {
    execCommand("foreColor", color);
  };

  const handleInput = () => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    // Check for pasted images
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          await handleImageFile(file);
        }
        return;
      }
    }

    // For text, paste as plain text
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    handleInput();
  };

  return (
    <div className="relative" dir="ltr">
      {/* Toolbar */}
      <div className="flex items-center gap-1 pb-2 border-b border-border/30 mb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleBold}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Bold className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleItalic}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Italic className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleUnderline}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Underline className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleStrikethrough}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Strikethrough className="w-4 h-4" />
        </Button>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <Palette className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 bg-card border-border" align="start">
            <div className="flex gap-1 flex-wrap max-w-[150px]">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleColor(color)}
                  className="w-6 h-6 rounded border border-border/50 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-5 bg-border/50 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleImageButtonClick}
          disabled={isUploadingImage}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Inserir imagem no texto"
        >
          {isUploadingImage ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {/* Editable Content */}
      <div
        ref={editorRef}
        contentEditable
        dir="ltr"
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        style={{ direction: "ltr", textAlign: "left", unicodeBidi: "plaintext" }}
        className="min-h-[80px] max-h-[300px] overflow-y-auto bg-transparent outline-none text-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2"
      />

      {/* Upload indicator */}
      {isUploadingImage && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Enviando imagem...
          </div>
        </div>
      )}
    </div>
  );
};
