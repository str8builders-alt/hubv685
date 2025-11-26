
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isThinking?: boolean;
  attachments?: Attachment[];
  groundingMetadata?: any;
}

export interface Attachment {
  id?: string;
  type: 'image' | 'pdf';
  url: string;
  base64: string;
  mimeType: string;
  name: string;
  date?: Date;
  analysis?: string;
}

export enum AppMode {
  LANDING = 'LANDING',
  LIVE = 'LIVE',
  CHAT = 'CHAT',
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
