import { BloomEffect } from './effects/BloomEffect';
import { ColorGrading } from './effects/ColorGrading';
import { BlurEffect } from './effects/BlurEffect';
import { VignetteEffect } from './effects/VignetteEffect';
import { FilmGrain } from './effects/FilmGrain';
import { ChromaticAberration } from './effects/ChromaticAberration';
const DEFAULT_CONFIG = {
    enableBloom: true,
    enableColorGrading: true,
    enableBlur: false,
    enableVignette: true,
    enableFilmGrain: false,
    enableChromaticAberration: false,
    preset: 'natural',
    performanceMode: false,
};
export class PostProcessChain {
    constructor(config = {}) {
        this.bloomEffect = null;
        this.colorGrading = null;
        this.blurEffect = null;
        this.vignetteEffect = null;
        this.filmGrain = null;
        this.chromaticAberration = null;
        this.initialized = false;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Initialize all enabled effects
     */
    initialize() {
        if (this.initialized)
            return;
        const preset = this.getPreset(this.config.preset);
        if (this.config.enableBloom) {
            this.bloomEffect = new BloomEffect(preset.bloom);
        }
        if (this.config.enableColorGrading) {
            this.colorGrading = new ColorGrading(preset.colorGrading);
        }
        if (this.config.enableBlur) {
            this.blurEffect = new BlurEffect(preset.blur);
        }
        if (this.config.enableVignette) {
            this.vignetteEffect = new VignetteEffect(preset.vignette);
        }
        if (this.config.enableFilmGrain) {
            this.filmGrain = new FilmGrain(preset.filmGrain);
        }
        if (this.config.enableChromaticAberration) {
            this.chromaticAberration = new ChromaticAberration(preset.chromaticAberration);
        }
        this.initialized = true;
    }
    /**
     * Get all active effects for use in EffectComposer
     */
    getEffects() {
        if (!this.initialized) {
            this.initialize();
        }
        const effects = [];
        if (this.bloomEffect)
            effects.push(this.bloomEffect);
        if (this.colorGrading)
            effects.push(this.colorGrading);
        if (this.blurEffect)
            effects.push(this.blurEffect);
        if (this.vignetteEffect)
            effects.push(this.vignetteEffect);
        if (this.filmGrain)
            effects.push(this.filmGrain);
        if (this.chromaticAberration)
            effects.push(this.chromaticAberration);
        return effects;
    }
    /**
     * Apply a named preset
     */
    setPreset(name) {
        const preset = this.getPreset(name);
        if (this.bloomEffect && preset.bloom) {
            this.updateBloom(preset.bloom);
        }
        if (this.colorGrading && preset.colorGrading) {
            this.updateColorGrading(preset.colorGrading);
        }
        if (this.vignetteEffect && preset.vignette) {
            this.updateVignette(preset.vignette);
        }
        if (this.filmGrain && preset.filmGrain) {
            this.updateFilmGrain(preset.filmGrain);
        }
        if (this.chromaticAberration && preset.chromaticAberration) {
            this.updateChromaticAberration(preset.chromaticAberration);
        }
    }
    /**
     * Get preset configuration by name
     */
    getPreset(name) {
        switch (name) {
            case 'none':
                return PRESETS.none;
            case 'natural':
                return PRESETS.natural;
            case 'cinematic':
                return PRESETS.cinematic;
            case 'dramatic':
                return PRESETS.dramatic;
            case 'vintage':
                return PRESETS.vintage;
            case 'stylized':
                return PRESETS.stylized;
            default:
                return PRESETS.natural;
        }
    }
    /**
     * Update bloom parameters
     */
    updateBloom(params) {
        if (!this.bloomEffect)
            return;
        if (params.threshold !== undefined)
            this.bloomEffect.setThreshold(params.threshold);
        if (params.intensity !== undefined)
            this.bloomEffect.setIntensity(params.intensity);
        if (params.radius !== undefined)
            this.bloomEffect.setRadius(params.radius);
    }
    /**
     * Update color grading parameters
     */
    updateColorGrading(params) {
        if (!this.colorGrading)
            return;
        if (params.exposure !== undefined)
            this.colorGrading.setExposure(params.exposure);
        if (params.contrast !== undefined)
            this.colorGrading.setContrast(params.contrast);
        if (params.saturation !== undefined)
            this.colorGrading.setSaturation(params.saturation);
        if (params.temperature !== undefined)
            this.colorGrading.setTemperature(params.temperature);
        if (params.tint !== undefined)
            this.colorGrading.setTint(params.tint);
    }
    /**
     * Update blur parameters
     */
    updateBlur(params) {
        if (!this.blurEffect)
            return;
        if (params.radius !== undefined)
            this.blurEffect.setRadius(params.radius);
        if (params.samples !== undefined)
            this.blurEffect.setSamples(params.samples);
        if (params.direction !== undefined) {
            this.blurEffect.setDirection(params.direction[0], params.direction[1]);
        }
    }
    /**
     * Update vignette parameters
     */
    updateVignette(params) {
        if (!this.vignetteEffect)
            return;
        if (params.intensity !== undefined)
            this.vignetteEffect.setIntensity(params.intensity);
        if (params.darkness !== undefined)
            this.vignetteEffect.setDarkness(params.darkness);
    }
    /**
     * Update film grain parameters
     */
    updateFilmGrain(params) {
        if (!this.filmGrain)
            return;
        if (params.intensity !== undefined)
            this.filmGrain.setIntensity(params.intensity);
        if (params.size !== undefined)
            this.filmGrain.setSize(params.size);
    }
    /**
     * Update chromatic aberration parameters
     */
    updateChromaticAberration(params) {
        if (!this.chromaticAberration)
            return;
        if (params.intensity !== undefined)
            this.chromaticAberration.setIntensity(params.intensity);
    }
    /**
     * Enable or disable an effect by type
     */
    setEffectEnabled(type, enabled) {
        switch (type) {
            case 'bloom':
                if (this.bloomEffect)
                    this.bloomEffect.setEnabled(enabled);
                break;
            case 'colorGrading':
                if (this.colorGrading)
                    this.colorGrading.enabled = enabled;
                break;
            case 'blur':
                if (this.blurEffect)
                    this.blurEffect.setEnabled(enabled);
                break;
            case 'vignette':
                if (this.vignetteEffect)
                    this.vignetteEffect.setEnabled(enabled);
                break;
            case 'filmGrain':
                if (this.filmGrain)
                    this.filmGrain.setEnabled(enabled);
                break;
            case 'chromaticAberration':
                if (this.chromaticAberration)
                    this.chromaticAberration.setEnabled(enabled);
                break;
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Enable performance mode (reduces quality for better FPS)
     */
    enablePerformanceMode() {
        this.config.performanceMode = true;
        // Reduce bloom resolution and iterations
        if (this.bloomEffect) {
            this.bloomEffect.setRadius(0.3);
        }
        // Reduce blur samples
        if (this.blurEffect) {
            this.blurEffect.setSamples(4);
        }
        // Disable film grain
        if (this.filmGrain) {
            this.filmGrain.setIntensity(0);
        }
    }
    /**
     * Disable performance mode (restore full quality)
     */
    disablePerformanceMode() {
        this.config.performanceMode = false;
        // Restore bloom quality
        if (this.bloomEffect) {
            this.bloomEffect.setRadius(0.5);
        }
        // Restore blur samples
        if (this.blurEffect) {
            this.blurEffect.setSamples(8);
        }
    }
}
/**
 * Built-in post-processing presets
 */
const PRESETS = {
    none: {},
    natural: {
        bloom: {
            threshold: 0.85,
            intensity: 1.2,
            radius: 0.3,
            resolution: 256,
            iterations: 4,
        },
        colorGrading: {
            exposure: 0,
            contrast: 1.0,
            saturation: 1.0,
            temperature: 6500,
            tint: 0,
            toneMapping: 'aces',
            vignette: 0.1,
        },
        vignette: {
            intensity: 0.2,
            darkness: 0.5,
        },
    },
    cinematic: {
        bloom: {
            threshold: 0.7,
            intensity: 2.0,
            radius: 0.7,
            resolution: 512,
            iterations: 8,
        },
        colorGrading: {
            exposure: 0.2,
            contrast: 1.15,
            saturation: 1.1,
            vibrance: 0.2,
            temperature: 6000,
            tint: 0.1,
            lift: [0.02, 0.02, 0.03],
            gamma: [1.0, 1.0, 1.0],
            gain: [1.02, 1.0, 0.98],
            toneMapping: 'aces',
            filmEmulation: 0.3,
            vignette: 0.3,
        },
        vignette: {
            intensity: 0.4,
            darkness: 0.6,
        },
        filmGrain: {
            intensity: 0.15,
            size: 1.0,
        },
    },
    dramatic: {
        bloom: {
            threshold: 0.6,
            intensity: 2.5,
            radius: 0.9,
            resolution: 512,
            iterations: 10,
        },
        colorGrading: {
            exposure: -0.2,
            contrast: 1.3,
            saturation: 0.9,
            vibrance: 0,
            temperature: 7500,
            tint: -0.1,
            lift: [0.02, 0.025, 0.03],
            gamma: [0.98, 0.99, 1.02],
            gain: [0.95, 0.98, 1.05],
            toneMapping: 'aces',
            filmEmulation: 0.4,
            vignette: 0.4,
        },
        vignette: {
            intensity: 0.5,
            darkness: 0.7,
        },
        chromaticAberration: {
            intensity: 0.002,
        },
    },
    vintage: {
        bloom: {
            threshold: 0.75,
            intensity: 1.8,
            radius: 0.6,
            resolution: 256,
            iterations: 6,
        },
        colorGrading: {
            exposure: 0.1,
            contrast: 1.1,
            saturation: 0.8,
            vibrance: 0.1,
            temperature: 5500,
            tint: 0.15,
            lift: [0.05, 0.04, 0.03],
            gamma: [1.05, 1.02, 0.98],
            gain: [0.98, 0.95, 0.9],
            toneMapping: 'filmic',
            filmEmulation: 0.6,
            vignette: 0.4,
        },
        vignette: {
            intensity: 0.5,
            darkness: 0.8,
        },
        filmGrain: {
            intensity: 0.3,
            size: 1.5,
        },
    },
    stylized: {
        bloom: {
            threshold: 0.6,
            intensity: 3.0,
            radius: 1.0,
            resolution: 512,
            iterations: 12,
        },
        colorGrading: {
            exposure: 0.3,
            contrast: 1.2,
            saturation: 1.5,
            vibrance: 0.3,
            temperature: 6000,
            tint: 0.2,
            lift: [0.03, 0.02, 0.04],
            gamma: [1.0, 1.0, 1.0],
            gain: [1.05, 1.0, 0.95],
            toneMapping: 'filmic',
            filmEmulation: 0.2,
            vignette: 0.2,
        },
        vignette: {
            intensity: 0.3,
            darkness: 0.5,
        },
        chromaticAberration: {
            intensity: 0.003,
        },
    },
};
export default PostProcessChain;
//# sourceMappingURL=PostProcessChain.js.map