import * as React from "react";
import { cn } from "@/lib/utils";

interface FlippableCreditCardProps extends React.HTMLAttributes<HTMLDivElement> {
  cardholderName: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  isFlipped?: boolean;
}

const FlippableCreditCard = React.forwardRef<HTMLDivElement, FlippableCreditCardProps>(
  ({ className, cardholderName, cardNumber, expiryDate, cvv, isFlipped = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("group w-full max-w-[320px] h-[200px] perspective-1000", className)}
        {...props}
      >
        <div
          className={cn(
            "relative w-full h-full transition-transform duration-700 transform-style-3d",
            isFlipped ? "rotate-y-180" : ""
          )}
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* CARD FRONT */}
          <div
            className="absolute w-full h-full backface-hidden rounded-2xl overflow-hidden"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="w-full h-full bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 p-5 flex flex-col justify-between">
              {/* Card Header */}
              <div className="flex justify-between items-start">
                <svg
                  className="w-10 h-10 text-orange-300/80"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="1" y="4" width="22" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <rect x="1" y="8" width="22" height="4" fill="currentColor" opacity="0.3" />
                </svg>
                <span className="text-white/90 font-bold text-sm tracking-wider">VISA</span>
              </div>

              {/* Card Number */}
              <div className="text-white font-mono text-lg tracking-[0.2em] drop-shadow-md">
                {cardNumber || "•••• •••• •••• ••••"}
              </div>

              {/* Card Footer */}
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-orange-200/70 text-[10px] uppercase tracking-wider">
                    Titular do Cartão
                  </p>
                  <p className="text-white font-medium text-sm tracking-wide truncate max-w-[180px]">
                    {cardholderName || "SEU NOME"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-orange-200/70 text-[10px] uppercase tracking-wider">
                    Validade
                  </p>
                  <p className="text-white font-medium text-sm">
                    {expiryDate || "MM/AA"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CARD BACK */}
          <div
            className="absolute w-full h-full backface-hidden rounded-2xl overflow-hidden"
            style={{ 
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)"
            }}
          >
            <div className="w-full h-full bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 flex flex-col justify-between py-5">
              {/* Magnetic Strip */}
              <div className="w-full h-10 bg-black/40" />

              {/* CVV Section */}
              <div className="px-5">
                <div className="bg-white/90 rounded h-8 flex items-center justify-end px-3">
                  <span className="font-mono text-gray-800 tracking-widest">
                    {cvv || "•••"}
                  </span>
                </div>
              </div>
              <p className="text-orange-200/70 text-[10px] uppercase tracking-wider text-center">
                CVV
              </p>

              {/* Signature Logo */}
              <div className="px-5 flex justify-end">
                <svg className="w-12 h-8 text-white/30" viewBox="0 0 48 32">
                  <circle cx="16" cy="16" r="14" fill="currentColor" />
                  <circle cx="32" cy="16" r="14" fill="currentColor" opacity="0.7" />
                  <path d="M24 6 Q16 16 24 26 Q32 16 24 6" fill="white" opacity="0.3" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

FlippableCreditCard.displayName = "FlippableCreditCard";

export { FlippableCreditCard };
