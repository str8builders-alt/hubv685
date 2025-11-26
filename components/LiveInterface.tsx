
import React, { useEffect, useState, useRef } from 'react';
import { GeminiLiveSession, generatePlanAnalysis } from '../services/geminiService';
import Orb from './Orb';
import { Message, Attachment, UserLocation } from '../types';
import PlanUploader from './PlanUploader';

interface LiveInterfaceProps {
  onBack: () => void;
  onSwitchToChat: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  activeAttachment: Attachment | null;
  setActiveAttachment: React.Dispatch<React.SetStateAction<Attachment | null>>;
  savedAttachments: Attachment[];
  setSavedAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
}

const LiveInterface: React.FC<LiveInterfaceProps> = ({ 
  onBack, 
  onSwitchToChat, 
  setMessages,
  activeAttachment,
  setActiveAttachment,
  savedAttachments,
  setSavedAttachments
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Model is speaking
  const [status, setStatus] = useState("Tap orb to start");
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const [showSavedPlans, setShowSavedPlans] = useState(false);

  // Quick Ask State
  const [isLoading, setIsLoading] = useState(false);
  const [latestResponse, setLatestResponse] = useState<{text: string, title?: string, note?: string} | null>(null);
  const [location, setLocation] = useState<UserLocation | undefined>(undefined);

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

  const toggleSession = async () => {
    if (isActive) {
      // Disconnect
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      setIsActive(false);
      setStatus("Tap orb to start");
    } else {
      // Connect
      setStatus("Connecting...");
      
      // Inject Active Plan Context into System Instruction
      let systemInstruction = 'You are a helpful, rugged, and knowledgeable AI assistant for New Zealand tradies. Speak clearly and concisely about building plans, materials, and schedules.';
      
      if (activeAttachment && activeAttachment.analysis) {
          systemInstruction = `
            You are an expert NZ Tradie Assistant. 
            CONTEXT: The user has uploaded a plan named "${activeAttachment.name}".
            
            HERE IS THE ANALYSIS OF THE PLAN:
            ${activeAttachment.analysis}
            
            INSTRUCTIONS:
            - Answer the user's questions based on the details above.
            - If they ask about R-values, timber grades, or drainage, refer to the specific sections in the analysis.
            - Keep answers conversational and professional.
            - If the information is not in the summary, tell them you can't see that specific detail on the plan summary.
          `;
      }

      const session = new GeminiLiveSession(
        (msg) => {
          // Check if model is turning (sending audio)
           const hasAudio = !!msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
           if (hasAudio) {
               setIsSpeaking(true);
               // Simple timeout to revert visual state since we don't get 'audio end' event easily from stream without deeper audio node analysis
               setTimeout(() => setIsSpeaking(false), 2000);
           }
           if (msg.serverContent?.turnComplete) {
               setIsSpeaking(false);
           }
        },
        (err) => {
            console.error(err);
            setStatus("Connection error. Retrying...");
            setIsActive(false);
        },
        () => {
            setIsActive(false);
            setStatus("Tap orb to start");
        }
      );

      try {
        await session.connect(systemInstruction); 
        sessionRef.current = session;
        setIsActive(true);
        setStatus("Listening...");
      } catch (e) {
        setStatus("Tap to retry");
        setIsActive(false);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect();
    };
  }, []);

  // Handle uploaded plan immediately with a structured prompt
  const handleUploadedPlan = async (attachment: Attachment) => {
    setIsLoading(true);
    setLatestResponse(null);

    // Detailed prompt to ensure the model reads the plan properly
    const analysisPrompt = `
      Analyze this construction plan/document in detail for a New Zealand tradie.
      Focus on practical construction details, compliance, and estimation.
      
      Format your response with these exact headers:
      
      ## 📋 Scope of Work
      (Brief description of what is being built)
      
      ## 🏗️ Key Specifications & Materials
      (List specific materials found, including timber grades, concrete strengths, steel specs)
      
      ## 🧱 Estimated Quantities
      (Provide a rough estimation of key material quantities if discernible, e.g., stud counts, floor area, concrete volume. If not explicit, state "Not specified but likely includes...")
      
      ## 🌡️ Insulation & Efficiency
      (Look for R-values for walls, ceilings, floors, and glazing specifications)
      
      ## 💧 Drainage & Plumbing
      (Identify drainage requirements, pipe grades, wastewater/stormwater details)
      
      ## ✅ NZBC Compliance Check
      (Identify relevant NZS 3604 clauses, bracing elements, or specific compliance notes)
      
      ## ⚠️ Safety Notes
      (Specific hazards like height, excavation, asbestos potential)
      
      Keep the content practical, concise, and professional.
    `;

    try {
        // 1. Call API First to get the analysis string
        const response = await generatePlanAnalysis(analysisPrompt, [attachment], location);
        const responseText = response.text || "I analyzed the plan but couldn't generate a text description.";

        // 2. Create New Attachment Object WITH Analysis
        const newAtt: Attachment = { 
            ...attachment, 
            id: Date.now().toString(), 
            date: new Date(),
            analysis: responseText // SAVE ANALYSIS HERE
        };

        // 3. Update State
        setActiveAttachment(newAtt);
        setSavedAttachments(prev => {
            // Remove duplicates by name if necessary, or just add
            const filtered = prev.filter(p => p.name !== newAtt.name);
            return [newAtt, ...filtered];
        });

        // 4. Add User Message to History
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: "Uploaded a plan for analysis",
            timestamp: new Date(),
            attachments: [newAtt]
        };
        setMessages(prev => [...prev, userMsg]);

        // 5. Add Model Response to History
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            text: responseText,
            timestamp: new Date(),
            groundingMetadata: response.candidates?.[0]?.groundingMetadata
        }]);

        // 6. Show Local Result Overlay with Status Cue
        setLatestResponse({
            text: responseText,
            title: "Plan Summary",
            note: "If this analysis seems incomplete, the document might be a low-quality scan. Clear digital PDFs work best."
        });

    } catch (e) {
        console.error("Plan analysis error", e);
        setLatestResponse({ text: "Error analyzing plan. Please check your connection.", title: "Error" });
        // Still save the attachment even if analysis failed, just without analysis text
        const newAtt = { ...attachment, id: Date.now().toString(), date: new Date() };
        setActiveAttachment(newAtt);
        setSavedAttachments(prev => [newAtt, ...prev]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSelectSavedPlan = (att: Attachment) => {
      setActiveAttachment(att);
      setShowSavedPlans(false);
      setLatestResponse({
          title: "Active Plan Changed",
          text: att.analysis || `Switched context to ${att.name}. No previous analysis saved.`
      });
  };

  const handleRemoveActivePlan = (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveAttachment(null);
      setShowSavedPlans(false);
  };

  const renderFormattedText = (text: string) => {
      const lines = text.split('\n');
      return lines.map((line, i) => {
          if (line.trim().startsWith('##')) {
              return (
                  <h3 key={i} className="text-green-400 font-bold text-sm mt-4 mb-2 uppercase tracking-wide border-b border-green-500/20 pb-1">
                      {line.replace(/#/g, '').trim()}
                  </h3>
              );
          }
          if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
              return (
                   <li key={i} className="text-gray-300 ml-4 mb-1 list-disc text-sm">
                      {line.replace(/^[*-\s]+/, '')}
                   </li>
              );
          }
          return <p key={i} className="text-gray-300 mb-1 text-sm leading-relaxed">{line}</p>;
      });
  };

  return (
    <div className="flex flex-col h-full bg-black text-white relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-green-900/10 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 p-6 flex justify-between items-center w-full">
         
         {/* Top Left: Saved Files Access */}
         <button 
           onClick={() => setShowSavedPlans(true)}
           className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
           aria-label="View Saved Plans"
         >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
            {savedAttachments.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] text-black font-bold">
                    {savedAttachments.length}
                </span>
            )}
         </button>

         {/* Center Label */}
         <div className="absolute left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-5 py-1.5 rounded-full text-sm font-bold text-green-400 border border-white/5 shadow-lg shadow-green-900/20 tracking-wider">
            STR8BUTCHURE
         </div>
         
         {/* Right Spacer to balance layout */}
         <div className="w-8"></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 mt-[-50px]">
        
        {/* Response / Analysis Overlay */}
        {latestResponse && (
            <div className="absolute inset-x-4 top-24 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="bg-[#121212] border border-green-500/30 rounded-2xl shadow-2xl relative max-h-[60vh] flex flex-col overflow-hidden ring-1 ring-white/10">
                    <div className="flex justify-between items-center px-4 py-3 bg-white/5 border-b border-white/5">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <span className="text-sm font-bold text-gray-100 block">{latestResponse.title}</span>
                                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Analysis Complete</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <button 
                                onClick={onSwitchToChat} 
                                className="text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors border border-white/5"
                            >
                                Open Chat
                            </button>
                            <button 
                                onClick={() => setLatestResponse(null)} 
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="overflow-y-auto p-5 custom-scrollbar bg-black/40">
                        {renderFormattedText(latestResponse.text)}
                        
                        {/* Note/Visual Cue for Scanned Docs */}
                        {latestResponse.note && (
                            <div className="mt-6 p-3 rounded-lg bg-white/5 border border-white/5 flex gap-3 items-start animate-in fade-in duration-500">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[11px] text-gray-400 italic leading-relaxed">
                                    {latestResponse.note}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        <div className={`text-center mb-8 space-y-2 transition-all duration-500 ${latestResponse ? 'opacity-10 scale-95 blur-sm' : 'opacity-100'}`}>
            <h2 className="text-gray-400 text-sm tracking-widest uppercase font-medium">
                {isActive ? 'Live Session Active' : activeAttachment ? `Active: ${activeAttachment.name}` : 'I can help with code & plans'}
            </h2>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white via-gray-200 to-gray-500 bg-clip-text text-transparent px-4">
                What Can I Do for<br/>You Today?
            </h1>
        </div>

        {/* The Glowing Orb */}
        <div 
            onClick={toggleSession}
            className={`cursor-pointer transition-all duration-500 hover:scale-105 active:scale-95 ${latestResponse ? 'blur-md scale-75 opacity-50' : ''}`}
        >
            <Orb active={isActive} speaking={isSpeaking} />
        </div>

        <p className="mt-8 text-sm text-green-400 font-medium animate-pulse min-h-[20px]">
            {isLoading ? "Analyzing Plan..." : status}
        </p>

    </div>

      {/* Saved Plans Drawer */}
      {showSavedPlans && (
          <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm" onClick={() => setShowSavedPlans(false)}>
              <div 
                className="absolute left-0 top-0 bottom-0 w-3/4 max-w-sm bg-[#121212] border-r border-white/10 p-6 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300"
                onClick={e => e.stopPropagation()}
              >
                  <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 text-green-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                      Saved Plans
                  </h2>
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                      {savedAttachments.length === 0 ? (
                          <div className="text-gray-500 text-sm text-center mt-10">No plans saved yet.</div>
                      ) : (
                          savedAttachments.map((att, i) => (
                              <div key={i} className="flex gap-2">
                                <button 
                                    onClick={() => handleSelectSavedPlan(att)}
                                    className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                        activeAttachment?.id === att.id 
                                        ? 'bg-green-500/10 border-green-500/50 text-white' 
                                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                                    }`}
                                >
                                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-400">
                                            <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{att.name}</div>
                                        <div className="text-[10px] text-gray-500">
                                            {att.date ? new Date(att.date).toLocaleDateString() : 'Unknown date'}
                                        </div>
                                    </div>
                                </button>
                                {activeAttachment?.id === att.id && (
                                    <button 
                                        onClick={handleRemoveActivePlan}
                                        className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                                        title="Remove Active Plan"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Bottom Nav */}
      <div className="w-full px-8 pb-10 pt-4 flex justify-between items-end relative z-20 bg-gradient-to-t from-black via-black/95 to-transparent">
          
          {/* Left: Upload / Active Plan Indicator */}
          <div className="flex flex-col items-center gap-1 w-20">
             {activeAttachment ? (
                 <button onClick={() => setShowSavedPlans(true)} className="group flex flex-col items-center gap-1 text-gray-300 hover:text-white transition-colors relative">
                    <div className="p-3 bg-white/10 rounded-2xl border border-green-500/30 group-hover:bg-white/20 transition-all relative overflow-hidden">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-6 text-red-400">
                            <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
                         </svg>
                         {/* Green dot for active */}
                         <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_5px_#22c55e]"></div>
                    </div>
                    <span className="text-[10px] font-medium tracking-wide truncate max-w-full">{activeAttachment.name.substring(0, 8)}...</span>
                 </button>
             ) : (
                 <PlanUploader onUpload={handleUploadedPlan} className="text-gray-500 hover:text-gray-300" />
             )}
          </div>

          {/* Center: Live */}
          <button className="flex flex-col items-center gap-1 text-green-400 -mb-2">
             <div className="p-4 bg-green-500/10 rounded-full border border-green-500/30 shadow-[0_0_25px_rgba(74,222,128,0.2)] hover:scale-105 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
             </div>
             <span className="text-[10px] font-medium tracking-wide">Live</span>
          </button>

          {/* Right: Chat */}
          <div className="flex flex-col items-center gap-1 w-20">
            <button onClick={onSwitchToChat} className="group flex flex-col items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors">
                <div className="p-3 bg-transparent rounded-2xl border border-transparent group-hover:bg-white/5 group-hover:border-white/5 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                </div>
                <span className="text-[10px] font-medium tracking-wide group-hover:text-white transition-colors">Chat</span>
            </button>
          </div>
      </div>
    </div>
  );
};

export default LiveInterface;
