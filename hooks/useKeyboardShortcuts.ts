import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (delta: number) => void;
  onMuteToggle: () => void;
  onReset: () => void;
  onEscape: () => void;
  currentTime: number;
  duration: number;
  volume: number;
  enabled: boolean;
}

export const useKeyboardShortcuts = ({
  isPlaying,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onReset,
  onEscape,
  currentTime,
  duration,
  volume,
  enabled
}: KeyboardShortcutsProps) => {
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only allow Escape in input fields
      if (e.key !== 'Escape') return;
    }

    if (!enabled) return;

    switch (e.key) {
      case ' ':
        // Space: Play/Pause
        e.preventDefault();
        onTogglePlay();
        break;
      
      case 'ArrowLeft':
        // Seek backward 5 seconds
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 5));
        break;
      
      case 'ArrowRight':
        // Seek forward 5 seconds
        e.preventDefault();
        onSeek(Math.min(duration, currentTime + 5));
        break;
      
      case 'ArrowUp':
        // Volume up 10%
        e.preventDefault();
        onVolumeChange(Math.min(1, volume + 0.1));
        break;
      
      case 'ArrowDown':
        // Volume down 10%
        e.preventDefault();
        onVolumeChange(Math.max(0, volume - 0.1));
        break;
      
      case 'm':
      case 'M':
        // Mute/Unmute
        e.preventDefault();
        onMuteToggle();
        break;
      
      case 'r':
      case 'R':
        // Reset (only if not in input)
        if (target.tagName !== 'INPUT') {
          e.preventDefault();
          onReset();
        }
        break;
      
      case 'Escape':
        // Close overlays, go back
        e.preventDefault();
        onEscape();
        break;
      
      case 'j':
      case 'J':
        // Seek backward 10 seconds (YouTube style)
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 10));
        break;
      
      case 'l':
      case 'L':
        // Seek forward 10 seconds (YouTube style)
        e.preventDefault();
        onSeek(Math.min(duration, currentTime + 10));
        break;
      
      case 'k':
      case 'K':
        // Play/Pause (YouTube style)
        e.preventDefault();
        onTogglePlay();
        break;
      
      case '0':
      case 'Home':
        // Go to start
        e.preventDefault();
        onSeek(0);
        break;
      
      case 'End':
        // Go to end
        e.preventDefault();
        onSeek(duration);
        break;
    }
  }, [enabled, isPlaying, onTogglePlay, onSeek, onVolumeChange, onMuteToggle, onReset, onEscape, currentTime, duration, volume]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

// Keyboard shortcuts reference for UI display
export const KEYBOARD_SHORTCUTS = [
  { key: 'Space / K', action: 'Play / Pause' },
  { key: '← / J', action: 'Rewind 5s / 10s' },
  { key: '→ / L', action: 'Forward 5s / 10s' },
  { key: '↑ / ↓', action: 'Volume Up / Down' },
  { key: 'M', action: 'Mute / Unmute' },
  { key: 'R', action: 'Reset' },
  { key: 'Esc', action: 'Go Back' },
  { key: '0 / Home', action: 'Go to Start' },
  { key: '⌘Z / Ctrl+Z', action: 'Undo' },
  { key: '⌘⇧Z / Ctrl+Y', action: 'Redo' },
];
