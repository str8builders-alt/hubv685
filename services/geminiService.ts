
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Attachment, UserLocation } from "../types";
import { createPcmBlob, decode, decodeAudioData } from "./audioUtils";

const API_KEY = process.env.API_KEY || '';

// Singleton instance
let aiInstance: GoogleGenAI | null = null;

const getAi = () => {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: API_KEY });
  }
  return aiInstance;
};

// --- CHAT & PLAN ANALYSIS ---

export const generatePlanAnalysis = async (
  prompt: string, 
  attachments: Attachment[], 
  location?: UserLocation
) => {
  const ai = getAi();
  
  const parts: any[] = [];
  
  // Add attachments
  attachments.forEach(att => {
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.base64
      }
    });
  });

  // Add text prompt
  parts.push({ text: prompt });

  // Use gemini-2.5-flash for compatibility with Google Maps tool
  const model = 'gemini-2.5-flash';

  const tools: any[] = [];
  let toolConfig: any = undefined;

  // Add Maps if location is available and relevant
  if (location) {
    tools.push({ googleMaps: {} });
    toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: location.latitude,
          longitude: location.longitude
        }
      }
    };
  } else {
    // Fallback to search grounding
    tools.push({ googleSearch: {} });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: "You are an expert AI assistant for New Zealand tradies. You are knowledgeable about the NZ Building Code (NZBC), NZS 3604, and local construction practices. When analyzing plans, explicitly cite relevant code clauses. Be professional, concise, and safety-conscious.",
        tools,
        toolConfig,
      }
    });

    return response;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw error;
  }
};

// --- LIVE API ---

export class GeminiLiveSession {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private stream: MediaStream | null = null;
  private cleanupCallbacks: (() => void)[] = [];

  constructor(
    private onMessage: (msg: LiveServerMessage) => void,
    private onError: (err: Error) => void,
    private onClose: () => void
  ) {}

  async connect(systemInstruction?: string) {
    const ai = getAi();
    
    // Setup Audio Contexts
    try {
        this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // Ensure contexts are running (vital for browser autoplay policies)
        if (this.inputAudioContext.state === 'suspended') {
            await this.inputAudioContext.resume();
        }
        if (this.outputAudioContext.state === 'suspended') {
            await this.outputAudioContext.resume();
        }
    } catch (e) {
        console.error("Audio Context Init Failed", e);
        throw new Error("Could not initialize audio");
    }
    
    // Get Mic Stream
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error("Mic access denied", e);
      this.onError(new Error("Microphone access denied"));
      return;
    }

    // Connect to Live API
    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Session Opened");
          this.startAudioStreaming();
        },
        onmessage: async (message: LiveServerMessage) => {
          this.handleServerMessage(message);
          this.onMessage(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error("Gemini Live Error", e);
          this.onError(new Error("Connection error"));
        },
        onclose: (e: CloseEvent) => {
          console.log("Gemini Live Closed");
          this.onClose();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: systemInstruction || 'You are a helpful, rugged, and knowledgeable AI assistant for New Zealand tradies. Speak clearly and concisely about building plans, materials, and schedules.',
      },
    });
  }

  private startAudioStreaming() {
    if (!this.inputAudioContext || !this.stream || !this.sessionPromise) return;

    try {
        const source = this.inputAudioContext.createMediaStreamSource(this.stream);
        const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        scriptProcessor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBlob = createPcmBlob(inputData);
          
          this.sessionPromise?.then((session) => {
            if (session && typeof session.sendRealtimeInput === 'function') {
                 session.sendRealtimeInput({ media: pcmBlob });
            }
          }).catch(e => {
             // Silence unhandled promise rejections for connection glitches
          });
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(this.inputAudioContext.destination);
        
        this.cleanupCallbacks.push(() => {
          source.disconnect();
          scriptProcessor.disconnect();
        });
    } catch (e) {
        console.error("Audio Streaming Error", e);
    }
  }

  private async handleServerMessage(message: LiveServerMessage) {
    if (!this.outputAudioContext) return;

    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      try {
        const audioBuffer = await decodeAudioData(
          decode(base64Audio),
          this.outputAudioContext,
          24000,
          1
        );
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        const gainNode = this.outputAudioContext.createGain();
        // Slightly boost volume
        gainNode.gain.value = 1.2; 
        
        source.connect(gainNode);
        gainNode.connect(this.outputAudioContext.destination);
        
        source.addEventListener('ended', () => {
          this.sources.delete(source);
        });

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
      } catch (e) {
        console.error("Error decoding audio", e);
      }
    }

    // Handle Interruption
    if (message.serverContent?.interrupted) {
      this.sources.forEach(s => {
        try { s.stop(); } catch(e) {}
      });
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  disconnect() {
    // Stop tracks
    this.stream?.getTracks().forEach(t => t.stop());
    
    // Cleanup nodes
    this.cleanupCallbacks.forEach(cb => cb());
    
    // Close audio contexts
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    
    // Attempt to close session if method exists
    this.sessionPromise?.then(session => {
        if (session && 'close' in session) (session as any).close();
    }).catch(() => {});
  }
}
