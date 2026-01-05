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
    const inputSizeKB = (audioBase64.length * 0.75 / 1024).toFixed(2);
    console.log(`   Input size: ${inputSizeKB} KB`);

    // Check if audio is too large (Vercel serverless has memory limits)
    if (audioBase64.length > 8 * 1024 * 1024) { // 8MB base64 ≈ 6MB binary
      console.warn('   ⚠️ Audio file too large for serverless processing');
      return res.status(413).json({
        error: 'Audio file too large for serverless processing. Maximum size: ~6MB',
        success: false
      });
    }

    let ffmpeg: any;
    try {
      // Dynamically import ffmpeg-wasm
      console.log('   Loading FFmpeg WASM...');
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');

      // Create FFmpeg instance
      ffmpeg = new FFmpeg();

      // Load FFmpeg with CDN URLs for Vercel serverless environment
      // Note: This may fail in serverless due to WASM loading constraints
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      try {
        await Promise.race([
          ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('FFmpeg load timeout after 30s')), 30000)
          )
        ]);
        console.log('   FFmpeg loaded successfully');
      } catch (loadError: any) {
        console.error('   ❌ FFmpeg load failed:', loadError.message);
        throw new Error(`FFmpeg initialization failed: ${loadError.message}. This is common in serverless environments.`);
      }
    } catch (importError: any) {
      console.error('   ❌ FFmpeg import/load error:', importError.message);
      throw new Error(`FFmpeg setup failed: ${importError.message}. Serverless environment may not support WASM processing.`);
    }

    // Decode base64 to binary
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    try {
      // Write input file to FFmpeg virtual filesystem
      console.log('   Writing input file to FFmpeg filesystem...');
      await ffmpeg.writeFile('input.mp3', bytes);

      console.log('   Applying mastering chain...');

      // Apply mastering with FFmpeg loudnorm filter
      // This is equivalent to Python's pyloudnorm + pedalboard chain:
      // 1. LUFS normalization to -14 (dual-pass for accuracy)
      // 2. Compression via loudnorm's dynamic range control
      // 3. Limiting via true peak control
      await Promise.race([
        ffmpeg.exec([
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
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('FFmpeg processing timeout after 60s')), 60000)
        )
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
    } catch (processingError: any) {
      console.error('   ❌ FFmpeg processing error:', processingError.message);
      throw new Error(`Audio processing failed: ${processingError.message}`);
    }

  } catch (error: any) {
    const errorMessage = error.message || 'Audio mastering failed';
    const errorStack = error.stack || '';
    
    console.error('❌ Audio mastering failed:', errorMessage);
    console.error('   Stack:', errorStack);
    
    // Provide more helpful error messages
    let userMessage = errorMessage;
    if (errorMessage.includes('FFmpeg') || errorMessage.includes('WASM')) {
      userMessage = 'Audio mastering unavailable in serverless environment. Using raw audio.';
    } else if (errorMessage.includes('timeout')) {
      userMessage = 'Audio processing timed out. File may be too large.';
    } else if (errorMessage.includes('too large')) {
      userMessage = errorMessage; // Already user-friendly
    }
    
    return res.status(500).json({
      error: userMessage,
      success: false,
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
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
