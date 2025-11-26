import React, { useRef } from 'react';
import { Attachment } from '../types';

interface PlanUploaderProps {
  onUpload: (attachment: Attachment) => void;
  className?: string;
  minimal?: boolean;
}

const PlanUploader: React.FC<PlanUploaderProps> = ({ onUpload, className = "", minimal = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      const attachment: Attachment = {
        type: file.type.includes('pdf') ? 'pdf' : 'image',
        url: URL.createObjectURL(file), // For preview
        base64: base64String,
        mimeType: file.type,
        name: file.name
      };
      onUpload(attachment);
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="group flex flex-col items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
        title="Upload Plan"
      >
        <div className="p-3 bg-transparent rounded-2xl border border-transparent group-hover:bg-white/5 group-hover:border-white/5 transition-all relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-green-500/0 group-hover:bg-green-500/5 rounded-2xl transition-colors" />
            
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
        </div>
        <span className="text-[10px] font-medium tracking-wide group-hover:text-green-400 transition-colors">Upload</span>
      </button>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*,application/pdf" 
        className="hidden" 
      />
    </div>
  );
};

export default PlanUploader;