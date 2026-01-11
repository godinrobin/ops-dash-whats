import React, { useRef, useCallback, useEffect } from "react";
import { Bold, Italic, Underline, Strikethrough, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes (like clearing after submit)
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (value === "" && editorRef.current.innerHTML !== "") {
        editorRef.current.innerHTML = "";
      }
    }
    isInternalChange.current = false;
  }, [value]);

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

  const handlePaste = (e: React.ClipboardEvent) => {
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
        className="min-h-[80px] max-h-[200px] overflow-y-auto bg-transparent outline-none text-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
      />
    </div>
  );
};
