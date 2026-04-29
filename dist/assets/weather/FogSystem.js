/**
 * Fog System
 *
 * Volumetric fog simulation with height-based density,
 * wind-driven movement, and dynamic dissipation.
 *
 * @module FogSystem
 */
import * as THREE from 'three';
export class FogSystem {
    constructor(scene, params = {}) {
        this.fogMesh = null;
        this.noiseTexture = null;
        this.scene = scene;
        this.params = {
            density: params.density ?? 0.5,
            color: params.color || new THREE.Color(0x888888),
            height: params.height ?? 10,
            falloff: params.falloff ?? 0.1,
            windSpeed: params.windSpeed ?? 2,
            windDirection: params.windDirection || new THREE.Vector3(1, 0, 0),
            turbulence: params.turbulence ?? 0.3,
            noiseScale: params.noiseScale ?? 0.02
        };
        this.timeUniform = { value: 0 };
        this.densityUniform = { value: this.params.density };
        this.heightUniform = { value: this.params.height };
        this.falloffUniform = { value: this.params.falloff };
        this.initializeFog();
    }
    /**
     * Initialize fog volume mesh
     */
    initializeFog() {
        // Create 3D noise texture for fog variation
        this.noiseTexture = this.createNoiseTexture(64, 64, 32);
        // Large box geometry for fog volume
        const geometry = new THREE.BoxGeometry(200, this.params.height, 200);
        // Custom shader material for volumetric fog
        const material = new THREE.ShaderMaterial({
            uniforms: {
                fogColor: { value: this.params.color },
                fogDensity: this.densityUniform,
                fogHeight: this.heightUniform,
                fogFalloff: this.falloffUniform,
                time: this.timeUniform,
                windDirection: { value: this.params.windDirection },
                windSpeed: { value: this.params.windSpeed },
                noiseScale: { value: this.params.noiseScale },
                turbulence: { value: this.params.turbulence },
                noiseTexture: { value: this.noiseTexture }
            },
            vertexShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;
        
        uniform float fogHeight;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vHeight = (worldPosition.y) / fogHeight;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
            fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;
        
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float fogFalloff;
        uniform float time;
        uniform vec3 windDirection;
        uniform float windSpeed;
        uniform float noiseScale;
        uniform float turbulence;
        uniform sampler3D noiseTexture;
        
        // Simple 3D noise function
        float noise(vec3 p) {
          return texture(noiseTexture, fract(p)).r;
        }
        
        void main() {
          // Animate noise with wind
          vec3 noiseCoord = vWorldPosition * noiseScale;
          noiseCoord.xz += windDirection.xz * windSpeed * time * 0.1;
          
          // Sample noise for density variation
          float n = noise(noiseCoord);
          n += turbulence * noise(noiseCoord * 2.0 + time * 0.2);
          
          // Height-based falloff
          float heightFactor = smoothstep(1.0, 0.0, vHeight);
          heightFactor *= exp(-fogFalloff * vHeight);
          
          // Combine factors
          float density = fogDensity * heightFactor * (0.5 + 0.5 * n);
          
          // Exponential fog density
          float fogFactor = 1.0 - exp(-density * 2.0);
          
          gl_FragColor = vec4(fogColor, fogFactor);
        }
      `,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
            blending: THREE.NormalBlending
        });
        this.fogMesh = new THREE.Mesh(geometry, material);
        this.fogMesh.position.y = this.params.height / 2;
        this.scene.add(this.fogMesh);
        // Also set Three.js built-in fog for objects within the fog
        this.scene.fog = new THREE.FogExp2(this.params.color.getHex(), this.params.density * 0.02);
    }
    /**
     * Create 3D noise texture
     */
    createNoiseTexture(width, height, depth) {
        const size = width * height * depth;
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            // Generate gradient noise
            data[i] = Math.floor(Math.random() * 256);
        }
        const texture = new THREE.DataTexture(data, width, height, depth, THREE.RedFormat);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }
    /**
     * Update fog simulation
     */
    update(deltaTime) {
        if (!this.fogMesh)
            return;
        // Update time uniform for animation
        this.timeUniform.value += deltaTime;
        // Update wind parameters
        this.fogMesh.material.uniforms.windDirection.value = this.params.windDirection;
        this.fogMesh.material.uniforms.windSpeed.value = this.params.windSpeed;
    }
    /**
     * Set fog density
     */
    setDensity(density) {
        this.params.density = Math.max(0, Math.min(1, density));
        this.densityUniform.value = this.params.density;
        // Update Three.js scene fog
        if (this.scene.fog) {
            this.scene.fog.density = this.params.density * 0.02;
        }
    }
    /**
     * Set fog color
     */
    setColor(color) {
        this.params.color = color;
        if (this.fogMesh) {
            this.fogMesh.material.uniforms.fogColor.value = color;
        }
        // Update Three.js scene fog
        if (this.scene.fog) {
            this.scene.fog.color = color;
        }
    }
    /**
     * Set fog height
     */
    setHeight(height) {
        this.params.height = height;
        this.heightUniform.value = height;
        if (this.fogMesh) {
            this.fogMesh.geometry.dispose();
            this.fogMesh.geometry = new THREE.BoxGeometry(200, height, 200);
            this.fogMesh.position.y = height / 2;
        }
    }
    /**
     * Set wind parameters
     */
    setWind(speed, direction) {
        this.params.windSpeed = speed;
        this.params.windDirection = direction.normalize();
    }
    /**
     * Set turbulence level
     */
    setTurbulence(turbulence) {
        this.params.turbulence = Math.max(0, Math.min(1, turbulence));
        if (this.fogMesh) {
            this.fogMesh.material.uniforms.turbulence.value = this.params.turbulence;
        }
    }
    /**
     * Enable/disable fog
     */
    setEnabled(enabled) {
        if (this.fogMesh) {
            this.fogMesh.visible = enabled;
        }
        if (this.scene.fog && !enabled) {
            this.scene.fog = null;
        }
    }
    /**
     * Get current visibility distance
     */
    getVisibility() {
        return 1 / (this.params.density * 0.02);
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.fogMesh) {
            this.fogMesh.geometry.dispose();
            this.fogMesh.material.dispose();
            this.scene.remove(this.fogMesh);
        }
        if (this.noiseTexture) {
            this.noiseTexture.dispose();
        }
        if (this.scene.fog) {
            this.scene.fog = null;
        }
    }
}
export default FogSystem;
//# sourceMappingURL=FogSystem.js.map