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

    // Clear previous content
    containerRef.current.innerHTML = '';

    // Create a temporary container to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = videoCode;

    // Move all child nodes to the container
    while (tempDiv.firstChild) {
      containerRef.current.appendChild(tempDiv.firstChild);
    }

    // If there's optimization code, create and execute it
    if (optimizationCode) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      // Remove any script tags from optimization code and get just the content
      const optCode = optimizationCode
        .replace(/<script[^>]*>/gi, '')
        .replace(/<\/script>/gi, '');
      script.textContent = optCode;
      containerRef.current.appendChild(script);
    }

    // Execute any script tags that were in the video code
    const scripts = containerRef.current.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
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
