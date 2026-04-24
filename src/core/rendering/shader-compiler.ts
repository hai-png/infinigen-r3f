/**
 * Shader Compilation Pipeline for Infinigen R3F
 * 
 * Implements GLSL shader loading, preprocessing, variant generation,
 * caching, and hot-reload capabilities for ground truth rendering.
 * 
 * Based on: infinigen/core/rendering/shader_system.py
 * 
 * @module rendering
 */

import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLProgram,
} from 'three';

/**
 * Shader variant configuration
 */
export interface ShaderVariant {
  /** Unique variant name */
  name: string;
  /** Preprocessor defines */
  defines: Record<string, string | number | boolean>;
  /** Uniform overrides */
  uniformOverrides?: Record<string, any>;
  /** Enabled features */
  features?: string[];
}

/**
 * Shader cache entry
 */
interface ShaderCacheEntry {
  /** Compiled program */
  program: WebGLProgram;
  /** Source code */
  vertexSource: string;
  fragmentSource: string;
  /** Variant configuration */
  variant: ShaderVariant;
  /** Creation timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt: number;
  /** Use count */
  useCount: number;
}

/**
 * Shader compilation result
 */
export interface ShaderCompilationResult {
  /** Success status */
  success: boolean;
  /** Compiled material (if successful) */
  material?: ShaderMaterial;
  /** Error message (if failed) */
  error?: string;
  /** Warnings */
  warnings: string[];
  /** Compilation time in ms */
  compileTime: number;
}

/**
 * Hot reload watcher callback
 */
export type HotReloadCallback = (shaderName: string, newSource: string) => void;

/**
 * Shader validation result
 */
export interface ShaderValidationResult {
  /** Valid syntax */
  valid: boolean;
  /** Errors found */
  errors: string[];
  /** Warnings found */
  warnings: string[];
  /** Performance hints */
  hints: string[];
}

/**
 * Shader compilation and management system
 * 
 * Features:
 * - GLSL source loading from files or strings
 * - Preprocessor with #define support
 * - Variant generation for different render passes
 * - LRU cache for compiled shaders
 * - Hot-reload for development
 * - Validation and error reporting
 */
export class ShaderCompiler {
  /** Cache of compiled shaders */
  private cache: Map<string, ShaderCacheEntry> = new Map();
  
  /** Maximum cache size */
  private maxCacheSize: number = 100;
  
  /** Hot reload callbacks */
  private hotReloadCallbacks: Map<string, HotReloadCallback[]> = new Map();
  
  /** Watch mode enabled */
  private watchMode: boolean = false;
  
  /** File watchers (browser-compatible via polling) */
  private fileWatchers: Map<string, { path: string; lastModified: number; content: string }> = new Map();
  
  /** Polling interval for watch mode (ms) */
  private watchPollInterval: number = 1000;
  
  /** WebGL renderer for compilation */
  private renderer: WebGLRenderer;
  
  /** Default preprocessor defines */
  private defaultDefines: Record<string, string | number | boolean> = {
    USE_UV: true,
    USE_NORMALMAP: false,
    USE_ROUGHNESSMAP: false,
    USE_METALNESSMAP: false,
    USE_EMISSIVEMAP: false,
    USE_AOMAP: false,
    USE_LIGHTMAP: false,
    USE_BUMPMAP: false,
    USE_ALPHAMAP: false,
    ENV_MAPPING: false,
    FLAT_SHADING: false,
    DOUBLE_SIDED: false,
    INSTANCING: false,
    VERTEX_COLORS: false,
    LOG_DEPTH_BUFFER: false,
  };

  constructor(renderer: WebGLRenderer, options?: {
    maxCacheSize?: number;
    enableHotReload?: boolean;
    watchPollInterval?: number;
  }) {
    this.renderer = renderer;
    this.maxCacheSize = options?.maxCacheSize ?? 100;
    this.watchMode = options?.enableHotReload ?? false;
    this.watchPollInterval = options?.watchPollInterval ?? 1000;
    
    if (this.watchMode) {
      this.startWatchMode();
    }
  }

