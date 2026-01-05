/**
 * Unit Tests for useKeyboardShortcuts hook
 * 
 * Tests keyboard event handling for:
 * - Play/Pause controls
 * - Seek operations
 * - Volume controls
 * - Navigation shortcuts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '../../src/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  // Mock callback functions
  const mockCallbacks = {
    onTogglePlay: vi.fn(),
    onSeek: vi.fn(),
    onVolumeChange: vi.fn(),
    onMuteToggle: vi.fn(),
    onReset: vi.fn(),
    onEscape: vi.fn(),
  };

  const defaultProps = {
    isPlaying: false,
    currentTime: 30,
    duration: 120,
    volume: 0.5,
    enabled: true,
    ...mockCallbacks,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to simulate keyboard events
  const simulateKeyDown = (key: string, options: Partial<KeyboardEvent> = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    window.dispatchEvent(event);
  };

  describe('Play/Pause controls', () => {
    it('should toggle play on Space key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown(' ');
      
      expect(mockCallbacks.onTogglePlay).toHaveBeenCalledTimes(1);
    });

    it('should toggle play on K key (YouTube style)', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('k');
      
      expect(mockCallbacks.onTogglePlay).toHaveBeenCalledTimes(1);
    });

    it('should toggle play on K key (uppercase)', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('K');
      
      expect(mockCallbacks.onTogglePlay).toHaveBeenCalledTimes(1);
    });
  });

  describe('Seek controls', () => {
    it('should seek backward 5s on ArrowLeft', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, currentTime: 30 }));
      
      simulateKeyDown('ArrowLeft');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(25); // 30 - 5
    });

    it('should seek forward 5s on ArrowRight', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, currentTime: 30, duration: 120 }));
      
      simulateKeyDown('ArrowRight');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(35); // 30 + 5
    });

    it('should seek backward 10s on J key', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, currentTime: 30 }));
      
      simulateKeyDown('j');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(20); // 30 - 10
    });

    it('should seek forward 10s on L key', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, currentTime: 30, duration: 120 }));
      
      simulateKeyDown('l');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(40); // 30 + 10
    });

    it('should not seek before 0', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, currentTime: 3 }));
      
      simulateKeyDown('j'); // Try to seek -10
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(0);
    });

    it('should not seek past duration', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, currentTime: 115, duration: 120 }));
      
      simulateKeyDown('l'); // Try to seek +10
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(120);
    });

    it('should go to start on 0 key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('0');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(0);
    });

    it('should go to start on Home key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('Home');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(0);
    });

    it('should go to end on End key', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, duration: 120 }));
      
      simulateKeyDown('End');
      
      expect(mockCallbacks.onSeek).toHaveBeenCalledWith(120);
    });
  });

  describe('Volume controls', () => {
    it('should increase volume on ArrowUp', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, volume: 0.5 }));
      
      simulateKeyDown('ArrowUp');
      
      expect(mockCallbacks.onVolumeChange).toHaveBeenCalledWith(0.6); // 0.5 + 0.1
    });

    it('should decrease volume on ArrowDown', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, volume: 0.5 }));
      
      simulateKeyDown('ArrowDown');
      
      expect(mockCallbacks.onVolumeChange).toHaveBeenCalledWith(0.4); // 0.5 - 0.1
    });

    it('should not exceed volume 1', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, volume: 0.95 }));
      
      simulateKeyDown('ArrowUp');
      
      expect(mockCallbacks.onVolumeChange).toHaveBeenCalledWith(1);
    });

    it('should not go below volume 0', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, volume: 0.05 }));
      
      simulateKeyDown('ArrowDown');
      
      expect(mockCallbacks.onVolumeChange).toHaveBeenCalledWith(0);
    });

    it('should toggle mute on M key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('m');
      
      expect(mockCallbacks.onMuteToggle).toHaveBeenCalledTimes(1);
    });

    it('should toggle mute on M key (uppercase)', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('M');
      
      expect(mockCallbacks.onMuteToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation controls', () => {
    it('should call onEscape on Escape key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('Escape');
      
      expect(mockCallbacks.onEscape).toHaveBeenCalledTimes(1);
    });

    it('should call onReset on R key', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('r');
      
      expect(mockCallbacks.onReset).toHaveBeenCalledTimes(1);
    });

    it('should call onReset on R key (uppercase)', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      
      simulateKeyDown('R');
      
      expect(mockCallbacks.onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disabled state', () => {
    it('should not respond to keys when disabled', () => {
      renderHook(() => useKeyboardShortcuts({ ...defaultProps, enabled: false }));
      
      simulateKeyDown(' ');
      simulateKeyDown('ArrowLeft');
      simulateKeyDown('m');
      
      expect(mockCallbacks.onTogglePlay).not.toHaveBeenCalled();
      expect(mockCallbacks.onSeek).not.toHaveBeenCalled();
      expect(mockCallbacks.onMuteToggle).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      const { unmount } = renderHook(() => useKeyboardShortcuts(defaultProps));
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      
      removeEventListenerSpy.mockRestore();
    });
  });
});

describe('KEYBOARD_SHORTCUTS constant', () => {
  it('should have all required shortcut entries', () => {
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);
    
    KEYBOARD_SHORTCUTS.forEach(shortcut => {
      expect(shortcut).toHaveProperty('key');
      expect(shortcut).toHaveProperty('action');
      expect(shortcut.key.length).toBeGreaterThan(0);
      expect(shortcut.action.length).toBeGreaterThan(0);
    });
  });

  it('should include play/pause shortcut', () => {
    const playShortcut = KEYBOARD_SHORTCUTS.find(s => 
      s.action.toLowerCase().includes('play') || s.action.toLowerCase().includes('pause')
    );
    expect(playShortcut).toBeDefined();
  });

  it('should include volume shortcuts', () => {
    const volumeShortcut = KEYBOARD_SHORTCUTS.find(s => 
      s.action.toLowerCase().includes('volume')
    );
    expect(volumeShortcut).toBeDefined();
  });

  it('should include mute shortcut', () => {
    const muteShortcut = KEYBOARD_SHORTCUTS.find(s => 
      s.action.toLowerCase().includes('mute')
    );
    expect(muteShortcut).toBeDefined();
  });

  it('should include seek shortcuts', () => {
    const seekShortcut = KEYBOARD_SHORTCUTS.find(s => 
      s.action.toLowerCase().includes('forward') || s.action.toLowerCase().includes('rewind')
    );
    expect(seekShortcut).toBeDefined();
  });
});
