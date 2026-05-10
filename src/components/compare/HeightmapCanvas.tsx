'use client';

import React, { useRef, useEffect, useCallback } from 'react';

export interface HeightmapCanvasProps {
  /** Width of the heightmap grid */
  width: number;
  /** Height of the heightmap grid */
  height: number;
  /** Flat array of height values (row-major) */
  data: Float32Array;
  /** Canvas display width in pixels */
  displayWidth?: number;
  /** Canvas display height in pixels */
  displayHeight?: number;
  /** Color scheme for the heightmap */
  colorScheme?: 'terrain' | 'grayscale' | 'heat' | 'ocean';
  /** Sea level threshold (0-1), values below get water coloring */
  seaLevel?: number;
  /** Optional class name */
  className?: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function getColorTerrain(value: number, seaLevel: number): [number, number, number] {
  if (value < seaLevel * 0.6) return [15, 30, 80]; // Deep water
  if (value < seaLevel * 0.85) return [25, 55, 120]; // Mid water
  if (value < seaLevel) return [40, 80, 150]; // Shallow water
  if (value < seaLevel + 0.02) return [194, 178, 128]; // Sand/beach
  if (value < seaLevel + 0.15) return [34, 120, 34]; // Low vegetation
  if (value < seaLevel + 0.3) return [22, 90, 22]; // Forest
  if (value < seaLevel + 0.5) return [80, 70, 50]; // Rock
  if (value < seaLevel + 0.7) return [110, 100, 85]; // High rock
  return [240, 240, 250]; // Snow
}

function getColorHeat(value: number): [number, number, number] {
  if (value < 0.25) return [0, 0, Math.floor(lerp(80, 255, value * 4))];
  if (value < 0.5) return [0, Math.floor(lerp(0, 255, (value - 0.25) * 4)), 255];
  if (value < 0.75) return [Math.floor(lerp(0, 255, (value - 0.5) * 4)), 255, Math.floor(lerp(255, 0, (value - 0.5) * 4))];
  return [255, Math.floor(lerp(255, 0, (value - 0.75) * 4)), 0];
}

function getColorOcean(value: number, seaLevel: number): [number, number, number] {
  if (value < seaLevel) {
    const t = value / seaLevel;
    return [Math.floor(lerp(5, 30, t)), Math.floor(lerp(15, 70, t)), Math.floor(lerp(60, 160, t))];
  }
  const t = (value - seaLevel) / (1 - seaLevel);
  return [Math.floor(lerp(60, 200, t)), Math.floor(lerp(70, 190, t)), Math.floor(lerp(60, 170, t))];
}

function getGrayscale(value: number): [number, number, number] {
  const v = Math.floor(value * 255);
  return [v, v, v];
}

export default function HeightmapCanvas({
  width,
  height: gridHeight,
  data,
  displayWidth = 256,
  displayHeight = 256,
  colorScheme = 'terrain',
  seaLevel = 0.3,
  className = '',
}: HeightmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderHeightmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min || 1;

    const imageData = ctx.createImageData(displayWidth, displayHeight);
    const pixels = imageData.data;

    for (let y = 0; y < displayHeight; y++) {
      for (let x = 0; x < displayWidth; x++) {
        // Sample from the grid data using nearest-neighbor
        const gx = Math.floor((x / displayWidth) * width);
        const gy = Math.floor((y / displayHeight) * gridHeight);
        const idx = Math.min(gy * width + gx, data.length - 1);
        const value = (data[idx] - min) / range;

        let r: number, g: number, b: number;
        switch (colorScheme) {
          case 'terrain':
            [r, g, b] = getColorTerrain(value, seaLevel);
            break;
          case 'heat':
            [r, g, b] = getColorHeat(value);
            break;
          case 'ocean':
            [r, g, b] = getColorOcean(value, seaLevel);
            break;
          case 'grayscale':
          default:
            [r, g, b] = getGrayscale(value);
            break;
        }

        const px = (y * displayWidth + x) * 4;
        pixels[px] = r;
        pixels[px + 1] = g;
        pixels[px + 2] = b;
        pixels[px + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [data, width, gridHeight, displayWidth, displayHeight, colorScheme, seaLevel]);

  useEffect(() => {
    renderHeightmap();
  }, [renderHeightmap]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded-lg border border-gray-700 ${className}`}
      style={{ width: displayWidth, height: displayHeight, imageRendering: 'pixelated' }}
    />
  );
}
