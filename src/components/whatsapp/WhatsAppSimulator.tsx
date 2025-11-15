import { Conversation } from "@/pages/DepoimentosGenerator";
import { Battery, Signal, Wifi, ArrowLeft, Phone, Video, MoreVertical } from "lucide-react";
import { WhatsAppMessage } from "./WhatsAppMessage";

interface WhatsAppSimulatorProps {
  conversation: Conversation;
}

export const WhatsAppSimulator = ({ conversation }: WhatsAppSimulatorProps) => {
  const isIOS = conversation.os === "ios";

  return (
    <div id="whatsapp-simulator" className="mx-auto" style={{ width: '375px' }}>
      <div className={`relative ${isIOS ? 'rounded-[55px]' : 'rounded-[40px]'} overflow-hidden shadow-2xl bg-black`}>
        {/* Notch (iOS) ou Camera (Android) */}
        {isIOS ? (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-50" />
        ) : (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-1 bg-gray-800 rounded-full z-50" />
        )}

        {/* Status Bar */}
        <div className="relative bg-[#075E54] pt-10 pb-3 px-6">
          <div className="flex justify-between items-center text-white text-xs">
            <span className="font-semibold">{conversation.phoneTime}</span>
            <div className="flex items-center gap-1">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <Battery className="w-3 h-3" />
              <span className="text-[10px]">{conversation.batteryLevel}%</span>
            </div>
          </div>

          {/* WhatsApp Header */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3 flex-1">
              <ArrowLeft className="w-6 h-6 text-white" />
              <img
                src={conversation.contactPhoto}
                alt={conversation.contactName}
                className="w-10 h-10 rounded-full border-2 border-white"
              />
              <div className="flex-1">
                <p className="text-white font-semibold">{conversation.contactName}</p>
                <p className="text-white/80 text-xs">online</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Video className="w-5 h-5 text-white" />
              <Phone className="w-5 h-5 text-white" />
              <MoreVertical className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        {/* Chat Background */}
        <div 
          className="h-[600px] overflow-y-auto px-4 py-4"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23075e54' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: '#ece5dd'
          }}
        >
          <div className="space-y-2">
            {conversation.messages.map((message) => (
              <WhatsAppMessage key={message.id} message={message} />
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-[#f0f0f0] p-2 flex items-center gap-2">
          <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center gap-2">
            <span className="text-gray-400 text-sm">Mensagem</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#075E54] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/>
            </svg>
          </div>
        </div>

        {/* Home Indicator (iOS) */}
        {isIOS && (
          <div className="h-6 bg-[#f0f0f0] flex items-center justify-center">
            <div className="w-32 h-1 bg-gray-800 rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
};
