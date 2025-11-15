import { Conversation } from "@/pages/DepoimentosGenerator";
import { Phone, Video, MoreVertical, Camera, Mic, Plus, Smile, Sticker } from "lucide-react";
import { WhatsAppMessage } from "./WhatsAppMessage";
import whatsappBgLight from "@/assets/whatsapp-bg-light.png";

interface WhatsAppSimulatorProps {
  conversation: Conversation;
}

export const WhatsAppSimulator = ({ conversation }: WhatsAppSimulatorProps) => {
  const isIOS = conversation.os === "ios";
  const isDark = conversation.theme === "dark";

  const bgChat = isDark ? "#0b141a" : "#efeae2";
  const bgHeader = isDark ? "#1f2c33" : "#f0f2f5";
  const bgInput = isDark ? "#1f2c33" : "#f0f0f0";
  const bgInputField = isDark ? "#2a3942" : "#ffffff";
  const textHeader = isDark ? "#ffffff" : "#111b21";
  const textInput = isDark ? "#8696a0" : "#667781";

  return (
    <div id="whatsapp-simulator" className="mx-auto" style={{ width: '375px' }}>
      <div className="relative overflow-hidden shadow-2xl bg-black">
        {isIOS && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-50" />
        )}

        <div className="relative pt-2 px-6" style={{ backgroundColor: bgHeader }}>
          <div className="flex justify-between items-center text-xs font-semibold" style={{ color: textHeader }}>
            <span className="tracking-tight">{conversation.phoneTime}</span>
            <div className="flex items-center gap-[2px]">
              {/* Signal bars */}
              <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                <rect x="0" y="7" width="2.5" height="4" rx="0.5" fill="currentColor"/>
                <rect x="4" y="5" width="2.5" height="6" rx="0.5" fill="currentColor"/>
                <rect x="8" y="3" width="2.5" height="8" rx="0.5" fill="currentColor"/>
                <rect x="12" y="0" width="2.5" height="11" rx="0.5" fill="currentColor"/>
              </svg>
              {/* WiFi */}
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="ml-0.5">
                <path d="M8 10.5C8.82843 10.5 9.5 9.82843 9.5 9C9.5 8.17157 8.82843 7.5 8 7.5C7.17157 7.5 6.5 8.17157 6.5 9C6.5 9.82843 7.17157 10.5 8 10.5Z" fill="currentColor"/>
                <path d="M4 6.5C5.5 5 6.5 4.5 8 4.5C9.5 4.5 10.5 5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M1.5 3.5C3.5 1.5 5.5 0.5 8 0.5C10.5 0.5 12.5 1.5 14.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {/* Battery */}
              <svg width="26" height="12" viewBox="0 0 26 12" fill="none" className="ml-0.5">
                <rect x="1" y="1" width="20" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none"/>
                <rect x="2.5" y="2.5" width={`${(conversation.batteryLevel / 100) * 17}`} height="7" rx="1" fill="currentColor"/>
                <path d="M22 4V8C22.5 7.8 23 7.5 23.5 7V5C23 4.5 22.5 4.2 22 4Z" fill="currentColor"/>
              </svg>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 pb-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex items-center gap-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: textHeader }}>
                  <path d="M15 19L8 12L15 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {conversation.unreadCount && conversation.unreadCount > 0 && (
                  <div 
                    className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold px-1"
                    style={{ 
                      backgroundColor: isDark ? "#00a884" : "#25d366",
                      color: "#ffffff"
                    }}
                  >
                    {conversation.unreadCount}
                  </div>
                )}
              </div>
              <img
                src={conversation.contactPhoto}
                alt={conversation.contactName}
                className="w-10 h-10 rounded-full"
              />
              <div className="flex-1">
                <p className="font-semibold text-[17px] leading-tight tracking-tight" style={{ color: textHeader }}>
                  {conversation.contactName}
                </p>
                {conversation.isOnline !== false && (
                  <p className="text-[13px] opacity-70 mt-0.5" style={{ color: textHeader }}>online</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <Video className="w-[23px] h-[23px]" style={{ color: textHeader }} strokeWidth={2} />
              <Phone className="w-[23px] h-[23px]" style={{ color: textHeader }} strokeWidth={2} />
              {!isIOS && (
                <MoreVertical className="w-[23px] h-[23px]" style={{ color: textHeader }} strokeWidth={2} />
              )}
            </div>
          </div>
        </div>

        <div 
          className="h-[600px] overflow-y-auto px-2 py-3"
          style={{
            backgroundImage: isDark 
              ? `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              : `url(${whatsappBgLight})`,
            backgroundColor: bgChat,
            backgroundSize: isDark ? '60px 60px' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: isDark ? 'repeat' : 'no-repeat'
          }}
        >
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
          <Plus className="w-7 h-7" style={{ color: isDark ? textInput : "#54656f" }} strokeWidth={2} />
          <div 
            className="flex-1 rounded-full px-4 py-2.5 flex items-center gap-3"
            style={{ backgroundColor: bgInputField }}
          >
            <Smile className="w-[22px] h-[22px]" style={{ color: textInput }} strokeWidth={2} />
            <span className="text-[15px] flex-1" style={{ color: textInput }}>Mensagem</span>
            <Sticker className="w-[21px] h-[21px]" style={{ color: textInput }} strokeWidth={1.8} />
          </div>
          <Camera 
            className="w-[26px] h-[26px]" 
            style={{ color: isDark ? textInput : "#54656f" }} 
            strokeWidth={2}
          />
          <Mic 
            className="w-[26px] h-[26px]" 
            style={{ color: isDark ? textInput : "#54656f" }} 
            strokeWidth={2}
          />
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