  /**
   * Compile a shader material from source
   */
  async compile(options: {
    vertexShader: string;
    fragmentShader: string;
    uniforms?: Record<string, { value: any }>;
    variant?: ShaderVariant;
    cacheKey?: string;
  }): Promise<ShaderCompilationResult> {
    const startTime = performance.now();
    const warnings: string[] = [];
    
    const {
      vertexShader: rawVertexSource,
      fragmentShader: rawFragmentSource,
      uniforms = {},
      variant,
      cacheKey,
    } = options;
    
    // Check cache first
    const effectiveCacheKey = cacheKey ?? this.generateCacheKey(
      rawVertexSource,
      rawFragmentSource,
      variant
    );
    
    const cached = this.cache.get(effectiveCacheKey);
    if (cached) {
      cached.lastUsedAt = Date.now();
      cached.useCount++;
      
      const material = new ShaderMaterial({
        uniforms: { ...uniforms },
        vertexShader: cached.vertexSource,
        fragmentShader: cached.fragmentSource,
        defines: variant?.defines,
      });
      
      return {
        success: true,
        material,
        warnings,
        compileTime: 0, // From cache
      };
    }
    
    // Preprocess shaders
    const { vertexShader, fragmentShader } = this.preprocessShaders(
      rawVertexSource,
      rawFragmentSource,
      variant
    );
    
    // Validate shaders
    const validation = this.validateShaders(vertexShader, fragmentShader);
    warnings.push(...validation.warnings);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('\n'),
        warnings,
        compileTime: performance.now() - startTime,
      };
    }
    
    // Create material
    try {
      const material = new ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        defines: variant?.defines,
      });
      
      // Force compilation
      material.onBeforeCompile = (program: WebGLProgram) => {
        // Store in cache
        this.addToCache(effectiveCacheKey, {
          program,
          vertexSource: vertexShader,
          fragmentSource: fragmentShader,
          variant: variant ?? { name: 'default', defines: {} },
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          useCount: 1,
        });
      };
      
      // Trigger compilation by using the material
      this.renderer.compile(material, undefined as any);
      
      return {
        success: true,
        material,
        warnings,
        compileTime: performance.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        warnings,
        compileTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Preprocess shader sources with variants
   */
  private preprocessShaders(
    vertexSource: string,
    fragmentSource: string,
    variant?: ShaderVariant
  ): { vertexShader: string; fragmentShader: string } {
    // Merge default defines with variant defines
    const allDefines = {
      ...this.defaultDefines,
      ...(variant?.defines ?? {}),
    };
    
    // Process vertex shader
    let processedVertex = vertexSource;
    for (const [key, value] of Object.entries(allDefines)) {
      const defineStr = typeof value === 'boolean'
        ? `${value ? '1' : '0'}`
        : String(value);
      
      // Add define if not already present
      if (!processedVertex.includes(`#define ${key}`)) {
        processedVertex = `#define ${key} ${defineStr}\n${processedVertex}`;
      }
    }
    
    // Process fragment shader
    let processedFragment = fragmentSource;
    for (const [key, value] of Object.entries(allDefines)) {
      const defineStr = typeof value === 'boolean'
        ? `${value ? '1' : '0'}`
        : String(value);
      
      if (!processedFragment.includes(`#define ${key}`)) {
        processedFragment = `#define ${key} ${defineStr}\n${processedFragment}`;
      }
    }
    
    // Handle feature-based includes
    if (variant?.features) {
      for (const feature of variant.features) {
        processedVertex = this.injectFeature(processedVertex, feature);
        processedFragment = this.injectFeature(processedFragment, feature);
      }
    }
    
    return {
      vertexShader: processedVertex,
      fragmentShader: processedFragment,
    };
  }

  /**
   * Inject feature-specific shader code
   */
  private injectFeature(source: string, feature: string): string {
    // Feature injection patterns
    const featureChunks: Record<string, string> = {
      instancing: `
        #ifdef USE_INSTANCING
          attribute mat4 instanceMatrix;
        #endif
      `,
      vertexColors: `
        #ifdef VERTEX_COLORS
          attribute vec3 color;
          varying vec3 vColor;
        #endif
      `,
      normalMap: `
        #ifdef USE_NORMALMAP
          uniform sampler2D normalMap;
          varying vec3 vNormal;
        #endif
      `,
      roughnessMap: `
        #ifdef USE_ROUGHNESSMAP
          uniform sampler2D roughnessMap;
        #endif
      `,
      metalnessMap: `
        #ifdef USE_METALNESSMAP
          uniform sampler2D metalnessMap;
        #endif
      `,
    };
    
    const chunk = featureChunks[feature];
    if (chunk && !source.includes(chunk)) {
      // Insert after version directive or at beginning
      const versionMatch = source.match(/^#version\s+\d+/);
      if (versionMatch) {
        return source.replace(versionMatch[0], `${versionMatch[0]}\n${chunk}`);
      }
      return `${chunk}\n${source}`;
    }
    
    return source;
  }

  /**
   * Validate shader syntax
   */
  private validateShaders(vertexSource: string, fragmentSource: string): ShaderValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const hints: string[] = [];
    
    // Basic syntax checks
    const checkSyntax = (source: string, type: 'vertex' | 'fragment') => {
      // Check for main function
      if (!source.includes('void main()')) {
        errors.push(`${type} shader missing main() function`);
      }
      
      // Check for balanced braces
      const openBraces = (source.match(/{/g) || []).length;
      const closeBraces = (source.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push(`${type} shader has unbalanced braces (${openBraces} open, ${closeBraces} close)`);
      }
      
      // Check for common mistakes
      if (source.includes('gl_FragColor') && !source.includes('#version 100')) {
        warnings.push(`${type} shader uses deprecated gl_FragColor in modern GLSL`);
      }
      
      // Performance hints
      if ((source.match(/texture2D/g) || []).length > 10) {
        hints.push(`${type} shader has many texture lookups - consider optimization`);
      }
      
      if (source.includes('for') && source.includes('while')) {
        hints.push(`${type} shader contains loops - ensure they terminate`);
      }
    };
    
    checkSyntax(vertexSource, 'vertex');
    checkSyntax(fragmentSource, 'fragment');
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      hints,
    };
  }

  /**
   * Generate cache key from shader sources and variant
   */
  private generateCacheKey(
    vertexSource: string,
    fragmentSource: string,
    variant?: ShaderVariant
  ): string {
    const variantStr = variant ? JSON.stringify(variant) : 'default';
    const combined = `${vertexSource}|${fragmentSource}|${variantStr}`;
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return `shader_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Add shader to cache with LRU eviction
   */
  private addToCache(key: string, entry: ShaderCacheEntry): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      
      for (const [k, v] of this.cache.entries()) {
        if (v.lastUsedAt < oldestTime) {
          oldestTime = v.lastUsedAt;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, entry);
  }

  /**
   * Clear shader cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    entries: Array<{ key: string; uses: number; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      uses: entry.useCount,
      age: now - entry.createdAt,
    }));
    
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      entries,
    };
  }

  /**
   * Register hot reload callback for a shader
   */
  onHotReload(shaderName: string, callback: HotReloadCallback): void {
    if (!this.hotReloadCallbacks.has(shaderName)) {
      this.hotReloadCallbacks.set(shaderName, []);
    }
    this.hotReloadCallbacks.get(shaderName)!.push(callback);
  }

  /**
   * Start watch mode for hot reloading
   */
  private startWatchMode(): void {
    setInterval(() => {
      // In browser environment, we'd poll for file changes
      // This is a simplified implementation
      for (const [name, watcher] of this.fileWatchers.entries()) {
        // Check if file was modified (would need actual file system access)
        // For now, this is a placeholder for the watch mechanism
      }
    }, this.watchPollInterval);
  }

  /**
   * Register a file for watching
   */
  watchFile(name: string, path: string, content: string): void {
    this.fileWatchers.set(name, {
      path,
      lastModified: Date.now(),
      content,
    });
  }

  /**
   * Update shader source and trigger hot reload
   */
  updateShaderSource(name: string, newSource: string): void {
    const callbacks = this.hotReloadCallbacks.get(name);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(name, newSource);
      }
    }
    
    // Update watched file
    const watcher = this.fileWatchers.get(name);
    if (watcher) {
      watcher.content = newSource;
      watcher.lastModified = Date.now();
    }
  }

  /**
   * Generate shader variants from base source
   */
  generateVariants(
    baseVertex: string,
    baseFragment: string,
    variantConfigs: ShaderVariant[]
  ): ShaderVariant[] {
    return variantConfigs;
  }

  /**
   * Export shader to GLSL file format
   */
  exportToGLSL(material: ShaderMaterial, name: string): {
    vertexShader: string;
    fragmentShader: string;
  } {
    return {
      vertexShader: material.vertexShader,
      fragmentShader: material.fragmentShader,
    };
  }
}

/**
 * Predefined shader variants for common render passes
 */
export const PREDEFINED_VARIANTS: Record<string, ShaderVariant> = {
  beauty: {
    name: 'beauty',
    defines: {
      USE_UV: true,
      USE_NORMALMAP: false,
      FLAT_SHADING: false,
    },
  },
  flat: {
    name: 'flat',
    defines: {
      FLAT_SHADING: true,
      USE_UV: false,
    },
  },
  depth: {
    name: 'depth',
    defines: {
      OUTPUT_DEPTH: true,
    },
  },
  normal: {
    name: 'normal',
    defines: {
      OUTPUT_NORMAL: true,
    },
  },
  instanceId: {
    name: 'instanceId',
    defines: {
      OUTPUT_INSTANCE_ID: true,
      INSTANCING: true,
    },
  },
  semantic: {
    name: 'semantic',
    defines: {
      OUTPUT_SEMANTIC: true,
    },
  },
};

export default ShaderCompiler;
