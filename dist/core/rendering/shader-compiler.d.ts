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
import { ShaderMaterial, WebGLRenderer } from 'three';
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
export declare class ShaderCompiler {
    /** Cache of compiled shaders */
    private cache;
    /** Maximum cache size */
    private maxCacheSize;
    /** Hot reload callbacks */
    private hotReloadCallbacks;
    /** Watch mode enabled */
    private watchMode;
    /** File watchers (browser-compatible via polling) */
    private fileWatchers;
    /** Polling interval for watch mode (ms) */
    private watchPollInterval;
    /** WebGL renderer for compilation */
    private renderer;
    /** Default preprocessor defines */
    private defaultDefines;
    constructor(renderer: WebGLRenderer, options?: {
        maxCacheSize?: number;
        enableHotReload?: boolean;
        watchPollInterval?: number;
    });
    /**
     * Compile a shader material from source
     */
    compile(options: {
        vertexShader: string;
        fragmentShader: string;
        uniforms?: Record<string, {
            value: any;
        }>;
        variant?: ShaderVariant;
        cacheKey?: string;
    }): Promise<ShaderCompilationResult>;
    /**
     * Preprocess shader sources with variants
     */
    private preprocessShaders;
    /**
     * Inject feature-specific shader code
     */
    private injectFeature;
    /**
     * Validate shader syntax
     */
    private validateShaders;
    /**
     * Generate cache key from shader sources and variant
     */
    private generateCacheKey;
    /**
     * Add shader to cache with LRU eviction
     */
    private addToCache;
    /**
     * Clear shader cache
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        maxSize: number;
        entries: Array<{
            key: string;
            uses: number;
            age: number;
        }>;
    };
    /**
     * Register hot reload callback for a shader
     */
    onHotReload(shaderName: string, callback: HotReloadCallback): void;
    /**
     * Start watch mode for hot reloading
     */
    private startWatchMode;
    /**
     * Register a file for watching
     */
    watchFile(name: string, path: string, content: string): void;
    /**
     * Update shader source and trigger hot reload
     */
    updateShaderSource(name: string, newSource: string): void;
    /**
     * Generate shader variants from base source
     */
    generateVariants(baseVertex: string, baseFragment: string, variantConfigs: ShaderVariant[]): ShaderVariant[];
    /**
     * Export shader to GLSL file format
     */
    exportToGLSL(material: ShaderMaterial, name: string): {
        vertexShader: string;
        fragmentShader: string;
    };
}
/**
 * Predefined shader variants for common render passes
 */
export declare const PREDEFINED_VARIANTS: Record<string, ShaderVariant>;
export default ShaderCompiler;
//# sourceMappingURL=shader-compiler.d.ts.map