
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isSpeaking: boolean;
  amplitude: number;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isSpeaking, amplitude }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensityRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_intensity;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        
        vec3 colorA = vec3(0.52, 0.80, 0.09); // Lime green
        vec3 colorB = vec3(0.40, 0.70, 0.20); // Forest lime
        vec3 colorC = vec3(0.60, 0.90, 0.30); // Bright lime
        
        // Drift and speed modulated by intensity (amplitude)
        float driftSpeed = 0.2 + u_intensity * 0.5;
        float driftAmount = 0.15 + u_intensity * 0.25;
        float horizontalDrift = sin(u_time * driftSpeed) * driftAmount;
        
        vec2 driftUv = uv + vec2(horizontalDrift, 0.0);
        
        float timeScale = 0.3 + u_intensity * 2.2;
        float time = u_time * timeScale;
        
        float nScale = 0.8 + u_intensity * 1.2;
        float n1 = snoise(driftUv * 1.2 * nScale + time * 0.15) * 0.5 + 0.5;
        float n2 = snoise(driftUv * 2.2 * nScale - time * 0.25) * 0.5 + 0.5;
        
        vec3 mixedColor = mix(colorA, colorB, n1);
        mixedColor = mix(mixedColor, colorC, n2 * 0.6);
        
        // Bottom glow mask
        float bottomMask = smoothstep(0.45, -0.15, uv.y);
        
        // Intensity scaling for 'breathing' brightness
        float finalIntensity = (0.1 + u_intensity * 0.9) * bottomMask;
        
        gl_FragColor = vec4(mixedColor * finalIntensity, 1.0);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const intensityLoc = gl.getUniformLocation(program, 'u_intensity');

    let animationFrameId: number;
    let time = 0;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const render = () => {
      time += 0.01;
      
      const target = isSpeaking ? Math.max(0.05, amplitude) : 0.0;
      // Smoothly transition intensity for the breathing effect
      intensityRef.current += (target - intensityRef.current) * 0.12;

      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, time);
      gl.uniform1f(intensityLoc, intensityRef.current);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      // Sharpen the blur when speaking/higher amplitude
      const currentBlur = 90 - intensityRef.current * 50;
      canvas.style.filter = `blur(${Math.max(10, currentBlur)}px)`;

      animationFrameId = window.requestAnimationFrame(render);
    };

    render();
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isSpeaking, amplitude]);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 w-full h-full pointer-events-none z-0 transition-[filter] duration-500 ease-out"
    />
  );
};
