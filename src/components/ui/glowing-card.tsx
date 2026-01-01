"use client"

import { ReactNode, useState } from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"

interface GlowingCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
}

export function GlowingCard({ children, className, glowColor = "rgba(16, 185, 129, 0.5)" }: GlowingCardProps) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const rotateX = useTransform(mouseY, [-300, 300], [5, -5])
  const rotateY = useTransform(mouseX, [-300, 300], [-5, 5])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left - rect.width / 2)
    mouseY.set(e.clientY - rect.top - rect.height / 2)
  }

  const handleMouseLeave = () => {
    mouseX.set(0)
    mouseY.set(0)
  }

  return (
    <motion.div
      className={cn("relative", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
    >
      {/* Card glow effect */}
      <div className="absolute -inset-[1px] rounded-xl overflow-hidden pointer-events-none">
        {/* Traveling light beam effect */}
        <motion.div 
          className="absolute inset-0"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Top light beam */}
          <motion.div 
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ 
              background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 15px 2px ${glowColor}`
            }}
            animate={{ 
              x: ["-100%", "100%"],
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "linear" 
            }}
          />
          
          {/* Right light beam */}
          <motion.div 
            className="absolute top-0 right-0 bottom-0 w-[2px]"
            style={{ 
              background: `linear-gradient(180deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 15px 2px ${glowColor}`
            }}
            animate={{ 
              y: ["-100%", "100%"],
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "linear",
              delay: 0.75
            }}
          />
          
          {/* Bottom light beam */}
          <motion.div 
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{ 
              background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 15px 2px ${glowColor}`
            }}
            animate={{ 
              x: ["100%", "-100%"],
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "linear",
              delay: 1.5
            }}
          />
          
          {/* Left light beam */}
          <motion.div 
            className="absolute top-0 left-0 bottom-0 w-[2px]"
            style={{ 
              background: `linear-gradient(180deg, transparent, ${glowColor}, transparent)`,
              boxShadow: `0 0 15px 2px ${glowColor}`
            }}
            animate={{ 
              y: ["100%", "-100%"],
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "linear",
              delay: 2.25
            }}
          />
        </motion.div>

        {/* Card border glow */}
        <div 
          className="absolute inset-0 rounded-xl opacity-30"
          style={{ 
            border: `1px solid ${glowColor}`,
            boxShadow: `inset 0 0 20px ${glowColor}`
          }}
        />
      </div>
      
      {/* Card content - pointer-events-auto to ensure clicks work */}
      <div className="relative z-10 pointer-events-auto">
        {children}
      </div>
    </motion.div>
  )
}
