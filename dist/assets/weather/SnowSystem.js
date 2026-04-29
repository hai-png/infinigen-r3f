/**
 * Snow Particle System
 *
 * Realistic snow simulation with fluttering flakes,
 * wind drift, accumulation, and melting effects.
 *
 * @module SnowSystem
 */
import * as THREE from 'three';
export class SnowSystem {
    constructor(scene, params = {}) {
        this.snowMesh = null;
        this.accumulationMeshes = [];
        this.snowflakes = [];
        this.maxFlakes = 8000;
        this.accumulationMap = new Map();
        this.scene = scene;
        this.params = {
            intensity: params.intensity ?? 0.6,
            windSpeed: params.windSpeed ?? 3,
            windDirection: params.windDirection || new THREE.Vector3(1, 0, 0.5),
            flakeSize: params.flakeSize ?? 0.15,
            fallSpeed: params.fallSpeed ?? 3,
            turbulence: params.turbulence ?? 0.5,
            accumulationEnabled: params.accumulationEnabled ?? true,
            meltEnabled: params.meltEnabled ?? true,
            temperature: params.temperature ?? -2
        };
        this.initializeSnow();
    }
    /**
     * Initialize snow particle system
     */
    initializeSnow() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxFlakes * 3);
        const sizes = new Float32Array(this.maxFlakes);
        const phases = new Float32Array(this.maxFlakes);
        // Create snowflake data
        for (let i = 0; i < this.maxFlakes; i++) {
            const x = (Math.random() - 0.5) * 100;
            const y = Math.random() * 50 + 10;
            const z = (Math.random() - 0.5) * 100;
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            sizes[i] = this.params.flakeSize * (0.5 + Math.random() * 0.5);
            phases[i] = Math.random() * Math.PI * 2;
            this.snowflakes.push({
                x, y, z,
                vx: 0,
                vy: -this.params.fallSpeed,
                vz: 0,
                size: sizes[i],
                rotationSpeed: (Math.random() - 0.5) * 2,
                phase: phases[i]
            });
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        // Create circular sprite texture
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.3,
            map: texture,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });
        this.snowMesh = new THREE.Points(geometry, material);
        this.scene.add(this.snowMesh);
    }
    /**
     * Update snow simulation
     */
    update(deltaTime) {
        if (!this.snowMesh)
            return;
        const positions = this.snowMesh.geometry.attributes.position.array;
        const activeFlakes = Math.floor(this.maxFlakes * this.params.intensity);
        // Wind components
        const windX = this.params.windDirection.x * this.params.windSpeed;
        const windZ = this.params.windDirection.z * this.params.windSpeed;
        for (let i = 0; i < activeFlakes; i++) {
            const flake = this.snowflakes[i];
            // Update velocity with wind and turbulence
            flake.vx += (windX - flake.vx) * 0.1 * deltaTime;
            flake.vz += (windZ - flake.vz) * 0.1 * deltaTime;
            // Add turbulence (swirling motion)
            const time = Date.now() * 0.001;
            flake.vx += Math.sin(time + flake.phase) * this.params.turbulence * deltaTime;
            flake.vz += Math.cos(time * 0.7 + flake.phase) * this.params.turbulence * deltaTime;
            // Update position
            flake.x += flake.vx * deltaTime;
            flake.y += flake.vy * deltaTime;
            flake.z += flake.vz * deltaTime;
            // Boundary wrapping
            if (flake.x < -50)
                flake.x = 50;
            if (flake.x > 50)
                flake.x = -50;
            if (flake.z < -50)
                flake.z = 50;
            if (flake.z > 50)
                flake.z = -50;
            // Ground collision
            if (flake.y < 0) {
                // Track accumulation
                if (this.params.accumulationEnabled) {
                    this.addAccumulation(flake.x, flake.z, deltaTime);
                }
                // Reset flake to top
                flake.y = 50 + Math.random() * 10;
                flake.x = (Math.random() - 0.5) * 100;
                flake.z = (Math.random() - 0.5) * 100;
                flake.vx = 0;
                flake.vz = 0;
            }
            // Update position array
            positions[i * 3] = flake.x;
            positions[i * 3 + 1] = flake.y;
            positions[i * 3 + 2] = flake.z;
        }
        // Hide inactive flakes
        for (let i = activeFlakes; i < this.maxFlakes; i++) {
            positions[i * 3 + 1] = -1000;
        }
        this.snowMesh.geometry.attributes.position.needsUpdate = true;
        // Handle melting
        if (this.params.meltEnabled && this.params.temperature > 0) {
            this.handleMelting(deltaTime);
        }
    }
    /**
     * Track snow accumulation at position
     */
    addAccumulation(x, z, deltaTime) {
        const key = `${Math.round(x)},${Math.round(z)}`;
        const current = this.accumulationMap.get(key) || 0;
        this.accumulationMap.set(key, Math.min(current + deltaTime * 0.5, 0.5));
    }
    /**
     * Handle snow melting based on temperature
     */
    handleMelting(deltaTime) {
        const meltRate = (this.params.temperature / 10) * deltaTime;
        for (const [key, value] of this.accumulationMap.entries()) {
            const newValue = value - meltRate;
            if (newValue <= 0) {
                this.accumulationMap.delete(key);
            }
            else {
                this.accumulationMap.set(key, newValue);
            }
        }
    }
    /**
     * Get accumulated snow height at position
     */
    getAccumulationHeight(x, z) {
        const key = `${Math.round(x)},${Math.round(z)}`;
        return this.accumulationMap.get(key) || 0;
    }
    /**
     * Create visible snow accumulation meshes
     */
    createAccumulationMeshes(gridSize = 2) {
        if (!this.params.accumulationEnabled)
            return;
        // Clean up old meshes
        this.accumulationMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.accumulationMeshes = [];
        // Create accumulation patches
        const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0
        });
        for (const [key, height] of this.accumulationMap.entries()) {
            if (height > 0.01) {
                const [x, z] = key.split(',').map(Number);
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(x, height * 0.5, z);
                mesh.scale.set(1, height * 2, 1);
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                this.accumulationMeshes.push(mesh);
            }
        }
    }
    /**
     * Set snow intensity
     */
    setIntensity(intensity) {
        this.params.intensity = Math.max(0, Math.min(1, intensity));
    }
    /**
     * Set wind parameters
     */
    setWind(speed, direction) {
        this.params.windSpeed = speed;
        this.params.windDirection = direction.normalize();
    }
    /**
     * Set temperature (affects melting)
     */
    setTemperature(temp) {
        this.params.temperature = temp;
    }
    /**
     * Enable/disable accumulation
     */
    setAccumulationEnabled(enabled) {
        this.params.accumulationEnabled = enabled;
        if (!enabled) {
            this.accumulationMap.clear();
            this.accumulationMeshes.forEach(mesh => this.scene.remove(mesh));
            this.accumulationMeshes = [];
        }
    }
    /**
     * Clear all accumulated snow
     */
    clearAccumulation() {
        this.accumulationMap.clear();
        this.accumulationMeshes.forEach(mesh => this.scene.remove(mesh));
        this.accumulationMeshes = [];
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.snowMesh) {
            this.snowMesh.geometry.dispose();
            this.snowMesh.material.dispose();
            this.scene.remove(this.snowMesh);
        }
        this.accumulationMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
    }
}
export default SnowSystem;
//# sourceMappingURL=SnowSystem.js.map