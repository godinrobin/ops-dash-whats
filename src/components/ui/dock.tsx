"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { motion } from "framer-motion"

interface DockProps {
  className?: string
  items: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick?: () => void
    active?: boolean
  }[]
}

export default function Dock({ items, className }: DockProps) {
  const [hovered, setHovered] = React.useState<number | null>(null)

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("flex items-center gap-1", className)}>
        {items.map((item, i) => {
          const isHovered = hovered === i

          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <motion.div
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  animate={{
                    scale: isHovered ? 1.2 : 1,
                    rotate: isHovered ? -5 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative flex flex-col items-center"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "relative z-10 transition-colors",
                      item.active && "text-accent"
                    )}
                    onClick={() => item.onClick?.()}
                  >
                    <item.icon className="h-4 w-4" />
                    {/* Glowing ring effect */}
                    {isHovered && (
                      <motion.span
                        className="absolute inset-0 rounded-md bg-accent/20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    )}
                  </Button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent>
                {item.label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
