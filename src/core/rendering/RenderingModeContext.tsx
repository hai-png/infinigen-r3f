'use client';

/**
 * RenderingModeContext — Dual-Mode Rendering Architecture
 *
 * Provides a React context for switching between rasterized (real-time),
 * path-traced (offline quality), and hybrid rendering modes.
 *
 * Phase 0 — P0.1: RenderingMode Context
 *
 * In rasterize mode: standard R3F Canvas rendering with SSGI/SSAO
 * In pathtrace mode: GPU path tracing via three-gpu-pathtracer
 * In hybrid mode: rasterize during interaction, auto-switch to pathtrace on idle
 *
 * @module rendering
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Rendering pipeline mode */
export type RenderingMode = 'rasterize' | 'pathtrace' | 'hybrid';

/** Convergence info for path-traced rendering */
export interface ConvergenceInfo {
  /** Current number of accumulated samples */
  samples: number;
  /** Target samples for considered "converged" */
  targetSamples: number;
  /** Convergence ratio 0..1 */
  convergence: number;
  /** Whether the image is considered converged */
  isConverged: boolean;
  /** Samples rendered per frame (depends on scene complexity) */
  samplesPerFrame: number;
}

/** Rendering mode context value */
export interface RenderingModeContextValue {
  /** Current rendering mode */
  mode: RenderingMode;
  /** Set the rendering mode */
  setMode: (mode: RenderingMode) => void;
  /** Toggle between rasterize and pathtrace */
  toggleMode: () => void;
  /** Convergence info for path-traced rendering */
  convergence: ConvergenceInfo;
  /** Update convergence info (called by path tracer adapter) */
  updateConvergence: (samples: number, samplesPerFrame: number) => void;
  /** Whether path tracing is available (GPU capability) */
  pathTraceAvailable: boolean;
  /** Hybrid mode idle timeout in ms (default 3000) */
  hybridIdleTimeout: number;
  /** Set hybrid idle timeout */
  setHybridIdleTimeout: (ms: number) => void;
  /** Whether we're currently in the rasterize fallback of hybrid mode */
  isHybridRasterFallback: boolean;
  /** Render scale for path tracer (0.5 for mobile, 1.0 for desktop) */
  renderScale: number;
  /** Set render scale */
  setRenderScale: (scale: number) => void;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_CONVERGENCE: ConvergenceInfo = {
  samples: 0,
  targetSamples: 500,
  convergence: 0,
  isConverged: false,
  samplesPerFrame: 1,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RenderingModeContext = createContext<RenderingModeContextValue | null>(null);

// ---------------------------------------------------------------------------
// GPU Capability Detection
// ---------------------------------------------------------------------------

function detectPathTraceCapability(): { available: boolean; renderScale: number } {
  if (typeof window === 'undefined') {
    return { available: false, renderScale: 0.5 };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
      return { available: false, renderScale: 0.5 };
    }

    // Check for required extensions
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const extFloatBlend = gl.getExtension('EXT_float_blend');

    // Detect mobile / low-end GPU via max texture size
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);

    // Heuristic: if max texture size < 8192, likely mobile/integrated GPU
    const isMobile = maxTextureSize < 8192 || maxRenderbufferSize < 8192;

    // Also check navigator for mobile hints
    const nav = navigator as { userAgent?: string; deviceMemory?: number };
    const mobileUA = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
      nav.userAgent || ''
    );

    const isLowEnd = isMobile || mobileUA || (nav.deviceMemory !== undefined && nav.deviceMemory < 4);

    // Path tracing needs float render targets
    const available = !!(extColorBufferFloat && extFloatBlend);
    const renderScale = isLowEnd ? 0.5 : 1.0;

    // Cleanup
    canvas.remove();

