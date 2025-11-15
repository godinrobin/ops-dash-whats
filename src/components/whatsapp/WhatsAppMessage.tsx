import { WhatsAppMessage as MessageType } from "@/pages/DepoimentosGenerator";
import { Check } from "lucide-react";

interface WhatsAppMessageProps {
  message: MessageType;
  theme: "light" | "dark";
}

export const WhatsAppMessage = ({ message, theme }: WhatsAppMessageProps) => {
  const isSent = message.type === "sent";
  const isDark = theme === "dark";

  const bgSent = isDark ? "#005c4b" : "#d9fdd3";
  const bgReceived = isDark ? "#1f2c33" : "#ffffff";
  const textColor = isDark ? "#e9edef" : "#111b21";
  const textMuted = isDark ? "#8696a0" : "#667781";
  const replyBg = isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(0, 0, 0, 0.05)";
  const replyBorder = isDark ? "#06cf9c" : "#06cf9c";

  return (
    <div className={`flex ${isSent ? "justify-end" : "justify-start"} mb-[2px] px-2`}>
      <div
        className={`relative max-w-[85%] rounded-lg px-2 py-1 shadow-sm ${
          isSent ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{ backgroundColor: isSent ? bgSent : bgReceived }}
      >
        {message.replyTo && (
          <div 
            className="mb-1 px-2 py-1 rounded border-l-4"
            style={{ 
              backgroundColor: replyBg,
              borderColor: replyBorder
            }}
          >
            <p className="text-xs font-semibold" style={{ color: replyBorder }}>
              {message.replyTo.senderName}
            </p>
            <p 
              className="text-xs line-clamp-2"
              style={{ color: textMuted }}
            >
              {message.replyTo.text}
            </p>
          </div>
        )}

        <p 
          className="text-[15px] break-words whitespace-pre-wrap leading-[1.3] py-1"
          style={{ color: textColor }}
        >
          {message.text}
        </p>

        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isSent ? 'ml-10' : ''}`}>
          <span className="text-[11px]" style={{ color: textMuted }}>
            {message.timestamp}
          </span>
          {isSent && (
            <div className="flex">
              <Check className="w-[14px] h-[14px]" style={{ color: "#53bdeb" }} strokeWidth={2.5} />
              <Check className="w-[14px] h-[14px] -ml-[9px]" style={{ color: "#53bdeb" }} strokeWidth={2.5} />
            </div>
          )}
        </div>

        <div
          className={`absolute bottom-0 ${
            isSent ? "right-[-6px]" : "left-[-6px]"
          }`}
          style={{
            width: 0,
            height: 0,
            borderStyle: "solid",
            ...(isSent
              ? {
                  borderWidth: "0 0 13px 10px",
                  borderColor: `transparent transparent ${bgSent} transparent`,
                }
              : {
                  borderWidth: "0 10px 13px 0",
                  borderColor: `transparent ${bgReceived} transparent transparent`,
                }),
          }}
        />
      </div>
    </div>
  );
};
