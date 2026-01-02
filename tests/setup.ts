/**
 * Vitest Test Setup
 * Configures testing environment with jsdom and testing-library matchers
 */

import '@testing-library/jest-dom';

// Mock AudioContext for audio-related tests
class MockAudioContext {
  currentTime = 0;
  state = 'running';
  
  createBufferSource() {
    return {
      buffer: null,
      connect: () => {},
      start: () => {},
      stop: () => {},
      playbackRate: { value: 1, setTargetAtTime: () => {} },
      onended: null,
    };
  }
  
  createAnalyser() {
    return {
      fftSize: 64,
      frequencyBinCount: 32,
      connect: () => {},
      getByteFrequencyData: () => {},
    };
  }
  
  createGain() {
    return {
      gain: { value: 1, setTargetAtTime: () => {} },
      connect: () => {},
    };
  }
  
  decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({
      duration: 60,
      length: 2646000,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(2646000),
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as AudioBuffer);
  }
  
  resume() {
    return Promise.resolve();
  }
  
  suspend() {
    return Promise.resolve();
  }
}

// @ts-ignore
global.AudioContext = MockAudioContext;
// @ts-ignore
global.webkitAudioContext = MockAudioContext;

// Mock btoa/atob for base64 operations
if (typeof global.btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

if (typeof global.atob === 'undefined') {
  global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}
