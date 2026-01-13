import * as React from "react";

interface LoaderProps {
  size?: number;
  text?: string;
}

export const AILoader: React.FC<LoaderProps> = ({ size = 180, text = "Gerando" }) => {
  const letters = text.split("");

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex flex-col items-center justify-center">
        <div
          className="rounded-full animate-loaderCircle"
          style={{
            width: size,
            height: size,
          }}
        />
        {letters.map((letter, index) => (
          <span
            key={index}
            className="absolute text-accent font-bold animate-loaderLetter drop-shadow-[0_0_6px_hsl(var(--accent))]"
            style={{
              fontSize: size * 0.15,
              animationDelay: `${index * 0.15}s`,
              left: `calc(50% + ${(index - (letters.length - 1) / 2) * (size * 0.12)}px)`,
              transform: "translateX(-50%)",
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes loaderCircle {
          0% {
            transform: rotate(90deg);
            box-shadow:
              0 6px 12px 0 hsl(25 95% 53%) inset,
              0 12px 18px 0 hsl(25 80% 45%) inset,
              0 36px 36px 0 hsl(25 70% 35%) inset,
              0 0 3px 1.2px hsl(25 95% 53% / 0.3),
              0 0 6px 1.8px hsl(25 80% 45% / 0.2);
          }
          50% {
            transform: rotate(270deg);
            box-shadow:
              0 6px 12px 0 hsl(25 90% 60%) inset,
              0 12px 6px 0 hsl(25 85% 50%) inset,
              0 24px 36px 0 hsl(25 80% 45%) inset,
              0 0 3px 1.2px hsl(25 95% 53% / 0.3),
              0 0 6px 1.8px hsl(25 80% 45% / 0.2);
          }
          100% {
            transform: rotate(450deg);
            box-shadow:
              0 6px 12px 0 hsl(25 95% 53%) inset,
              0 12px 18px 0 hsl(25 80% 45%) inset,
              0 36px 36px 0 hsl(25 70% 35%) inset,
              0 0 3px 1.2px hsl(25 95% 53% / 0.3),
              0 0 6px 1.8px hsl(25 80% 45% / 0.2);
          }
        }

        @keyframes loaderLetter {
          0%,
          100% {
            opacity: 0.4;
            transform: translateY(0) translateX(-50%);
          }
          20% {
            opacity: 1;
            transform: scale(1.15) translateX(-50%);
          }
          40% {
            opacity: 0.7;
            transform: translateY(0) translateX(-50%);
          }
        }

        .animate-loaderCircle {
          animation: loaderCircle 5s linear infinite;
        }

        .animate-loaderLetter {
          animation: loaderLetter 3s infinite;
        }
      `}</style>
    </div>
  );
};
