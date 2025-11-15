import { Conversation } from "@/pages/DepoimentosGenerator";
import { Battery, Signal, Wifi, ArrowLeft, Phone, Video, MoreVertical, Camera, Mic, Plus, Smile } from "lucide-react";
import { WhatsAppMessage } from "./WhatsAppMessage";

interface WhatsAppSimulatorProps {
  conversation: Conversation;
}

export const WhatsAppSimulator = ({ conversation }: WhatsAppSimulatorProps) => {
  const isIOS = conversation.os === "ios";
  const isDark = conversation.theme === "dark";

  const bgChat = isDark ? "#0b141a" : "#efeae2";
  const bgHeader = isDark ? "#1f2c33" : "#075e54";
  const bgInput = isDark ? "#1f2c33" : "#f0f0f0";
  const bgInputField = isDark ? "#2a3942" : "#ffffff";
  const textHeader = "#ffffff";
  const textInput = isDark ? "#8696a0" : "#667781";

  return (
    <div id="whatsapp-simulator" className="mx-auto" style={{ width: '375px' }}>
      <div className={`relative ${isIOS ? 'rounded-[55px]' : 'rounded-[40px]'} overflow-hidden shadow-2xl bg-black`}>
        {isIOS && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-50" />
        )}

        <div className="relative pt-2 px-6" style={{ backgroundColor: bgHeader }}>
          <div className="flex justify-between items-center text-xs" style={{ color: textHeader }}>
            <span className="font-semibold">{conversation.phoneTime}</span>
            <div className="flex items-center gap-1">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <Battery className="w-3 h-3" />
              <span className="text-[10px]">{conversation.batteryLevel}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 pb-3">
            <div className="flex items-center gap-3 flex-1">
              <ArrowLeft className="w-6 h-6" style={{ color: textHeader }} />
              <img
                src={conversation.contactPhoto}
                alt={conversation.contactName}
                className="w-10 h-10 rounded-full border-2"
                style={{ borderColor: textHeader }}
              />
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: textHeader }}>
                  {conversation.contactName}
                </p>
                <p className="text-xs opacity-80" style={{ color: textHeader }}>online</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <Video className="w-[22px] h-[22px]" style={{ color: textHeader }} />
              <Phone className="w-[22px] h-[22px]" style={{ color: textHeader }} />
              <MoreVertical className="w-[22px] h-[22px]" style={{ color: textHeader }} />
            </div>
          </div>
        </div>

        <div 
          className="h-[600px] overflow-y-auto px-2 py-3"
          style={{
            backgroundImage: isDark 
              ? `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              : `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d9d0c3' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: bgChat
          }}
        >
          {conversation.unreadCount && conversation.unreadCount > 0 && (
            <div className="flex items-center justify-center my-3">
              <div 
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: isDark ? "#182229" : "#d1d7db",
                  color: isDark ? "#8696a0" : "#54656f"
                }}
              >
                Mensagens não lidas: {conversation.unreadCount}
              </div>
            </div>
          )}

          <div className="space-y-[2px]">
            {conversation.messages.map((message) => (
              <WhatsAppMessage 
                key={message.id} 
                message={message} 
                theme={conversation.theme}
              />
            ))}
          </div>
        </div>

        <div className="p-2 flex items-center gap-2" style={{ backgroundColor: bgInput }}>
          <Plus className="w-6 h-6" style={{ color: textInput }} />
          <div 
            className="flex-1 rounded-full px-4 py-2 flex items-center gap-2"
            style={{ backgroundColor: bgInputField }}
          >
            <Smile className="w-5 h-5" style={{ color: textInput }} />
            <span className="text-sm flex-1" style={{ color: textInput }}>Mensagem</span>
            <Camera className="w-5 h-5" style={{ color: textInput }} />
          </div>
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#00a884" }}
          >
            <Mic className="w-5 h-5 text-white" />
          </div>
        </div>

        {isIOS && (
          <div className="h-5 flex items-center justify-center" style={{ backgroundColor: bgInput }}>
            <div className="w-32 h-1 bg-gray-800 rounded-full opacity-40" />
          </div>
        )}
      </div>
    </div>
  );
};
