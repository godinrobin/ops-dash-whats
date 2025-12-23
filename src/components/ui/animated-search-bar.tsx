import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface AnimatedSearchBarProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

const AnimatedSearchBar = forwardRef<HTMLInputElement, AnimatedSearchBarProps>(
  ({ className, containerClassName, ...props }, ref) => {
    return (
      <div className={cn("relative group", containerClassName)}>
        {/* Glow effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-accent via-orange-500 to-accent rounded-lg blur opacity-30 group-hover:opacity-50 transition duration-500 group-hover:duration-200 animate-pulse" />
        
        {/* Search container */}
        <div className="relative flex items-center bg-background border border-border rounded-lg overflow-hidden">
          <div className="absolute left-3 text-muted-foreground">
            <Search className="h-4 w-4" />
          </div>
          <input
            ref={ref}
            type="text"
            className={cn(
              "w-full bg-transparent py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-0 border-none",
              "transition-all duration-300",
              className
            )}
            {...props}
          />
        </div>
      </div>
    );
  }
);

AnimatedSearchBar.displayName = "AnimatedSearchBar";

export { AnimatedSearchBar };
