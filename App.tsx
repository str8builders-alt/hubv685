import React, { useState } from 'react';
import LiveInterface from './components/LiveInterface';
import ChatInterface from './components/ChatInterface';
import { AppMode, Message, Attachment } from './types';

const App: React.FC = () => {
  // Default to Live mode as per screenshots showing the Orb/Home screen first
  const [mode, setMode] = useState<AppMode>(AppMode.LIVE);
  
  // Lifted state for messages to share between Live (Quick Ask) and Chat
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Kia ora! Upload a plan or ask me about NZ Building Codes. I can help with compliance checks, material estimation, or general construction queries.',
      timestamp: new Date()
    }
  ]);

  // Persistent Plan State
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);
  const [savedAttachments, setSavedAttachments] = useState<Attachment[]>([]);

  return (
    <div className="h-screen w-full bg-black flex justify-center">
      {/* Mobile container constraint to match screenshots */}
      <div className="w-full h-full max-w-md bg-black relative shadow-2xl overflow-hidden border-x border-white/5">
        
        {mode === AppMode.LIVE && (
          <LiveInterface 
            onBack={() => {}} 
            onSwitchToChat={() => setMode(AppMode.CHAT)}
            setMessages={setMessages}
            activeAttachment={activeAttachment}
            setActiveAttachment={setActiveAttachment}
            savedAttachments={savedAttachments}
            setSavedAttachments={setSavedAttachments}
          />
        )}
        
        {mode === AppMode.CHAT && (
          <ChatInterface 
            onBack={() => setMode(AppMode.LIVE)}
            messages={messages}
            setMessages={setMessages}
            activeAttachment={activeAttachment} // Pass context if needed
          />
        )}

      </div>
    </div>
  );
};

export default App;