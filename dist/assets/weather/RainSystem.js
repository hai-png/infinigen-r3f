/**
 * Rain Particle System
 *
 * High-performance rain simulation using instanced rendering
 * with wind effects, splash particles, and surface interaction.
 *
 * @module RainSystem
 */
import * as THREE from 'three';
export class RainSystem {
    constructor(scene, params = {}) {
        this.rainMesh = null;
        this.splashMesh = null;
        this.maxDrops = 10000;
        this.maxSplashes = 2000;
        this.scene = scene;
        this.params = {
            intensity: params.intensity ?? 0.7,
            windSpeed: params.windSpeed ?? 5,
            windDirection: params.windDirection || new THREE.Vector3(1, 0, 0),
            dropSize: params.dropSize ?? 0.02,
            fallSpeed: params.fallSpeed ?? 15,
            splashEnabled: params.splashEnabled ?? true,
            dripFromSurfaces: params.dripFromSurfaces ?? false
        };
        this.dummy = new THREE.Object3D();
        this.rainData = new Float32Array(this.maxDrops * 4); // x, y, z, velocity
        this.initializeRain();
        if (this.params.splashEnabled) {
            this.initializeSplashes();
        }
    }
    /**
     * Initialize rain drop instanced mesh
     */
    initializeRain() {
        const geometry = new THREE.CylinderGeometry(0.005, 0.01, 0.3, 4);
        geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
        this.rainMesh = new THREE.InstancedMesh(geometry, material, this.maxDrops);
        this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.rainMesh);
        // Initialize drop positions
        for (let i = 0; i < this.maxDrops; i++) {
            this.resetDrop(i);
        }
    }
    /**
     * Initialize splash particle system
     */
    initializeSplashes() {
        const geometry = new THREE.SphereGeometry(0.02, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });
        this.splashMesh = new THREE.InstancedMesh(geometry, material, this.maxSplashes);
        this.splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.splashMesh);
        // Initialize splashes as inactive
        for (let i = 0; i < this.maxSplashes; i++) {
            this.dummy.position.set(0, -100, 0);
            this.dummy.updateMatrix();
            this.splashMesh.setMatrixAt(i, this.dummy.matrix);
        }
    }
    /**
     * Reset a single rain drop to top of simulation volume
     */
    resetDrop(index) {
        const x = (Math.random() - 0.5) * 100;
        const y = Math.random() * 50 + 20;
        const z = (Math.random() - 0.5) * 100;
        const velocity = this.params.fallSpeed * (0.8 + Math.random() * 0.4);
        this.rainData[index * 4] = x;
        this.rainData[index * 4 + 1] = y;
        this.rainData[index * 4 + 2] = z;
        this.rainData[index * 4 + 3] = velocity;
    }
    /**
     * Update rain simulation
     */
    update(deltaTime) {
        if (!this.rainMesh)
            return;
        const activeDrops = Math.floor(this.maxDrops * this.params.intensity);
        const windX = this.params.windDirection.x * this.params.windSpeed * deltaTime;
        const windZ = this.params.windDirection.z * this.params.windSpeed * deltaTime;
        for (let i = 0; i < activeDrops; i++) {
            let y = this.rainData[i * 4 + 1];
            let x = this.rainData[i * 4];
            let z = this.rainData[i * 4 + 2];
            const velocity = this.rainData[i * 4 + 3];
            // Update position
            y -= velocity * deltaTime;
            x += windX;
            z += windZ;
            // Check for ground collision
            if (y < 0) {
                // Create splash
                if (this.params.splashEnabled && this.splashMesh && Math.random() < 0.3) {
                    this.createSplash(x, 0, z);
                }
                // Reset drop
                this.resetDrop(i);
                x = this.rainData[i * 4];
                y = this.rainData[i * 4 + 1];
                z = this.rainData[i * 4 + 2];
            }
            // Update stored data
            this.rainData[i * 4] = x;
            this.rainData[i * 4 + 1] = y;
            this.rainData[i * 4 + 2] = z;
            // Update instance matrix
            this.dummy.position.set(x, y, z);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            this.rainMesh.setMatrixAt(i, this.dummy.matrix);
        }
        // Hide inactive drops
        for (let i = activeDrops; i < this.maxDrops; i++) {
            this.dummy.position.set(0, -1000, 0);
            this.dummy.updateMatrix();
            this.rainMesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.rainMesh.instanceMatrix.needsUpdate = true;
        // Update splashes
        this.updateSplashes(deltaTime);
    }
    /**
     * Create splash at position
     */
    createSplash(x, y, z) {
        if (!this.splashMesh)
            return;
        // Find inactive splash
        for (let i = 0; i < this.maxSplashes; i++) {
            this.dummy.matrixNeedsUpdate = true;
            this.splashMesh.getMatrixAt(i, this.dummy.matrix);
            if (this.dummy.position.y < -50) {
                this.dummy.position.set(x, y + 0.02, z);
                this.dummy.scale.set(0.5, 0.1, 0.5);
                this.dummy.updateMatrix();
                this.splashMesh.setMatrixAt(i, this.dummy.matrix);
                // Store lifetime in userData
                this.splashMesh.userData[`splash_${i}`] = {
                    birth: Date.now(),
                    lifetime: 300
                };
                break;
            }
        }
    }
    /**
     * Update splash particles
     */
    updateSplashes(deltaTime) {
        if (!this.splashMesh)
            return;
        const now = Date.now();
        for (let i = 0; i < this.maxSplashes; i++) {
            const splashData = this.splashMesh.userData[`splash_${i}`];
            if (splashData) {
                const age = now - splashData.birth;
                if (age > splashData.lifetime) {
                    // Deactivate splash
                    this.dummy.position.set(0, -100, 0);
                    this.dummy.scale.set(0, 0, 0);
                    this.dummy.updateMatrix();
                    this.splashMesh.setMatrixAt(i, this.dummy.matrix);
                    delete this.splashMesh.userData[`splash_${i}`];
                }
                else {
                    // Expand and fade
                    const progress = age / splashData.lifetime;
                    const scale = 0.5 + progress * 0.5;
                    const alpha = 1 - progress;
                    this.splashMesh.getMatrixAt(i, this.dummy.matrix);
                    this.dummy.scale.set(scale, 0.05, scale);
                    this.dummy.updateMatrix();
                    this.splashMesh.setMatrixAt(i, this.dummy.matrix);
                    this.splashMesh.material.opacity = alpha * 0.8;
                }
            }
        }
        this.splashMesh.instanceMatrix.needsUpdate = true;
    }
    /**
     * Set rain intensity
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
     * Enable/disable splashes
     */
    setSplashesEnabled(enabled) {
        this.params.splashEnabled = enabled;
        if (this.splashMesh) {
            this.splashMesh.visible = enabled;
        }
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.rainMesh) {
            this.rainMesh.geometry.dispose();
            this.rainMesh.material.dispose();
            this.scene.remove(this.rainMesh);
        }
        if (this.splashMesh) {
            this.splashMesh.geometry.dispose();
            this.splashMesh.material.dispose();
            this.scene.remove(this.splashMesh);
        }
    }
}
export default RainSystem;
//# sourceMappingURL=RainSystem.js.map