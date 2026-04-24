/**
 * Weather System
 *
 * Dynamic weather simulation including rain, snow, fog,
 * wind, storms, and atmospheric effects.
 *
 * @module WeatherSystem
 */
import * as THREE from 'three';
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm' | 'thunderstorm';
export interface WeatherParams {
    intensity: number;
    windSpeed: number;
    windDirection: THREE.Vector3;
    temperature: number;
    humidity: number;
    cloudCover: number;
    precipitationRate: number;
    visibility: number;
}
export interface WeatherState {
    currentType: WeatherType;
    params: WeatherParams;
    transitionProgress: number;
    targetWeather: WeatherType | null;
}
export declare class WeatherSystem {
    private scene;
    private state;
    private noise;
    private rainParticles;
    private snowParticles;
    private fogVolume;
    private clouds;
    private lightningMesh;
    private lastLightningTime;
    private lightningInterval;
    constructor(scene: THREE.Scene, initialWeather?: WeatherType);
    /**
     * Get default parameters for each weather type
     */
    private getDefaultParams;
    /**
     * Initialize particle systems for precipitation
     */
    private initializeParticleSystems;
    /**
     * Transition to a new weather type
     */
    setWeather(type: WeatherType, transitionDuration?: number): void;
    /**
     * Animate weather transition
     */
    private startTransition;
    /**
     * Update weather simulation
     */
    update(deltaTime: number): void;
    /**
     * Update rain particle positions
     */
    private updateRainParticles;
    /**
     * Update snow particle positions
     */
    private updateSnowParticles;
    /**
     * Update cloud system
     */
    private updateClouds;
    /**
     * Create a simple cloud mesh
     */
    private createCloud;
    /**
     * Trigger lightning flash
     */
    private triggerLightning;
    /**
     * Add natural variation to weather parameters
     */
    private addWeatherVariation;
    /**
     * Update particle system visibility based on weather
     */
    private updateParticleVisibility;
    /**
     * Utility: Linear interpolation
     */
    private lerp;
    /**
     * Utility: Ease-in-out cubic
     */
    private easeInOutCubic;
    /**
     * Get current weather state
     */
    getState(): WeatherState;
    /**
     * Get current visibility distance
     */
    getVisibility(): number;
}
export default WeatherSystem;
//# sourceMappingURL=WeatherSystem.d.ts.map