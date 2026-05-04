'use client';

/**
 * PathTracerAdapter — Dual-Mode Rendering Adapter Component
 *
 * Wraps scene content for both rasterized and path-traced rendering pipelines.
 * In rasterize mode: renders children directly in standard R3F Canvas
 * In pathtrace mode: wraps children with Pathtracer from @react-three/gpu-pathtracer
 * In hybrid mode: rasterize during interaction, auto-switch to pathtrace on idle
 *
 * Phase 0 — P0.2: PathTracerAdapter Component
 *
 * @module rendering
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRenderingMode, type RenderingMode } from './RenderingModeContext';
import { globalInstanceExpander } from './InstanceExpander';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathTracerAdapterProps {
  children: React.ReactNode;
  /** Maximum light bounces (default: 8) */
  bounces?: number;
  /** Additional bounces for transmissive surfaces (default: 10) */
  transmissiveBounces?: number;
  /** Tiles for progressive rendering (default: [3, 3]) */
  tiles?: [number, number];
  /** Minimum samples before displaying (default: 1) */
  minSamples?: number;
  /** Filter glossy factor to reduce fireflies (default: 0.1) */
  filterGlossyFactor?: number;
  /** Enable multiple importance sampling (default: true) */
  multipleImportanceSampling?: boolean;
  /** Whether to auto-expand InstancedMesh for path tracing (default: true) */
  autoExpandInstances?: boolean;
  /** Callback when path tracer convergence updates */
  onConvergenceUpdate?: (samples: number, convergence: number) => void;
}

// ---------------------------------------------------------------------------
// Lazy-loaded path tracer (to avoid SSR issues)
// ---------------------------------------------------------------------------

let WebGLPathTracerClass: any = null;
let pathTracerLoadAttempted = false;

