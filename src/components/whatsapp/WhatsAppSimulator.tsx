import { Conversation } from "@/pages/DepoimentosGenerator";
import { Phone, Video, MoreVertical, Camera, Mic, Plus } from "lucide-react";
import { WhatsAppMessage } from "./WhatsAppMessage";
import whatsappBgLight from "@/assets/whatsapp-bg-light.png";

interface WhatsAppSimulatorProps {
  conversation: Conversation;
}

export const WhatsAppSimulator = ({ conversation }: WhatsAppSimulatorProps) => {
  const isIOS = conversation.os === "ios";
  const isDark = conversation.theme === "dark";

  const bgChat = isDark ? "#0b141a" : "#efeae2";
  const bgHeader = isDark ? "#1f2c33" : "#f4f0ec";
  const bgInput = isDark ? "#1f2c33" : "#f4f0ec";
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
          <div className="flex justify-between items-center text-[13px] font-semibold" style={{ color: textHeader }}>
            <span className="tracking-tight ml-2">{conversation.phoneTime}</span>
            <div className="flex items-center gap-[2px]">
              {/* Signal bars */}
              <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                <rect x="0" y="7" width="2.5" height="4" rx="0.5" fill="currentColor"/>
                <rect x="4" y="5" width="2.5" height="6" rx="0.5" fill="currentColor"/>
                <rect x="8" y="3" width="2.5" height="8" rx="0.5" fill="currentColor"/>
                <rect x="12" y="0" width="2.5" height="11" rx="0.5" fill="currentColor"/>
              </svg>
              {/* WiFi */}
              <svg width="15" height="11" viewBox="0 0 15 11" fill="none" className="ml-0.5">
                <circle cx="7.5" cy="9" r="1" fill="currentColor"/>
                <path d="M4.5 6.5C5.5 5.5 6.3 5 7.5 5C8.7 5 9.5 5.5 10.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                <path d="M1.5 3.5C3 2 5 1 7.5 1C10 1 12 2 13.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
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
              <div className="flex items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M15 19L8 12L15 5" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {conversation.unreadCount && conversation.unreadCount > 0 && (
                  <span 
                    style={{ 
                      color: "#000000",
                      fontSize: "16px",
                      fontWeight: "400",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
                    }}
                  >
                    {conversation.unreadCount}
                  </span>
                )}
              </div>
              <img
                src={conversation.contactPhoto}
                alt={conversation.contactName}
                className="w-10 h-10 rounded-full"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1">
                <p className="font-semibold text-[17px] leading-tight tracking-tight" style={{ 
                  color: textHeader,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
                  fontWeight: "500"
                }}>
                  {conversation.contactName}
                </p>
                {conversation.isOnline !== false && (
                  <p className="text-[13px] opacity-70 mt-0.5" style={{ 
                    color: textHeader,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
                    fontWeight: "400"
                  }}>online</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <Video className="w-[23px] h-[23px]" style={{ color: "#000000" }} strokeWidth={1.5} />
              <Phone className="w-[23px] h-[23px]" style={{ color: "#000000" }} strokeWidth={1.5} />
              {!isIOS && (
                <MoreVertical className="w-[23px] h-[23px]" style={{ color: "#000000" }} strokeWidth={1.5} />
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
          <Plus className="w-7 h-7" style={{ color: "#000000" }} strokeWidth={1.5} />
          <div 
            className="flex-1 rounded-full px-4 py-2.5 flex items-center"
            style={{ backgroundColor: bgInputField, border: "2px solid #d1d1d6" }}
          >
          </div>
          <Camera 
            className="w-[24px] h-[24px]" 
            style={{ color: "#000000" }} 
            strokeWidth={1.5}
          />
          <Mic
            className="w-[24px] h-[24px]" 
            style={{ color: "#000000" }} 
            strokeWidth={1.5}
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