    return { available, renderScale };
  } catch (err) {
    // Silently fall back - GPU capability detection may fail in restricted environments
    if (process.env.NODE_ENV === 'development') console.debug('[RenderingModeContext] detectPathTraceCapability fallback:', err);
    return { available: false, renderScale: 0.5 };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface RenderingModeProviderProps {
  children: React.ReactNode;
  /** Initial rendering mode (default: 'rasterize') */
  initialMode?: RenderingMode;
  /** Target samples for path-traced convergence (default: 500) */
  targetSamples?: number;
  /** Hybrid mode idle timeout in ms (default: 3000) */
  hybridIdleTimeout?: number;
}

export function RenderingModeProvider({
  children,
  initialMode = 'rasterize',
  targetSamples = 500,
  hybridIdleTimeout: initialIdleTimeout = 3000,
}: RenderingModeProviderProps) {
  const [mode, setModeState] = useState<RenderingMode>(initialMode);
  const [convergence, setConvergence] = useState<ConvergenceInfo>({
    ...DEFAULT_CONVERGENCE,
    targetSamples,
  });
  const [hybridIdleTimeout, setHybridIdleTimeout] = useState(initialIdleTimeout);
  const [renderScale, setRenderScale] = useState(1.0);

  const { available: pathTraceAvailable, renderScale: detectedScale } = detectPathTraceCapability();
  const isHybridRasterFallbackRef = useRef(false);
  const [, forceUpdate] = useState(0);

  // Set render scale based on GPU capability on mount
  useEffect(() => {
    setRenderScale(detectedScale);
  }, [detectedScale]);

  const setMode = useCallback((newMode: RenderingMode) => {
    // If path trace is not available, force rasterize
    if ((newMode === 'pathtrace' || newMode === 'hybrid') && !pathTraceAvailable) {
      console.warn('[RenderingMode] Path tracing not available on this GPU, falling back to rasterize');
      setModeState('rasterize');
      return;
    }
    setModeState(newMode);
    // Reset convergence when switching modes
    setConvergence(prev => ({ ...prev, samples: 0, convergence: 0, isConverged: false }));
  }, [pathTraceAvailable]);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
      if (prev === 'rasterize') {
        if (pathTraceAvailable) return 'pathtrace';
        return 'rasterize';
      }
      return 'rasterize';
    });
  }, [pathTraceAvailable]);

  const updateConvergence = useCallback((samples: number, samplesPerFrame: number) => {
    setConvergence(prev => {
      const convergence = Math.min(samples / prev.targetSamples, 1.0);
      const isConverged = samples >= prev.targetSamples;
      return { ...prev, samples, convergence, isConverged, samplesPerFrame };
    });
  }, []);

  const setRenderScaleCallback = useCallback((scale: number) => {
    setRenderScale(Math.max(0.25, Math.min(2.0, scale)));
  }, []);

  const value: RenderingModeContextValue = {
    mode,
    setMode,
    toggleMode,
    convergence,
    updateConvergence,
    pathTraceAvailable,
    hybridIdleTimeout,
    setHybridIdleTimeout,
    isHybridRasterFallback: isHybridRasterFallbackRef.current,
    renderScale,
    setRenderScale: setRenderScaleCallback,
  };

  return (
    <RenderingModeContext.Provider value={value}>
      {children}
    </RenderingModeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook to access the rendering mode context.
 * Must be used within a RenderingModeProvider.
 */
export function useRenderingMode(): RenderingModeContextValue {
  const ctx = useContext(RenderingModeContext);
  if (!ctx) {
    // Return a safe fallback for usage outside provider
    return {
      mode: 'rasterize',
      setMode: () => {},
      toggleMode: () => {},
      convergence: DEFAULT_CONVERGENCE,
      updateConvergence: () => {},
      pathTraceAvailable: false,
      hybridIdleTimeout: 3000,
      setHybridIdleTimeout: () => {},
      isHybridRasterFallback: false,
      renderScale: 1.0,
      setRenderScale: () => {},
    };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { RenderingModeContext };
