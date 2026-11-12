"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

export type AgentState = null | "thinking" | "listening" | "talking";

export interface OrbProps extends React.HTMLAttributes<HTMLDivElement> {
  colors?: [string, string];
  colorsRef?: React.RefObject<[string, string]>;
  resizeDebounce?: number;
  seed?: number;
  agentState?: AgentState;
  volumeMode?: "auto" | "manual";
  manualInput?: number;
  manualOutput?: number;
  inputVolumeRef?: React.RefObject<number>;
  outputVolumeRef?: React.RefObject<number>;
  getInputVolume?: () => number;
  getOutputVolume?: () => number;
  animated?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function splitmix32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 vUv;
void main() {
  vUv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform float uTime;
uniform float uAnimation;
uniform float uInverted;
uniform float uOffsets[7];
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uInputVolume;
uniform float uOutputVolume;
uniform float uOpacity;
uniform sampler2D uPerlinTexture;
varying vec2 vUv;

const float PI = 3.14159265358979323846;

// Draw a single oval with soft edges and calculate its gradient color
bool drawOval(vec2 polarUv, vec2 polarCenter, float a, float b, bool reverseGradient, float softness, inout vec4 colorOut) {
    vec2 p = polarUv - polarCenter;
    float oval = (p.x * p.x) / (a * a) + (p.y * p.y) / (b * b);

    float edge = smoothstep(1.0, 1.0 - softness, oval);

    if (edge > 0.0) {
        float gradient = reverseGradient ? (1.0 - (p.x / a + 1.0) / 2.0) : ((p.x / a + 1.0) / 2.0);
        gradient = mix(0.5, gradient, 0.1);
        colorOut = vec4(vec3(gradient), 0.85 * edge);
        return true;
    }
    return false;
}

// Map grayscale value to a 4-color ramp (color1, color2, color3, color4)
vec3 colorRamp(float grayscale, vec3 color1, vec3 color2, vec3 color3, vec3 color4) {
    if (grayscale < 0.33) {
        return mix(color1, color2, grayscale * 3.0);
    } else if (grayscale < 0.66) {
        return mix(color2, color3, (grayscale - 0.33) * 3.0);
    } else {
        return mix(color3, color4, (grayscale - 0.66) * 3.0);
    }
}

vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// 2D noise for the ring
float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    vec2 u = f * f * (3.0 - 2.0 * f);
    float n = mix(
        mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
    );

    return 0.5 + 0.5 * n;
}

float sharpRing(vec3 decomposed, float time) {
    float ringStart = 1.0;
    float ringWidth = 0.3;
    float noiseScale = 5.0;

    float noise = mix(
        noise2D(vec2(decomposed.x, time) * noiseScale),
        noise2D(vec2(decomposed.y, time) * noiseScale),
        decomposed.z
    );

    noise = (noise - 0.5) * 2.5;

    return ringStart + noise * ringWidth * 1.5;
}

float smoothRing(vec3 decomposed, float time) {
    float ringStart = 0.9;
    float ringWidth = 0.2;
    float noiseScale = 6.0;

    float noise = mix(
        noise2D(vec2(decomposed.x, time) * noiseScale),
        noise2D(vec2(decomposed.y, time) * noiseScale),
        decomposed.z
    );

    noise = (noise - 0.5) * 5.0;

    return ringStart + noise * ringWidth;
}

float flow(vec3 decomposed, float time) {
    return mix(
        texture2D(uPerlinTexture, vec2(time, decomposed.x / 2.0)).r,
        texture2D(uPerlinTexture, vec2(time, decomposed.y / 2.0)).r,
        decomposed.z
    );
}

void main() {
    // Normalize vUv to be centered around (0.0, 0.0)
    vec2 uv = vUv * 2.0 - 1.0;

    // Convert uv to polar coordinates
    float radius = length(uv);
    if (radius > 1.0) {
        discard;
    }

    float theta = atan(uv.y, uv.x);
    if (theta < 0.0) theta += 2.0 * PI;

    vec3 decomposed = vec3(
        theta / (2.0 * PI),
        mod(theta / (2.0 * PI) + 0.5, 1.0) + 1.0,
        abs(theta / PI - 1.0)
    );

    // Add noise to the angle for a flow-like distortion
    float noise = flow(decomposed, radius * 0.03 - uAnimation * 0.2) - 0.5;
    theta += noise * mix(0.08, 0.25, uOutputVolume);

    // Base color
    vec4 color = vec4(1.0, 1.0, 1.0, 1.0);

    // 7 animated centers in polar coordinates
    float centers[7];
    for (int i = 0; i < 7; i++) {
        float orig = float(i) * 0.5 * PI;
        centers[i] = orig + 0.5 * sin(uTime / 20.0 + uOffsets[i]);
    }

    float a, b;
    vec4 ovalColor;

    for (int i = 0; i < 7; i++) {
        float nVal = texture2D(uPerlinTexture, vec2(mod(centers[i] + uTime * 0.05, 1.0), 0.5)).r;
        a = 0.5 + nVal * 0.3;
        b = nVal * mix(3.5, 2.5, uInputVolume);
        bool reverseGradient = (mod(float(i), 2.0) > 0.5);

        float distTheta = min(
            abs(theta - centers[i]),
            min(
                abs(theta + 2.0 * PI - centers[i]),
                abs(theta - 2.0 * PI - centers[i])
            )
        );
        float distRadius = radius;
        float softness = 0.6;

        if (drawOval(vec2(distTheta, distRadius), vec2(0.0, 0.0), a, b, reverseGradient, softness, ovalColor)) {
            color.rgb = mix(color.rgb, ovalColor.rgb, ovalColor.a);
            color.a = max(color.a, ovalColor.a);
        }
    }
    
    // Calculate both noisy rings
    float ringRadius1 = sharpRing(decomposed, uTime * 0.1);
    float ringRadius2 = smoothRing(decomposed, uTime * 0.1);
    
    float inputRadius1 = radius + uInputVolume * 0.2;
    float inputRadius2 = radius + uInputVolume * 0.15;
    float opacity1 = mix(0.2, 0.6, uInputVolume);
    float opacity2 = mix(0.15, 0.45, uInputVolume);

    float ringAlpha1 = (inputRadius2 >= ringRadius1) ? opacity1 : 0.0;
    float ringAlpha2 = smoothstep(ringRadius2 - 0.05, ringRadius2 + 0.05, inputRadius1) * opacity2;
    float totalRingAlpha = max(ringAlpha1, ringAlpha2);
    
    vec3 ringColor = vec3(1.0);
    color.rgb = 1.0 - (1.0 - color.rgb) * (1.0 - ringColor * totalRingAlpha);

    vec3 color1 = vec3(0.0, 0.0, 0.0);
    vec3 color2 = uColor1;
    vec3 color3 = uColor2;
    vec3 color4 = vec3(1.0, 1.0, 1.0);

    float luminance = mix(color.r, 1.0 - color.r, uInverted);
    color.rgb = colorRamp(luminance, color1, color2, color3, color4);

    // Anti-aliased outer circular edge
    float edgeAlpha = smoothstep(1.0, 0.95, radius);
    color.a *= uOpacity * edgeAlpha;

    gl_FragColor = color;
}
`;

function OrbComponent({
  colors = ["#CADCFC", "#A0B9D1"],
  colorsRef,
  seed = 42,
  agentState = null,
  volumeMode = "auto",
  manualInput,
  manualOutput,
  inputVolumeRef,
  outputVolumeRef,
  getInputVolume,
  getOutputVolume,
  animated = true,
  className,
  ...props
}: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const colorA = colors[0] || "#CADCFC";
  const colorB = colors[1] || "#A0B9D1";

  const initialSeed = useMemo(() => seed ?? Math.floor(Math.random() * 2 ** 32), [seed]);
  const offsets = useMemo(() => {
    const random = splitmix32(initialSeed);
    return new Float32Array(Array.from({ length: 7 }, () => random() * Math.PI * 2));
  }, [initialSeed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { alpha: true, antialias: true }) ||
      (canvas.getContext("experimental-webgl", { alpha: true, antialias: true }) as WebGLRenderingContext | null);

    if (!gl) return;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Quad geometry covering viewport
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTimeLoc = gl.getUniformLocation(program, "uTime");
    const uAnimationLoc = gl.getUniformLocation(program, "uAnimation");
    const uInvertedLoc = gl.getUniformLocation(program, "uInverted");
    const uOffsetsLoc = gl.getUniformLocation(program, "uOffsets");
    const uColor1Loc = gl.getUniformLocation(program, "uColor1");
    const uColor2Loc = gl.getUniformLocation(program, "uColor2");
    const uInputVolumeLoc = gl.getUniformLocation(program, "uInputVolume");
    const uOutputVolumeLoc = gl.getUniformLocation(program, "uOutputVolume");
    const uOpacityLoc = gl.getUniformLocation(program, "uOpacity");
    const uPerlinTextureLoc = gl.getUniformLocation(program, "uPerlinTexture");

    // Load Perlin Texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Temporary 1x1 noise pixel
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));

    const img = new Image();
    let disposed = false;
    img.crossOrigin = "anonymous";
    img.src = "/images/perlin-noise.png";
    img.onload = () => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let animationFrameId: number;
    let lastTime = performance.now();
    let simTime = 0;
    let simAnimation = 0.1;
    let animSpeed = 0.1;
    let curIn = 0;
    let curOut = 0;
    let opacity = 0;

    const render = () => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || 36;
      const height = canvas.clientHeight || 36;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.useProgram(program);

      // Advance time
      if (animated) {
        simTime += delta * 0.5;
        if (opacity < 1) opacity = Math.min(1, opacity + delta * 3);
      } else {
        opacity = 1;
        simTime = 1.5;
      }

      // Audio / State Volume calculations
      let targetIn = 0;
      let targetOut = 0.3;

      if (volumeMode === "manual") {
        targetIn = clamp01(manualInput ?? inputVolumeRef?.current ?? getInputVolume?.() ?? 0);
        targetOut = clamp01(manualOutput ?? outputVolumeRef?.current ?? getOutputVolume?.() ?? 0);
      } else {
        const t = simTime * 2;
        if (agentState === null) {
          targetIn = 0.05;
          targetOut = 0.28;
        } else if (agentState === "listening") {
          targetIn = clamp01(0.55 + Math.sin(t * 3.2) * 0.35);
          targetOut = 0.45;
        } else if (agentState === "talking") {
          targetIn = clamp01(0.65 + Math.sin(t * 4.8) * 0.22);
          targetOut = clamp01(0.75 + Math.sin(t * 3.6) * 0.22);
        } else {
          // "thinking"
          const base = 0.38 + 0.07 * Math.sin(t * 0.7);
          const wander = 0.05 * Math.sin(t * 2.1) * Math.sin(t * 0.37 + 1.2);
          targetIn = clamp01(base + wander);
          targetOut = clamp01(0.48 + 0.12 * Math.sin(t * 1.05 + 0.6));
        }
      }

      curIn += (targetIn - curIn) * 0.2;
      curOut += (targetOut - curOut) * 0.2;

      const targetSpeed = 0.1 + (1 - Math.pow(curOut - 1, 2)) * 0.9;
      animSpeed += (targetSpeed - animSpeed) * 0.12;

      if (animated) {
        simAnimation += delta * animSpeed;
      }

      // Check dark mode
      const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

      // Colors
      const activeColors = colorsRef?.current || colors;
      const rgb1 = hexToRgb(activeColors[0] || "#CADCFC");
      const rgb2 = hexToRgb(activeColors[1] || "#A0B9D1");

      gl.uniform1f(uTimeLoc, simTime);
      gl.uniform1f(uAnimationLoc, simAnimation);
      gl.uniform1f(uInvertedLoc, isDark ? 1.0 : 0.0);
      gl.uniform1fv(uOffsetsLoc, offsets);
      gl.uniform3f(uColor1Loc, rgb1[0], rgb1[1], rgb1[2]);
      gl.uniform3f(uColor2Loc, rgb2[0], rgb2[1], rgb2[2]);
      gl.uniform1f(uInputVolumeLoc, curIn);
      gl.uniform1f(uOutputVolumeLoc, curOut);
      gl.uniform1f(uOpacityLoc, opacity);

      // Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uPerlinTextureLoc, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (animated) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      gl.deleteBuffer(positionBuffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
    };
  }, [
    colorA,
    colorB,
    colorsRef,
    offsets,
    agentState,
    volumeMode,
    manualInput,
    manualOutput,
    inputVolumeRef,
    outputVolumeRef,
    getInputVolume,
    getOutputVolume,
    animated,
  ]);

  return (
    <div
      className={cn(
        "orb-canvas",
        className
      )}
      {...props}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

export const Orb = React.memo(OrbComponent);
