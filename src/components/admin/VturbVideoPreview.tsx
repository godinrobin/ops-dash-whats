import { useEffect, useRef } from "react";

interface VturbVideoPreviewProps {
  videoCode: string;
  optimizationCode?: string;
  isVisible: boolean;
}

export const VturbVideoPreview = ({ videoCode, optimizationCode, isVisible }: VturbVideoPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoCode || !containerRef.current || !isVisible) return;

    const container = containerRef.current;

    const stripScriptTags = (code: string) =>
      code
        .replace(/<script[^>]*>/gi, "")
        .replace(/<\/script>/gi, "")
        .trim();

    // Clear previous content
    container.innerHTML = "";

    // Parse HTML safely: append non-script nodes first, then re-create scripts.
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = videoCode;

    const extractedScripts = Array.from(tempDiv.querySelectorAll("script"));
    extractedScripts.forEach((s) => s.remove());

    // Append the remaining (non-script) markup
    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild);
    }

    // Re-create scripts to force execution
    const appendScript = (oldScript: HTMLScriptElement) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });

      // External scripts
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        const raw = oldScript.textContent ?? "";
        // Some providers store `<script>...</script>` inside the text; strip to avoid `Unexpected token '<'`.
        newScript.textContent = stripScriptTags(raw);
      }

      container.appendChild(newScript);
    };

    extractedScripts.forEach((s) => appendScript(s as HTMLScriptElement));

    // If there's optimization code, create and execute it (as a separate inline script)
    if (optimizationCode) {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.textContent = stripScriptTags(optimizationCode);
      container.appendChild(script);
    }

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [videoCode, optimizationCode, isVisible]);

  if (!videoCode) return null;

  return (
    <div 
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden relative"
      style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: '100%',
        contain: 'layout paint',
      }}
    />
  );
};
