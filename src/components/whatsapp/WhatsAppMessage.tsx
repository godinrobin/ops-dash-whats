import { WhatsAppMessage as MessageType } from "@/pages/DepoimentosGenerator";
import { Check, FileText, Play } from "lucide-react";

interface WhatsAppMessageProps {
  message: MessageType;
  theme: "light" | "dark";
  exportMode?: boolean;
}

export const WhatsAppMessage = ({ message, theme, exportMode = false }: WhatsAppMessageProps) => {
  const isSent = message.type === "sent";
  const isDark = theme === "dark";

  const bgSent = isDark ? "#005c4b" : "#d9fdd3";
  const bgReceived = isDark ? "#1f2c33" : "#ffffff";
  const textColor = isDark ? "#e9edef" : "#000000";
  const textMuted = isDark ? "#8696a0" : "#667781";
  const replyBg = isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(0, 0, 0, 0.05)";
  const replyBorder = isDark ? "#06cf9c" : "#06cf9c";

  return (
    <div className={`flex ${isSent ? "justify-end" : "justify-start"} mb-[2px] px-2`}>
      <div
        className={`relative max-w-[85%] rounded-[8px] shadow-sm whatsapp-bubble ${
          isSent ? "rounded-br-[3px]" : "rounded-bl-[3px]"
        } ${message.mediaType ? "" : "px-[7px] pt-[6px]"}`}
        style={{ 
          backgroundColor: isSent ? bgSent : bgReceived,
          paddingBottom: '22px',
          paddingRight: isSent ? '36px' : '16px'
        }}
      >
        {message.replyTo && (
          <div 
            className="mb-1 px-2 py-1 rounded border-l-4 mt-2 mx-2"
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

        {/* Media Content */}
        {message.mediaType === "image" && message.mediaUrl && (
          <div className="rounded-t-lg overflow-hidden">
            <img src={message.mediaUrl} alt="Imagem" className="w-full max-h-[300px] object-cover" />
          </div>
        )}

        {message.mediaType === "video" && message.mediaUrl && (
          <div className="rounded-t-lg overflow-hidden relative bg-black">
            <img src={message.mediaUrl} alt="Video" className="w-full max-h-[300px] object-cover opacity-70" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-8 h-8 text-black ml-1" fill="black" />
              </div>
            </div>
          </div>
        )}

        {message.mediaType === "pdf" && message.mediaUrl && (
          <div className="p-3 flex items-center gap-3 border-b" style={{ borderColor: textMuted + "40" }}>
            <div className="w-12 h-12 rounded-lg bg-red-500 flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: textColor }}>
                {message.pdfName || "Documento.pdf"}
              </p>
              <p className="text-xs" style={{ color: textMuted }}>PDF</p>
            </div>
          </div>
        )}

        {(message.text || message.caption) && (
          <p 
            className={`text-[14.2px] break-words whitespace-pre-wrap leading-[19.1px] text-left ${message.mediaType ? "px-2 pb-1 pt-2" : ""}`}
            style={{ color: textColor, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
          >
            {message.caption || message.text}
          </p>
        )}

        <div 
          className="whatsapp-timestamp absolute flex items-center gap-1"
          style={{ bottom: 6, right: 8, left: 'auto', margin: 0, padding: 0, whiteSpace: 'nowrap', lineHeight: 1 }}
        >
          <span className="text-[11px] leading-[15px]" style={{ color: textMuted }}>
            {message.timestamp}
          </span>
          {isSent && (
            <div className="flex">
              <Check className="w-[14px] h-[14px]" style={{ color: "#53bdeb" }} strokeWidth={2.5} />
              <Check className="w-[14px] h-[14px] -ml-[9px]" style={{ color: "#53bdeb" }} strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Tail */}
        <div
          className={`absolute bottom-0 ${
            isSent
              ? "right-[-6px]"
              : "left-[-6px]"
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
