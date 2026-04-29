import * as THREE from 'three';
/**
 * Three-Point Lighting System
 * Classic studio lighting setup with key, fill, and rim lights
 */
export class ThreePointLightingSystem {
    constructor(config = {}) {
        this.config = {
            keyIntensity: 2.0,
            keyColor: new THREE.Color(0xffffff),
            keyAngle: Math.PI / 4,
            keyHeight: 5,
            fillIntensity: 0.5,
            fillColor: new THREE.Color(0xffffff),
            fillAngle: -Math.PI / 4,
            fillHeight: 2,
            rimIntensity: 1.0,
            rimColor: new THREE.Color(0xffffff),
            rimHeight: 4,
            target: new THREE.Vector3(0, 0, 0),
            enableShadows: true,
            shadowMapSize: 2048,
            ...config
        };
        this.group = new THREE.Group();
        // Create target object for lights to focus on
        this.targetObject = new THREE.Object3D();
        this.targetObject.position.copy(this.config.target);
        this.group.add(this.targetObject);
        // Create key light (main, strongest light)
        this.keyLight = this.createSpotLight(this.config.keyColor, this.config.keyIntensity, this.config.keyAngle, this.config.keyHeight);
        this.group.add(this.keyLight);
        // Create fill light (softer, fills shadows)
        this.fillLight = this.createFillLight(this.config.fillColor, this.config.fillIntensity, this.config.fillAngle, this.config.fillHeight);
        this.group.add(this.fillLight);
        // Create rim light (backlight for edge highlighting)
        this.rimLight = this.createSpotLight(this.config.rimColor, this.config.rimIntensity, Math.PI, // Behind the subject
        this.config.rimHeight);
        this.group.add(this.rimLight);
    }
    /**
     * Create a spotlight with standard settings
     */
    createSpotLight(color, intensity, angle, height) {
        const light = new THREE.SpotLight(color, intensity);
        const x = Math.sin(angle) * 10;
        const z = Math.cos(angle) * 10;
        light.position.set(x, height, z);
        light.target = this.targetObject;
        light.angle = Math.PI / 6;
        light.penumbra = 0.3;
        light.decay = 2;
        light.distance = 50;
        if (this.config.enableShadows) {
            light.castShadow = true;
            light.shadow.mapSize.width = this.config.shadowMapSize;
            light.shadow.mapSize.height = this.config.shadowMapSize;
            light.shadow.camera.near = 1;
            light.shadow.camera.far = 100;
            light.shadow.camera.fov = 30;
        }
        return light;
    }
    /**
     * Create fill light (point light for soft illumination)
     */
    createFillLight(color, intensity, angle, height) {
        const light = new THREE.PointLight(color, intensity);
        const x = Math.sin(angle) * 8;
        const z = Math.cos(angle) * 8;
        light.position.set(x, height, z);
        light.distance = 30;
        light.decay = 2;
        return light;
    }
    /**
     * Update light positions based on new target
     */
    setTarget(target) {
        this.config.target = target.clone();
        this.targetObject.position.copy(target);
        // Reposition lights relative to new target
        this.repositionLights();
    }
    /**
     * Reposition all lights maintaining their relative angles
     */
    repositionLights() {
        const target = this.config.target;
        // Key light
        const keyX = target.x + Math.sin(this.config.keyAngle) * 10;
        const keyZ = target.z + Math.cos(this.config.keyAngle) * 10;
        this.keyLight.position.set(keyX, target.y + this.config.keyHeight, keyZ);
        // Fill light
        const fillX = target.x + Math.sin(this.config.fillAngle) * 8;
        const fillZ = target.z + Math.cos(this.config.fillAngle) * 8;
        this.fillLight.position.set(fillX, target.y + this.config.fillHeight, fillZ);
        // Rim light
        const rimX = target.x + Math.sin(Math.PI) * 10;
        const rimZ = target.z + Math.cos(Math.PI) * 10;
        this.rimLight.position.set(rimX, target.y + this.config.rimHeight, rimZ);
    }
    /**
     * Set key light intensity
     */
    setKeyIntensity(intensity) {
        this.config.keyIntensity = intensity;
        this.keyLight.intensity = intensity;
    }
    /**
     * Set fill light intensity
     */
    setFillIntensity(intensity) {
        this.config.fillIntensity = intensity;
        this.fillLight.intensity = intensity;
    }
    /**
     * Set rim light intensity
     */
    setRimIntensity(intensity) {
        this.config.rimIntensity = intensity;
        this.rimLight.intensity = intensity;
    }
    /**
     * Get lighting group
     */
    getGroup() {
        return this.group;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        if (config.keyColor)
            this.keyLight.color.copy(config.keyColor);
        if (config.fillColor)
            this.fillLight.color.copy(config.fillColor);
        if (config.rimColor)
            this.rimLight.color.copy(config.rimColor);
        if (config.keyIntensity !== undefined)
            this.setKeyIntensity(config.keyIntensity);
        if (config.fillIntensity !== undefined)
            this.setFillIntensity(config.fillIntensity);
        if (config.rimIntensity !== undefined)
            this.setRimIntensity(config.rimIntensity);
        if (config.target)
            this.setTarget(config.target);
    }
    /**
     * Create dramatic lighting preset
     */
    applyDramaticPreset() {
        this.setConfig({
            keyIntensity: 3.0,
            fillIntensity: 0.2,
            rimIntensity: 1.5,
            keyColor: new THREE.Color(0xffeedd),
            fillColor: new THREE.Color(0x444466),
            rimColor: new THREE.Color(0xffffff)
        });
    }
    /**
     * Create soft/portrait lighting preset
     */
    applySoftPreset() {
        this.setConfig({
            keyIntensity: 1.5,
            fillIntensity: 0.8,
            rimIntensity: 0.5,
            keyColor: new THREE.Color(0xffffee),
            fillColor: new THREE.Color(0xffffff),
            rimColor: new THREE.Color(0xffffff)
        });
    }
}
//# sourceMappingURL=ThreePointLighting.js.map