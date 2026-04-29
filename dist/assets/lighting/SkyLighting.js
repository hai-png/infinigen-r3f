import * as THREE from 'three';
/**
 * Sky Lighting System
 * Creates realistic sky and sun lighting using hemisphere and directional lights
 */
export class SkyLightingSystem {
    constructor(config = {}) {
        this.config = {
            sunPosition: new THREE.Vector3(50, 100, 50),
            sunIntensity: 1.5,
            sunColor: new THREE.Color(0xffffff),
            skyColor: new THREE.Color(0x87ceeb),
            groundColor: new THREE.Color(0x3d5c3d),
            turbidity: 10,
            rayleigh: 3,
            ambientIntensity: 0.3,
            ambientColor: new THREE.Color(0xffffff),
            ...config
        };
        this.group = new THREE.Group();
        // Create sun light
        this.sunLight = new THREE.DirectionalLight(this.config.sunColor, this.config.sunIntensity);
        this.sunLight.position.copy(this.config.sunPosition);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.group.add(this.sunLight);
        // Create hemisphere light for sky/ground
        this.hemisphereLight = new THREE.HemisphereLight(this.config.skyColor, this.config.groundColor, 0.6);
        this.group.add(this.hemisphereLight);
        // Create ambient light
        this.ambientLight = new THREE.AmbientLight(this.config.ambientColor, this.config.ambientIntensity);
        this.group.add(this.ambientLight);
        // Optionally create visual sky
        this.createSky();
    }
    /**
     * Create visual sky sphere
     */
    createSky() {
        const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: this.config.skyColor },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 20 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
            side: THREE.BackSide
        });
        this.skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
        this.group.add(this.skyMesh);
    }
    /**
     * Update sun position based on time of day
     */
    setTimeOfDay(time) {
        // Convert time (0-24) to sun position
        const angle = ((time - 6) / 24) * Math.PI * 2;
        const radius = 100;
        this.config.sunPosition.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 50);
        this.sunLight.position.copy(this.config.sunPosition);
        // Adjust colors based on time
        if (time >= 5 && time < 7) {
            // Sunrise
            this.config.sunColor.setHex(0xffaa00);
            this.config.skyColor.setHex(0xff7f50);
        }
        else if (time >= 7 && time < 17) {
            // Day
            this.config.sunColor.setHex(0xffffff);
            this.config.skyColor.setHex(0x87ceeb);
        }
        else if (time >= 17 && time < 19) {
            // Sunset
            this.config.sunColor.setHex(0xff4500);
            this.config.skyColor.setHex(0xff6347);
        }
        else {
            // Night
            this.config.sunColor.setHex(0x111133);
            this.config.skyColor.setHex(0x000011);
        }
        this.sunLight.color.copy(this.config.sunColor);
        this.hemisphereLight.color.copy(this.config.skyColor);
    }
    /**
     * Update sun intensity
     */
    setSunIntensity(intensity) {
        this.config.sunIntensity = intensity;
        this.sunLight.intensity = intensity;
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
        if (config.sunColor)
            this.sunLight.color.copy(config.sunColor);
        if (config.skyColor)
            this.hemisphereLight.color.copy(config.skyColor);
        if (config.groundColor)
            this.hemisphereLight.groundColor.copy(config.groundColor);
        if (config.ambientIntensity !== undefined)
            this.ambientLight.intensity = config.ambientIntensity;
        if (config.ambientColor)
            this.ambientLight.color.copy(config.ambientColor);
    }
}
//# sourceMappingURL=SkyLighting.js.map