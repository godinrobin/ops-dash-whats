export interface WhatsAppGroup {
  id: string;
  name: string;
  description?: string;
  profile_pic_url?: string | null;
  owner: string;
  creation: number;
  participant_count: number;
  instance_id: string;
  jid: string; // remoteJid like 1234567890@g.us
}

export interface WhatsAppGroupMember {
  id: string;
  phone: string;
  name?: string;
  profile_pic_url?: string | null;
  admin: boolean;
  superadmin: boolean;
}

export interface GroupMessage {
  id: string;
  group_jid: string;
  sender_jid: string;
  sender_name?: string;
  content: string | null;
  message_type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker';
  media_url: string | null;
  timestamp: string;
  is_from_me: boolean;
}
