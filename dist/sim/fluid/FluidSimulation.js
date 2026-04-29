import * as THREE from 'three';
export class FluidSimulation {
    constructor(config = {}) {
        this.particles = [];
        this.geometry = null;
        this.points = null;
        this.enabled = true;
        this.spatialHash = new Map();
        this.config = {
            particleCount: 500,
            particleMass: 0.1,
            restDensity: 1000,
            gasConstant: 2000,
            viscosity: 250,
            h: 0.1,
            gravity: new THREE.Vector3(0, -9.81, 0),
            ...config,
        };
        this.bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
        this.initializeParticles();
    }
    initializeParticles() {
        const { particleCount, h } = this.config;
        // Initialize particles in a grid pattern
        const gridSize = Math.ceil(Math.cbrt(particleCount));
        const spacing = h * 0.5;
        let count = 0;
        for (let x = 0; x < gridSize && count < particleCount; x++) {
            for (let y = 0; y < gridSize && count < particleCount; y++) {
                for (let z = 0; z < gridSize && count < particleCount; z++) {
                    const px = (x - gridSize / 2) * spacing;
                    const py = (y - gridSize / 2) * spacing + 0.5;
                    const pz = (z - gridSize / 2) * spacing;
                    this.particles.push({
                        position: new THREE.Vector3(px, py, pz),
                        velocity: new THREE.Vector3(0, 0, 0),
                        acceleration: new THREE.Vector3(0, 0, 0),
                        density: 0,
                        pressure: 0,
                    });
                    count++;
                }
            }
        }
        this.createVisualization();
    }
    createVisualization() {
        const { particleCount } = this.config;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        // Initialize with blue color
        for (let i = 0; i < particleCount; i++) {
            colors[i * 3] = 0.2;
            colors[i * 3 + 1] = 0.4;
            colors[i * 3 + 2] = 0.9;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
        });
        this.points = new THREE.Points(geometry, material);
        this.geometry = geometry;
    }
    step(dt) {
        if (!this.enabled || this.particles.length === 0)
            return;
        dt = Math.min(dt, 0.02);
        const substeps = 4;
        const subDt = dt / substeps;
        for (let step = 0; step < substeps; step++) {
            this.updateSpatialHash();
            this.computeDensityPressure();
            this.computeForces();
            this.integrate(subDt);
            this.handleBoundaries();
        }
        this.updateVisualization();
    }
    hashPosition(pos) {
        const cellSize = this.config.h;
        const x = Math.floor(pos.x / cellSize);
        const y = Math.floor(pos.y / cellSize);
        const z = Math.floor(pos.z / cellSize);
        return `${x},${y},${z}`;
    }
    updateSpatialHash() {
        this.spatialHash.clear();
        for (let i = 0; i < this.particles.length; i++) {
            const hash = this.hashPosition(this.particles[i].position);
            if (!this.spatialHash.has(hash)) {
                this.spatialHash.set(hash, []);
            }
            this.spatialHash.get(hash).push(i);
        }
    }
    getNeighbors(particleIdx) {
        const pos = this.particles[particleIdx].position;
        const neighbors = [];
        const cellSize = this.config.h;
        const cx = Math.floor(pos.x / cellSize);
        const cy = Math.floor(pos.y / cellSize);
        const cz = Math.floor(pos.z / cellSize);
        // Check 27 neighboring cells (3x3x3)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const hash = `${cx + dx},${cy + dy},${cz + dz}`;
                    const cell = this.spatialHash.get(hash);
                    if (cell) {
                        neighbors.push(...cell);
                    }
                }
            }
        }
        return neighbors;
    }
    poly6Kernel(r) {
        const { h } = this.config;
        if (r >= 0 && r <= h) {
            const factor = 315 / (64 * Math.PI * Math.pow(h, 9));
            return factor * Math.pow(h * h - r * r, 3);
        }
        return 0;
    }
    spikyGradient(r) {
        const { h } = this.config;
        if (r >= 0 && r <= h) {
            const factor = -45 / (Math.PI * Math.pow(h, 6));
            return factor * Math.pow(h - r, 2);
        }
        return 0;
    }
    viscosityLaplacian(r) {
        const { h } = this.config;
        if (r >= 0 && r <= h) {
            const factor = 45 / (Math.PI * Math.pow(h, 6));
            return factor * (h - r);
        }
        return 0;
    }
    computeDensityPressure() {
        const { particleMass, restDensity, gasConstant } = this.config;
        for (let i = 0; i < this.particles.length; i++) {
            let density = 0;
            const neighbors = this.getNeighbors(i);
            for (const j of neighbors) {
                const r = this.particles[i].position.distanceTo(this.particles[j].position);
                density += particleMass * this.poly6Kernel(r);
            }
            this.particles[i].density = density;
            this.particles[i].pressure = gasConstant * (density - restDensity);
        }
    }
    computeForces() {
        const { particleMass, viscosity, restDensity } = this.config;
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const force = new THREE.Vector3(0, 0, 0);
            // Pressure force
            const pressureForce = new THREE.Vector3(0, 0, 0);
            const viscosityForce = new THREE.Vector3(0, 0, 0);
            const neighbors = this.getNeighbors(i);
            for (const j of neighbors) {
                if (i === j)
                    continue;
                const neighbor = this.particles[j];
                const r = particle.position.distanceTo(neighbor.position);
                if (r < 0.001)
                    continue;
                const dir = particle.position.clone().sub(neighbor.position).normalize();
                // Pressure force contribution
                const pressureTerm = (particle.pressure + neighbor.pressure) / (2 * neighbor.density);
                const spikyGrad = this.spikyGradient(r);
                pressureForce.add(dir.multiplyScalar(-particleMass * pressureTerm * spikyGrad));
                // Viscosity force contribution
                const viscTerm = this.viscosityLaplacian(r);
                viscosityForce.add(neighbor.velocity.clone().sub(particle.velocity).multiplyScalar(viscTerm / neighbor.density));
            }
            viscosityForce.multiplyScalar(viscosity * particleMass);
            // Add gravity
            force.add(this.config.gravity.clone().multiplyScalar(particleMass));
            force.add(pressureForce);
            force.add(viscosityForce);
            particle.acceleration.copy(force.divideScalar(particleMass));
        }
    }
    integrate(dt) {
        for (const particle of this.particles) {
            // Update velocity
            particle.velocity.add(particle.acceleration.clone().multiplyScalar(dt));
            // Update position
            particle.position.add(particle.velocity.clone().multiplyScalar(dt));
        }
    }
    handleBoundaries() {
        const { bounds } = this;
        const damping = 0.3;
        for (const particle of this.particles) {
            // X boundaries
            if (particle.position.x < bounds.min.x) {
                particle.position.x = bounds.min.x;
                particle.velocity.x *= -damping;
            }
            else if (particle.position.x > bounds.max.x) {
                particle.position.x = bounds.max.x;
                particle.velocity.x *= -damping;
            }
            // Y boundaries
            if (particle.position.y < bounds.min.y) {
                particle.position.y = bounds.min.y;
                particle.velocity.y *= -damping;
            }
            else if (particle.position.y > bounds.max.y) {
                particle.position.y = bounds.max.y;
                particle.velocity.y *= -damping;
            }
            // Z boundaries
            if (particle.position.z < bounds.min.z) {
                particle.position.z = bounds.min.z;
                particle.velocity.z *= -damping;
            }
            else if (particle.position.z > bounds.max.z) {
                particle.position.z = bounds.max.z;
                particle.velocity.z *= -damping;
            }
        }
    }
    updateVisualization() {
        if (!this.geometry)
            return;
        const positions = this.geometry.getAttribute('position');
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
        }
        positions.needsUpdate = true;
    }
    getPoints() {
        return this.points;
    }
    addForce(position, force, radius = 0.2) {
        for (const particle of this.particles) {
            const dist = particle.position.distanceTo(position);
            if (dist < radius) {
                const influence = 1 - dist / radius;
                particle.acceleration.add(force.clone().multiplyScalar(influence));
            }
        }
    }
    reset() {
        this.particles = [];
        this.initializeParticles();
    }
    setGravity(gravity) {
        this.config.gravity.copy(gravity);
    }
    dispose() {
        if (this.geometry) {
            this.geometry.dispose();
        }
        if (this.points) {
            this.points.material.dispose();
        }
    }
}
export default FluidSimulation;
//# sourceMappingURL=FluidSimulation.js.map