async function loadPathTracer(): Promise<any> {
  if (WebGLPathTracerClass) return WebGLPathTracerClass;
  if (pathTracerLoadAttempted) return null;

  pathTracerLoadAttempted = true;
  try {
    const module = await import('three-gpu-pathtracer');
    WebGLPathTracerClass = module.WebGLPathTracer;
    return WebGLPathTracerClass;
  } catch (err) {
    console.warn('[PathTracerAdapter] Failed to load three-gpu-pathtracer:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Path Tracer Renderer (imperative class, not a React component)
// ---------------------------------------------------------------------------

class PathTracerRenderer {
  private pathTracer: any = null;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private isSetup = false;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  async setup(options: {
    bounces?: number;
    transmissiveBounces?: number;
    tiles?: [number, number];
    minSamples?: number;
    filterGlossyFactor?: number;
    multipleImportanceSampling?: boolean;
    renderScale?: number;
  }): Promise<boolean> {
    if (this.disposed) return false;

    const PathTracer = await loadPathTracer();
    if (!PathTracer) {
      console.warn('[PathTracerRenderer] Path tracer module not available');
      return false;
    }

    try {
      this.pathTracer = new PathTracer(this.renderer);

      // Configure path tracer
      this.pathTracer.bounces = options.bounces ?? 8;
      this.pathTracer.transmissiveBounces = options.transmissiveBounces ?? 10;
      this.pathTracer.filterGlossyFactor = options.filterGlossyFactor ?? 0.1;
      this.pathTracer.multipleImportanceSampling = options.multipleImportanceSampling ?? true;
      this.pathTracer.minSamples = options.minSamples ?? 1;
      this.pathTracer.renderScale = options.renderScale ?? 1.0;
      this.pathTracer.tiles.set(options.tiles?.[0] ?? 3, options.tiles?.[1] ?? 3);

      // Set up scene
      this.pathTracer.setScene(this.scene, this.camera);
      this.isSetup = true;

      return true;
    } catch (err) {
      console.error('[PathTracerRenderer] Failed to setup path tracer:', err);
      return false;
    }
  }

  renderSample(): number {
    if (!this.pathTracer || !this.isSetup || this.disposed) return 0;
    try {
      this.pathTracer.renderSample();
      return this.pathTracer.samples ?? 0;
    } catch (err) {
      // Silently fall back - renderSample may fail before first setup
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] renderSample fallback:', err);
      return 0;
    }
  }

  reset(): void {
    if (!this.pathTracer || !this.isSetup) return;
    try {
      this.pathTracer.reset();
    } catch (err) {
      // Silently fall back - reset may fail if pathTracer is in bad state
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] reset fallback:', err);
    }
  }

  updateCamera(): void {
    if (!this.pathTracer || !this.isSetup) return;
    try {
      this.pathTracer.setCamera(this.camera);
    } catch (err) {
      // Silently fall back - camera update may not be supported in all versions
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] updateCamera fallback:', err);
    }
  }

  updateMaterials(): void {
    if (!this.pathTracer || !this.isSetup) return;
    try {
      this.pathTracer.updateMaterials();
    } catch (err) {
      // Silently fall back - material update may fail with unsupported materials
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] updateMaterials fallback:', err);
    }
  }

  updateLights(): void {
    if (!this.pathTracer || !this.isSetup) return;
    try {
      this.pathTracer.updateLights();
    } catch (err) {
      // Silently fall back - light update may fail with unsupported light types
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] updateLights fallback:', err);
    }
  }

  updateEnvironment(): void {
    if (!this.pathTracer || !this.isSetup) return;
    try {
      this.pathTracer.updateEnvironment();
    } catch (err) {
      // Silently fall back - environment update may fail with missing env map
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] updateEnvironment fallback:', err);
    }
  }

  get samples(): number {
    return this.pathTracer?.samples ?? 0;
  }

  get isConverged(): boolean {
    return (this.pathTracer?.samples ?? 0) >= 500;
  }

  dispose(): void {
    this.disposed = true;
    if (this.pathTracer) {
      try {
        this.pathTracer.dispose();
      } catch (err) {
        // Silently fall back - dispose may fail if resources already freed
        if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] dispose fallback:', err);
      }
      this.pathTracer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Rasterize Mode Component
// ---------------------------------------------------------------------------

function RasterizeMode({ children }: { children: React.ReactNode }) {
  // Standard R3F rendering — nothing special needed
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Path Trace Mode Component
// ---------------------------------------------------------------------------

function PathTraceMode({
  children,
  bounces,
  transmissiveBounces,
  tiles,
  minSamples,
  filterGlossyFactor,
  multipleImportanceSampling,
  autoExpandInstances,
  onConvergenceUpdate,
}: PathTracerAdapterProps) {
  const { gl, scene, camera } = useThree();
  const { convergence, updateConvergence, renderScale } = useRenderingMode();
  const ptRendererRef = useRef<PathTracerRenderer | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize path tracer
  useEffect(() => {
    const pt = new PathTracerRenderer(gl, scene, camera);

    pt.setup({
      bounces,
      transmissiveBounces,
      tiles,
      minSamples,
      filterGlossyFactor,
      multipleImportanceSampling,
      renderScale,
    }).then((success) => {
      if (success) {
        ptRendererRef.current = pt;
        setIsReady(true);
      }
    });

    return () => {
      pt.dispose();
      ptRendererRef.current = null;
      setIsReady(false);
    };
  }, [gl, scene, camera]);

  // Handle InstancedMesh expansion
  useEffect(() => {
    if (!autoExpandInstances || !isReady) return;

    // Expand InstancedMesh in the scene for path tracing
    globalInstanceExpander.expandAll(scene);
    globalInstanceExpander.swapAllInScene(scene, true);

    // Re-setup path tracer after expansion (geometry changed)
    if (ptRendererRef.current) {
      try {
        ptRendererRef.current.reset();
      } catch (err) {
        // Silently fall back - reset after instance expansion may fail
        if (process.env.NODE_ENV === 'development') console.debug('[PathTracerAdapter] reset-after-expansion fallback:', err);
      }
    }

    return () => {
      // Restore InstancedMesh when leaving path trace mode
      globalInstanceExpander.swapAllInScene(scene, false);
    };
  }, [scene, autoExpandInstances, isReady]);

  // Render loop
  useFrame(() => {
    if (!ptRendererRef.current || !isReady) return;

    const samples = ptRendererRef.current.renderSample();
    const samplesPerFrame = 1;

    updateConvergence(samples, samplesPerFrame);

    if (onConvergenceUpdate) {
      onConvergenceUpdate(samples, Math.min(samples / convergence.targetSamples, 1.0));
    }
  });

  // In path trace mode, the path tracer handles rendering itself.
  // We still need to render the children for the scene setup.
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Hybrid Mode Component
// ---------------------------------------------------------------------------

function HybridMode(props: PathTracerAdapterProps) {
  const { hybridIdleTimeout } = useRenderingMode();
  const [isIdle, setIsIdle] = useState(false);
  const lastInteractionRef = useRef(Date.now());
  const { gl } = useThree();

  // Track user interaction
  useEffect(() => {
    const handleInteraction = () => {
      lastInteractionRef.current = Date.now();
      setIsIdle(false);
    };

    window.addEventListener('pointerdown', handleInteraction);
    window.addEventListener('pointermove', handleInteraction);
    window.addEventListener('wheel', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('pointermove', handleInteraction);
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Check idle status
  useFrame(() => {
    const timeSinceInteraction = Date.now() - lastInteractionRef.current;
    const shouldPathTrace = timeSinceInteraction > hybridIdleTimeout;

    if (shouldPathTrace && !isIdle) {
      setIsIdle(true);
    } else if (!shouldPathTrace && isIdle) {
      setIsIdle(false);
    }
  });

  if (isIdle) {
    return <PathTraceMode {...props} />;
  }

  return <RasterizeMode>{props.children}</RasterizeMode>;
}

// ---------------------------------------------------------------------------
// Main Adapter Component
// ---------------------------------------------------------------------------

/**
 * PathTracerAdapter — wraps scene content for dual-mode rendering.
 *
 * Automatically selects the appropriate rendering pipeline based on
 * the current RenderingMode context value.
 */
export function PathTracerAdapter(props: PathTracerAdapterProps) {
  const { mode, pathTraceAvailable } = useRenderingMode();

  // If path tracing is not available, always use rasterize mode
  if (!pathTraceAvailable && mode !== 'rasterize') {
    console.warn('[PathTracerAdapter] Path tracing not available, using rasterize mode');
    return <RasterizeMode>{props.children}</RasterizeMode>;
  }

  switch (mode) {
    case 'pathtrace':
      return <PathTraceMode {...props} />;
    case 'hybrid':
      return <HybridMode {...props} />;
    case 'rasterize':
    default:
      return <RasterizeMode>{props.children}</RasterizeMode>;
  }
}

// ---------------------------------------------------------------------------
// Convenience hook for imperative path tracer control
// ---------------------------------------------------------------------------

/**
 * Hook to get an imperative path tracer renderer.
 * Only works when the rendering mode is 'pathtrace'.
 */
export function usePathTracerRenderer(): PathTracerRenderer | null {
  const { gl, scene, camera } = useThree();
  const { mode } = useRenderingMode();
  const ptRef = useRef<PathTracerRenderer | null>(null);

  useEffect(() => {
    if (mode !== 'pathtrace') {
      ptRef.current?.dispose();
      ptRef.current = null;
      return;
    }

    const pt = new PathTracerRenderer(gl, scene, camera);
    pt.setup({}).then(() => {
      ptRef.current = pt;
    });

    return () => {
      pt.dispose();
      ptRef.current = null;
    };
  }, [mode, gl, scene, camera]);

  return ptRef.current;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { PathTracerRenderer };
