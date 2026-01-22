import React from "react";

interface SpinnerProps {
  size?: number;
  color?: string;
}

const bars = [
  { animationDelay: "-1.2s", transform: "rotate(.0001deg) translate(146%)" },
  { animationDelay: "-1.1s", transform: "rotate(30deg) translate(146%)" },
  { animationDelay: "-1.0s", transform: "rotate(60deg) translate(146%)" },
  { animationDelay: "-0.9s", transform: "rotate(90deg) translate(146%)" },
  { animationDelay: "-0.8s", transform: "rotate(120deg) translate(146%)" },
  { animationDelay: "-0.7s", transform: "rotate(150deg) translate(146%)" },
  { animationDelay: "-0.6s", transform: "rotate(180deg) translate(146%)" },
  { animationDelay: "-0.5s", transform: "rotate(210deg) translate(146%)" },
  { animationDelay: "-0.4s", transform: "rotate(240deg) translate(146%)" },
  { animationDelay: "-0.3s", transform: "rotate(270deg) translate(146%)" },
  { animationDelay: "-0.2s", transform: "rotate(300deg) translate(146%)" },
  { animationDelay: "-0.1s", transform: "rotate(330deg) translate(146%)" }
];

export const Spinner = ({ size = 20, color = "hsl(var(--accent))" }: SpinnerProps) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative"
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: size,
          height: size,
          transform: "translate(-50%, -50%)"
        }}
      >
        {bars.map((item, index) => (
          <div
            key={index}
            style={{
              animation: "fade-spin 1.2s linear infinite",
              background: color,
              borderRadius: "50px",
              height: "8%",
              left: "50%",
              position: "absolute",
              top: "50%",
              width: "24%",
              animationDelay: item.animationDelay,
              transform: item.transform
            }}
          />
        ))}
      </div>
    </div>
  );
};
