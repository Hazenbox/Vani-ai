import React, { useRef, useEffect } from 'react';

interface WaveformBackgroundProps {
  verticalPosition?: number; // 0-1, where 0.5 is center
}

const WaveformBackground: React.FC<WaveformBackgroundProps> = ({ verticalPosition = 0.5 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | undefined>(undefined);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    // The blue/cyan color palette
    const primaryColor = '#00D0FF';

    // Multi-layered ribbon configuration for organic depth
    const layers = [
      { amplitude: 30, frequency: 0.003, speed: 0.008, opacity: 0.12, color: '#0044FF', width: 1.2 },
      { amplitude: 50, frequency: 0.005, speed: 0.006, opacity: 0.25, color: primaryColor, width: 1.8 },
      { amplitude: 40, frequency: 0.008, speed: 0.012, opacity: 0.20, color: '#22FFCC', width: 1.2 },
      { amplitude: 20, frequency: 0.010, speed: 0.015, opacity: 0.08, color: '#00FFFF', width: 0.8 },
      { amplitude: 60, frequency: 0.004, speed: 0.005, opacity: 0.15, color: '#0088FF', width: 2.5 },
      { amplitude: 35, frequency: 0.006, speed: 0.010, opacity: 0.22, color: '#44FFEE', width: 1.4 },
      { amplitude: 45, frequency: 0.009, speed: 0.014, opacity: 0.12, color: primaryColor, width: 0.6 },
      { amplitude: 25, frequency: 0.003, speed: 0.007, opacity: 0.10, color: '#0066AA', width: 2.0 },
      { amplitude: 15, frequency: 0.012, speed: 0.018, opacity: 0.06, color: '#88FFFF', width: 0.8 },
      { amplitude: 65, frequency: 0.002, speed: 0.004, opacity: 0.14, color: '#0055FF', width: 3.0 },
    ];

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timeRef.current += 0.5;

      // Base scale for the background animation to stay subtle and constant
      const baseScale = 1.0;

      layers.forEach((layer, layerIdx) => {
        ctx.beginPath();
        ctx.lineWidth = layer.width;
        ctx.strokeStyle = layer.color;
        
        ctx.globalAlpha = layer.opacity;
        
        // Soft glow for key layers
        if (layerIdx === 1 || layerIdx === 5 || layerIdx === 9) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = layer.color;
        } else {
          ctx.shadowBlur = 0;
        }

        const centerY = canvas.height * verticalPosition;
        const width = canvas.width;

        for (let x = 0; x <= width; x += 4) {
          const normalizedX = x / width;
          // Taper edges for a localized look in the center
          const tapering = Math.pow(Math.sin(normalizedX * Math.PI), 2.8);
          
          // Sine wave synthesis
          let yOffset = Math.sin(x * layer.frequency + timeRef.current * layer.speed) * layer.amplitude;
          
          // Secondary slow harmonic for natural weight shifting
          yOffset += Math.sin(x * layer.frequency * 0.5 - timeRef.current * layer.speed * 0.3) * (layer.amplitude * 0.25);
          
          // Subtle high-frequency detail for texture
          yOffset += Math.sin(x * 0.02 + timeRef.current * 0.02) * 1;

          const currentY = centerY + (yOffset * tapering * baseScale);

          if (x === 0) {
            ctx.moveTo(x, currentY);
          } else {
            ctx.lineTo(x, currentY);
          }
        }
        ctx.stroke();
      });

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
    />
  );
};

export default WaveformBackground;
