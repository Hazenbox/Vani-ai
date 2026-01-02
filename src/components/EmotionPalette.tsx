import React from 'react';
import { Clock, Laugh, Heart } from 'lucide-react';

interface EmotionPaletteProps {
  onInsert: (marker: string) => void;
}

// Pause markers
const PAUSES = [
  { marker: '(.)', label: 'Micro', description: 'Brief pause' },
  { marker: '(pause)', label: 'Pause', description: 'Thinking pause' },
  { marker: '(mid)', label: 'Mid', description: 'Mid-sentence pause' },
  { marker: '(breath)', label: 'Breath', description: 'Inhale' },
];

// Laughter markers
const LAUGHTER = [
  { marker: '(laughs)', label: 'Laughs' },
  { marker: '(giggles)', label: 'Giggles' },
  { marker: '(chuckles)', label: 'Chuckles' },
];

// Emotion markers
const EMOTIONS = [
  { marker: '(surprised)', label: 'Surprised' },
  { marker: '(excited)', label: 'Excited' },
  { marker: '(confused)', label: 'Confused' },
  { marker: '(skeptical)', label: 'Skeptical' },
  { marker: '(serious)', label: 'Serious' },
  { marker: '(thinking)', label: 'Thinking' },
  { marker: '(sighs)', label: 'Sighs' },
  { marker: '(happy)', label: 'Happy' },
  { marker: '(impressed)', label: 'Impressed' },
  { marker: '(sad)', label: 'Sad' },
  { marker: '(curious)', label: 'Curious' },
];

const ChipButton: React.FC<{
  marker: string;
  label: string;
  onClick: () => void;
}> = ({ marker, label, onClick }) => (
  <button
    onClick={onClick}
    className="px-2 py-1 text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] rounded-full text-white/50 hover:text-white/80 whitespace-nowrap"
    title={`Insert ${marker}`}
  >
    {label}
  </button>
);

export const EmotionPalette: React.FC<EmotionPaletteProps> = ({
  onInsert,
}) => {
  return (
    <div className="flex flex-col">
      {/* Help text */}
      <div className="mb-3 pb-3">
        <p className="text-[10px] leading-relaxed text-white/30">
          Edit script by clicking markers to insert pauses and emotions at the cursor position. These add natural rhythm to the speech.
        </p>
      </div>

      {/* Markers section */}
      <div className="space-y-4">
        {/* Pauses Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} className="text-white/60" />
            <span className="text-[11px] font-medium text-white/70">
              Pauses
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PAUSES.map((pause) => (
              <ChipButton
                key={pause.marker}
                marker={pause.marker}
                label={pause.label}
                onClick={() => onInsert(pause.marker)}
              />
            ))}
          </div>
        </div>

        {/* Laughter Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Laugh size={12} className="text-white/60" />
            <span className="text-[11px] font-medium text-white/70">
              Laughter
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LAUGHTER.map((item) => (
              <ChipButton
                key={item.marker}
                marker={item.marker}
                label={item.label}
                onClick={() => onInsert(item.marker)}
              />
            ))}
          </div>
        </div>

        {/* Emotions Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Heart size={12} className="text-white/60" />
            <span className="text-[11px] font-medium text-white/70">
              Emotions
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EMOTIONS.map((emotion) => (
              <ChipButton
                key={emotion.marker}
                marker={emotion.marker}
                label={emotion.label}
                onClick={() => onInsert(emotion.marker)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmotionPalette;
