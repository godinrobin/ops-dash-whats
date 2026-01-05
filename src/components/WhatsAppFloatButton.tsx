import whatsappIcon from "@/assets/whatsapp-float-icon.png";

interface WhatsAppFloatButtonProps {
  phoneNumber: string;
  message: string;
}

export function WhatsAppFloatButton({ phoneNumber, message }: WhatsAppFloatButtonProps) {
  const cleanedNumber = phoneNumber.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${cleanedNumber}?text=${encodedMessage}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 animate-in fade-in slide-in-from-bottom-4"
      aria-label="Contato via WhatsApp"
    >
      <img
        src={whatsappIcon}
        alt="WhatsApp"
        className="w-full h-full object-contain drop-shadow-lg"
      />
    </a>
  );
}
