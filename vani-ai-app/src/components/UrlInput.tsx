import React, { useState } from 'react';
import { Globe, Clipboard } from 'lucide-react';
import { MovingBorder } from './MovingBorder';

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  hasError?: boolean;
  showMovingBorder?: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  onFocus,
  onBlur,
  placeholder = "Paste a Wikipedia link or any article URL...",
  autoFocus = false,
  hasError = false,
  showMovingBorder = true,
}) => {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch (e) {
      console.error("Failed to paste", e);
      const fallback = prompt("Paste your URL here:");
      if (fallback) onChange(fallback);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit(value);
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  const inputContent = (
    <div className={`w-full h-full relative flex flex-col bg-[#1a1a1a] backdrop-blur-3xl rounded-full overflow-hidden transition-all duration-300 border ${showMovingBorder ? 'border-transparent' : 'border-white/10'} group-hover:border-white/30 group-active:border-white/30 group-focus-within:border-white/30`}>
      <div className="flex items-center p-1.5 relative z-10">
        <div className="flex-1 relative flex items-center pl-4">
          <Globe 
            size={16} 
            className={`transition-colors mr-3 ${hasError ? 'text-red-500' : 'text-neutral-500 group-focus-within:text-white/70'}`} 
          />
          <input
            type="text"
            placeholder={placeholder}
            className="w-full bg-transparent border-none py-2 focus:outline-none focus:ring-0 focus:shadow-none text-sm font-light text-white placeholder:text-white/40 tracking-tight"
            style={{ boxShadow: 'none' }}
            value={value}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
          />
        </div>
        
        <div className="flex items-center gap-1 pr-0">
          <button 
            onClick={handlePaste}
            className="p-2 text-neutral-500 hover:text-white hover:bg-white/10 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/30"
            aria-label="Paste URL from clipboard"
            title="Paste URL"
          >
            <Clipboard size={16} />
          </button>
          
          <button
            onClick={() => onSubmit(value)}
            className="flex items-center justify-center bg-lime-500 hover:bg-lime-400 text-black font-bold uppercase tracking-[0.15em] text-[9px] px-5 py-2.5 rounded-full transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-lime-500/50 focus:ring-offset-2 focus:ring-offset-[#1a1a1a]"
            aria-label="Generate podcast from URL"
            title="Generate podcast (Enter)"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );

  if (showMovingBorder) {
    return (
      <div className="relative w-full max-w-xl mx-auto group">
        <MovingBorder
          borderRadius="9999px"
          duration={5000}
          borderWidth={1.5}
          rx="9999px"
          ry="9999px"
          colors={hasError 
            ? ['#ef4444', '#ef4444'] 
            : ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.6)']
          }
          containerClassName="shadow-2xl transition-shadow duration-500 bg-white/10"
          className="bg-transparent border-none p-0 overflow-hidden"
        >
          {inputContent}
        </MovingBorder>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-xl mx-auto group">
      {inputContent}
    </div>
  );
};

export default UrlInput;
