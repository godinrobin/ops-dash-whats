import { WhatsAppMessage as MessageType } from "@/pages/DepoimentosGenerator";
import { Check } from "lucide-react";

interface WhatsAppMessageProps {
  message: MessageType;
}

export const WhatsAppMessage = ({ message }: WhatsAppMessageProps) => {
  const isSent = message.type === "sent";

  return (
    <div className={`flex ${isSent ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`relative max-w-[75%] rounded-lg px-3 py-2 ${
          isSent
            ? "bg-[#dcf8c6] rounded-br-none"
            : "bg-white rounded-bl-none shadow-sm"
        }`}
      >
        <p className="text-sm text-gray-800 break-words whitespace-pre-wrap">{message.text}</p>
        <div className={`flex items-center justify-end gap-1 mt-1 ${isSent ? 'ml-8' : ''}`}>
          <span className="text-[10px] text-gray-500">{message.timestamp}</span>
          {isSent && (
            <div className="flex">
              <Check className="w-3 h-3 text-[#4fc3f7]" />
              <Check className="w-3 h-3 text-[#4fc3f7] -ml-2" />
            </div>
          )}
        </div>
        {/* Tail */}
        <div
          className={`absolute bottom-0 ${
            isSent
              ? "right-[-8px] border-l-[8px] border-l-[#dcf8c6] border-b-[8px]"
              : "left-[-8px] border-r-[8px] border-r-white border-b-[8px]"
          } border-b-transparent w-0 h-0`}
        />
      </div>
    </div>
  );
};
