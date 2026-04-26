import { BloomEffect, type BloomEffectProps } from './effects/BloomEffect';
import { ColorGrading, type ColorGradingProps } from './effects/ColorGrading';
import { BlurEffect, type BlurEffectProps } from './effects/BlurEffect';
import { VignetteEffect, type VignetteEffectProps } from './effects/VignetteEffect';
import { FilmGrain, type FilmGrainProps } from './effects/FilmGrain';
import { ChromaticAberration, type ChromaticAberrationProps } from './effects/ChromaticAberration';
/**
 * PostProcessChain - Main post-processing pipeline manager
 *
 * Provides a unified interface for managing multiple post-processing effects
 * with support for presets, real-time parameter updates, and performance optimization.
 *
 * @example
 * ```tsx
 * const postProcess = new PostProcessChain();
 *
 * // In your R3F scene:
 * <EffectComposer>
 *   {postProcess.getEffects()}
 * </EffectComposer>
 *
 * // Update parameters dynamically:
 * postProcess.setPreset('cinematic');
 * postProcess.updateBloom({ intensity: 2.0 });
 * ```
 */
export interface PostProcessChainConfig {
    /** Enable bloom effect */
    enableBloom?: boolean;
    /** Enable color grading */
    enableColorGrading?: boolean;
    /** Enable blur effects */
    enableBlur?: boolean;
    /** Enable vignette */
    enableVignette?: boolean;
    /** Enable film grain */
    enableFilmGrain?: boolean;
    /** Enable chromatic aberration */
    enableChromaticAberration?: boolean;
    /** Initial preset to apply */
    preset?: PostProcessPresetName;
    /** Performance mode (reduces quality for better FPS) */
    performanceMode?: boolean;
}
export type PostProcessPresetName = 'none' | 'natural' | 'cinematic' | 'dramatic' | 'vintage' | 'stylized';
export declare class PostProcessChain {
    private config;
    private bloomEffect;
    private colorGrading;
    private blurEffect;
    private vignetteEffect;
    private filmGrain;
    private chromaticAberration;
    private initialized;
    constructor(config?: PostProcessChainConfig);
    /**
     * Initialize all enabled effects
     */
    initialize(): void;
    /**
     * Get all active effects for use in EffectComposer
     */
    getEffects(): Array<BloomEffect | ColorGrading | BlurEffect | VignetteEffect | FilmGrain | ChromaticAberration>;
    /**
     * Apply a named preset
     */
    setPreset(name: PostProcessPresetName): void;
    /**
     * Get preset configuration by name
     */
    private getPreset;
    /**
     * Update bloom parameters
     */
    updateBloom(params: Partial<BloomEffectProps>): void;
    /**
     * Update color grading parameters
     */
    updateColorGrading(params: Partial<ColorGradingProps>): void;
    /**
     * Update blur parameters
     */
    updateBlur(params: Partial<BlurEffectProps>): void;
    /**
     * Update vignette parameters
     */
    updateVignette(params: Partial<VignetteEffectProps>): void;
    /**
     * Update film grain parameters
     */
    updateFilmGrain(params: Partial<FilmGrainProps>): void;
    /**
     * Update chromatic aberration parameters
     */
    updateChromaticAberration(params: Partial<ChromaticAberrationProps>): void;
    /**
     * Enable or disable an effect by type
     */
    setEffectEnabled(type: 'bloom' | 'colorGrading' | 'blur' | 'vignette' | 'filmGrain' | 'chromaticAberration', enabled: boolean): void;
    /**
     * Get current configuration
     */
    getConfig(): PostProcessChainConfig;
    /**
     * Enable performance mode (reduces quality for better FPS)
     */
    enablePerformanceMode(): void;
    /**
     * Disable performance mode (restore full quality)
     */
    disablePerformanceMode(): void;
}
export default PostProcessChain;
//# sourceMappingURL=PostProcessChain.d.ts.map