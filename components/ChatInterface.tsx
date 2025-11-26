
import React, { useState, useEffect, useRef } from 'react';
import { Message, Attachment, UserLocation } from '../types';
import { generatePlanAnalysis } from '../services/geminiService';
import PlanUploader from './PlanUploader';

interface ChatInterfaceProps {
  onBack: () => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  activeAttachment: Attachment | null;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onBack, messages, setMessages, activeAttachment }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [location, setLocation] = useState<UserLocation | undefined>(undefined);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with active attachment if present (only if no attachments currently selected)
  useEffect(() => {
      if (activeAttachment && attachments.length === 0) {
          setAttachments([activeAttachment]);
      }
  }, [activeAttachment]);

  useEffect(() => {
    // Get location for Maps Grounding
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => console.log("Geo permission denied or error", error)
      );
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date(),
      attachments: [...attachments]
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    // NOTE: We don't clear attachments immediately if it's the persistent active one, 
    // but typically in chat you want to clear after send. 
    // Let's clear manual attachments but maybe keep persistent one? 
    // For simplicity, clear all. User can re-add or rely on context memory if implemented.
    setAttachments([]); 
    setIsLoading(true);

    try {
      // Create a temporary "thinking" message
      const thinkingMsgId = 'thinking-' + Date.now();
      setMessages(prev => [...prev, {
        id: thinkingMsgId,
        role: 'model',
        text: 'Reviewing plans and regulations...',
        timestamp: new Date(),
        isThinking: true
      }]);

      const response = await generatePlanAnalysis(userMsg.text, userMsg.attachments || [], location);
      
      const responseText = response.text || "I processed that but couldn't generate a text response.";
      
      // Remove thinking message and add real response
      setMessages(prev => prev.filter(m => m.id !== thinkingMsgId).concat({
        id: Date.now().toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date(),
        groundingMetadata: response.candidates?.[0]?.groundingMetadata
      }));

    } catch (error) {
      console.error(error);
      setMessages(prev => prev.filter(m => !m.isThinking).concat({
        id: Date.now().toString(),
        role: 'model',
        text: "Sorry, I encountered an error processing your request. Please check your internet connection or try again.",
        timestamp: new Date()
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to render text with inline citations
  const renderMessageContent = (msg: Message) => {
    if (msg.role === 'user') {
        return <div className="whitespace-pre-wrap leading-relaxed markdown-content">{msg.text}</div>;
    }

    if (!msg.groundingMetadata || !msg.groundingMetadata.groundingSupports) {
         return <div className="whitespace-pre-wrap leading-relaxed markdown-content">{msg.text}</div>;
    }

    const { text, groundingMetadata } = msg;
    const supports = groundingMetadata.groundingSupports;
    const chunks = groundingMetadata.groundingChunks;

    let elements: React.ReactNode[] = [];
    let lastIndex = 0;

    // Sort supports just in case
    const sortedSupports = [...supports].sort((a: any, b: any) => 
        (a.segment?.startIndex || 0) - (b.segment?.startIndex || 0)
    );

    sortedSupports.forEach((support: any, idx: number) => {
        const start = support.segment?.startIndex || 0;
        const end = support.segment?.endIndex || 0;
        const chunkIndices = support.groundingChunkIndices || [];

        // Add text before the segment
        if (start > lastIndex) {
            elements.push(<span key={`text-${idx}`}>{text.substring(lastIndex, start)}</span>);
        }

        // Add the segment text with a highlight/marker
        const segmentText = text.substring(start, end);
        elements.push(
            <span key={`seg-${idx}`} className="bg-green-900/30 rounded px-0.5 border-b border-green-500/20">
                {segmentText}
                {chunkIndices.map((ci: number) => (
                    <sup key={`cit-${idx}-${ci}`} className="ml-0.5 text-[10px] font-bold text-green-400 select-none">
                        [{ci + 1}]
                    </sup>
                ))}
            </span>
        );

        lastIndex = end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
        elements.push(<span key="text-end">{text.substring(lastIndex)}</span>);
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="whitespace-pre-wrap leading-relaxed">
                {elements}
            </div>
            
            {/* Structured References Section */}
            {chunks && chunks.length > 0 && (
                <div className="mt-2 border-t border-white/10 pt-3">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">References & Sources</h4>
                    <div className="space-y-2">
                        {chunks.map((chunk: any, i: number) => {
                            if (chunk.web) {
                                return (
                                    <a key={i} href={chunk.web.uri} target="_blank" rel="noreferrer" 
                                       className="flex items-start gap-3 p-2 rounded bg-black/20 hover:bg-black/40 border border-white/5 hover:border-green-500/30 transition-all group">
                                        <div className="flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-white/10 text-[10px] text-green-400 font-bold">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-green-300 truncate group-hover:text-green-200">
                                                {chunk.web.title}
                                            </div>
                                            <div className="text-[10px] text-gray-500 truncate">
                                                {chunk.web.uri}
                                            </div>
                                        </div>
                                    </a>
                                );
                            }
                            if (chunk.maps) {
                                return (
                                    <a key={i} href={chunk.maps.uri} target="_blank" rel="noreferrer" 
                                       className="flex items-start gap-3 p-2 rounded bg-black/20 hover:bg-black/40 border border-white/5 hover:border-blue-500/30 transition-all group">
                                         <div className="flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-blue-500/20 text-[10px] text-blue-400 font-bold">
                                            📍
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-blue-300 truncate group-hover:text-blue-200">
                                                {chunk.maps.title}
                                            </div>
                                            <div className="text-[10px] text-gray-500 truncate">
                                                View on Google Maps
                                            </div>
                                        </div>
                                    </a>
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-black text-white relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-400 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <h1 className="font-semibold text-lg">Chat & Plans</h1>
        </div>
        <div className="w-6"></div> {/* Spacer */}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl p-4 ${
              msg.role === 'user' 
                ? 'bg-tradie-green text-black' 
                : 'bg-white/10 text-gray-100 border border-white/5'
            }`}>
              
              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.attachments.map((att, idx) => (
                    <button 
                        key={idx} 
                        onClick={() => setViewingAttachment(att)}
                        className={`group relative flex items-center gap-3 transition-all rounded-xl p-2 pr-4 overflow-hidden border ${
                             msg.role === 'user' 
                             ? 'bg-black/10 border-black/10 hover:bg-black/20' 
                             : 'bg-black/40 border-white/10 hover:bg-black/60 hover:border-green-500/30'
                        }`}
                    >
                      {/* Thumbnail / Icon */}
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden border ${msg.role === 'user' ? 'bg-white/20 border-white/10' : 'bg-white/5 border-white/5'}`}>
                        {att.type === 'pdf' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-6 h-6 ${msg.role === 'user' ? 'text-red-700' : 'text-red-400'}`}>
                                <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
                                <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                            </svg>
                        ) : (
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="flex flex-col items-start min-w-0">
                        <span className={`text-xs font-medium truncate max-w-[140px] block ${msg.role === 'user' ? 'text-black/80' : 'text-gray-200'}`}>{att.name}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                             <span className={`text-[10px] uppercase tracking-wider font-semibold ${msg.role === 'user' ? 'text-black/50' : 'text-gray-500'}`}>{att.type}</span>
                             <span className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ${msg.role === 'user' ? 'text-black/60' : 'text-green-500'}`}>
                                • Preview
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                </svg>
                             </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Text & Content */}
              {msg.isThinking ? (
                <div className="flex items-center gap-2 text-sm opacity-70">
                   <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Thinking...
                </div>
              ) : (
                renderMessageContent(msg)
              )}

            </div>
            <span className="text-xs text-gray-600 mt-1 px-1">
              {msg.role === 'user' ? 'You' : 'Tradie AI'}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-black border-t border-white/10">
        {attachments.length > 0 && (
           <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
              {attachments.map((att, i) => (
                  <div key={i} className="relative bg-white/10 rounded-lg pr-8 pl-2 py-1.5 text-sm flex items-center gap-2 border border-white/10">
                     {att.type === 'pdf' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-400">
                            <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
                            <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                        </svg>
                     ) : (
                        <img src={att.url} className="w-4 h-4 rounded object-cover" />
                     )}
                     <span className="truncate max-w-[120px] cursor-pointer hover:text-green-400" onClick={() => setViewingAttachment(att)}>{att.name}</span>
                     <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white rounded-full hover:bg-white/10">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>
              ))}
           </div>
        )}
        <div className="flex items-center gap-2 bg-white/10 rounded-full p-2 pl-4 border border-white/5 focus-within:border-green-500/50 transition-colors">
          <PlanUploader onUpload={(att) => setAttachments(prev => [...prev, att])} />
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about plans, compliance, or specs..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500"
            disabled={isLoading}
          />
          
          <button 
            onClick={handleSend}
            disabled={isLoading || (!input && attachments.length === 0)}
            className={`p-2 rounded-full transition-all ${
              isLoading || (!input && attachments.length === 0)
                ? 'bg-white/5 text-gray-500' 
                : 'bg-tradie-green text-black hover:scale-105'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setViewingAttachment(null)}>
            <div 
                className="w-full h-full max-w-6xl bg-gray-900 rounded-xl overflow-hidden flex flex-col shadow-2xl border border-white/10" 
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-white/10">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`p-2 rounded-lg ${viewingAttachment.type === 'pdf' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                             {viewingAttachment.type === 'pdf' ? (
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                     <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
                                     <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                                 </svg>
                             ) : (
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                     <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                                 </svg>
                             )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white font-medium truncate max-w-[150px] sm:max-w-md">{viewingAttachment.name}</span>
                            <a href={viewingAttachment.url} download={viewingAttachment.name} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                <span>Download Original</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                </svg>
                            </a>
                        </div>
                    </div>
                    <button 
                        onClick={() => setViewingAttachment(null)} 
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                {/* Modal Body */}
                <div className="flex-1 bg-zinc-950 flex items-center justify-center p-1 relative overflow-hidden">
                    {viewingAttachment.type === 'pdf' ? (
                         <object
                             data={viewingAttachment.url}
                             type="application/pdf"
                             className="w-full h-full rounded bg-white"
                         >
                             <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-gray-400 gap-6 p-6 text-center">
                                 <div className="p-4 bg-white/5 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-50">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                    </svg>
                                 </div>
                                 <div>
                                    <p className="text-lg font-medium text-white mb-2">Preview Not Available</p>
                                    <p className="text-sm max-w-xs mx-auto mb-6">This browser doesn't support inline PDF viewing. You can download the file to view it.</p>
                                    <a 
                                        href={viewingAttachment.url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-green-500/10 border border-green-500/50 text-green-400 rounded-lg font-medium hover:bg-green-500/20 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                        </svg>
                                        Open PDF in New Tab
                                    </a>
                                 </div>
                             </div>
                         </object>
                    ) : (
                        <img 
                            src={viewingAttachment.url} 
                            alt="Preview" 
                            className="max-w-full max-h-full object-contain rounded"
                        />
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
