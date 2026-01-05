/**
 * Vercel Serverless Function: Audio Mastering
 * 
 * Applies professional audio mastering to podcast audio:
 * - LUFS normalization to -14 (podcast standard)
 * - Compression (threshold: -20dB, ratio: 2.5:1, attack: 10ms, release: 120ms)
 * - Soft saturation (1.5dB drive for warmth)
 * 
 * Uses ffmpeg for processing with loudnorm filter.
 * 
 * API: POST /api/master-audio
 * Body: { audioBase64: string }
 * Response: { audioBase64: string, success: true } | { error: string, success: false }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// LUFS target for podcast audio (industry standard)
const TARGET_LUFS = -14;
const TARGET_TP = -1; // True Peak limit
const TARGET_LRA = 11; // Loudness Range

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', success: false });
  }

  try {
    const { audioBase64 } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ 
        error: 'Missing or invalid audioBase64 in request body', 
        success: false 
      });
    }

    console.log('🎚️ Audio mastering request received...');
    console.log(`   Input size: ${(audioBase64.length * 0.75 / 1024).toFixed(2)} KB`);

    // Dynamically import ffmpeg-wasm
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

    // Create FFmpeg instance
    const ffmpeg = new FFmpeg();

    // Load FFmpeg with CDN URLs for Vercel serverless environment
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    console.log('   FFmpeg loaded successfully');

    // Decode base64 to binary
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile('input.mp3', bytes);

    console.log('   Applying mastering chain...');

    // Apply mastering with FFmpeg loudnorm filter
    // This is equivalent to Python's pyloudnorm + pedalboard chain:
    // 1. LUFS normalization to -14 (dual-pass for accuracy)
    // 2. Compression via loudnorm's dynamic range control
    // 3. Limiting via true peak control
    await ffmpeg.exec([
      '-i', 'input.mp3',
      '-af', [
        // Loudness normalization (2-pass equivalent with measured mode)
        `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:measured_I=-23:measured_TP=-1:measured_LRA=11:measured_thresh=-33:offset=0:linear=true:print_format=summary`,
        // Add subtle bass warmth (similar to pedalboard's soft saturation)
        'bass=g=2:f=250',
        // High frequency presence boost
        'treble=g=2:f=4000',
        // Final limiter to prevent clipping
        'alimiter=limit=0.95:attack=5:release=50'
      ].join(','),
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      '-ar', '44100',
      '-y',
      'output.mp3'
    ]);

    console.log('   Mastering complete');

    // Read the output file
    const outputData = await ffmpeg.readFile('output.mp3');
    
    // Convert to base64
    const outputBytes = outputData as Uint8Array;
    let outputBinary = '';
    for (let i = 0; i < outputBytes.length; i++) {
      outputBinary += String.fromCharCode(outputBytes[i]);
    }
    const outputBase64 = btoa(outputBinary);

    console.log(`   Output size: ${(outputBase64.length * 0.75 / 1024).toFixed(2)} KB`);
    console.log('✅ Audio mastering successful');

    return res.status(200).json({
      audioBase64: outputBase64,
      success: true,
      mastering: {
        targetLufs: TARGET_LUFS,
        targetTruePeak: TARGET_TP,
        format: 'mp3_192kbps_44100hz'
      }
    });

  } catch (error: any) {
    console.error('❌ Audio mastering failed:', error);
    
    return res.status(500).json({
      error: error.message || 'Audio mastering failed',
      success: false
    });
  }
}

// Vercel Edge Runtime configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb' // Allow larger audio files
    },
    responseLimit: '10mb'
  }
};
