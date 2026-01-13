"use client";
import React, { useState, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowingCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export const GlowingCard: React.FC<GlowingCardProps> = ({
  children,
  className,
  glowColor = "hsl(25 95% 53%)",
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-150, 150], [5, -5]);
  const rotateY = useTransform(mouseX, [-150, 150], [-5, 5]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  return (
    <motion.div
      ref={cardRef}
      className={cn("relative group", className)}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Traveling light beam effect */}
      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Top light beam */}
          <motion.div
            className="absolute top-0 left-0 h-[2px] w-[30%]"
            style={{
              background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 10px ${glowColor}`,
            }}
            animate={{
              left: ["0%", "70%", "0%"],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear",
            }}
          />
          {/* Right light beam */}
          <motion.div
            className="absolute top-0 right-0 w-[2px] h-[30%]"
            style={{
              background: `linear-gradient(180deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 10px ${glowColor}`,
            }}
            animate={{
              top: ["0%", "70%", "0%"],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear",
              delay: 0.75,
            }}
          />
          {/* Bottom light beam */}
          <motion.div
            className="absolute bottom-0 right-0 h-[2px] w-[30%]"
            style={{
              background: `linear-gradient(270deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 10px ${glowColor}`,
            }}
            animate={{
              right: ["0%", "70%", "0%"],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear",
              delay: 1.5,
            }}
          />
          {/* Left light beam */}
          <motion.div
            className="absolute bottom-0 left-0 w-[2px] h-[30%]"
            style={{
              background: `linear-gradient(0deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 10px ${glowColor}`,
            }}
            animate={{
              bottom: ["0%", "70%", "0%"],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear",
              delay: 2.25,
            }}
          />
        </motion.div>
      </div>

      {/* Card border glow */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl transition-opacity duration-300",
          isHovered ? "opacity-100" : "opacity-0"
        )}
        style={{
          background: `linear-gradient(135deg, ${glowColor}20, transparent, ${glowColor}10)`,
          boxShadow: `0 0 20px ${glowColor}20`,
        }}
      />

      {/* Card content */}
      <div
        className={cn(
          "relative rounded-xl overflow-hidden",
          "bg-gradient-to-br from-background via-background to-accent/5",
          "border border-border/50",
          "transition-all duration-300",
          isHovered && "border-accent/30"
        )}
      >
        {children}
      </div>
    </motion.div>
  );
};
