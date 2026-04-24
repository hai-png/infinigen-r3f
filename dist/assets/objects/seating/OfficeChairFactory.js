/**
 * OfficeChairFactory - Procedural office chair generator
 *
 * Ported from Infinigen's OfficeChairFactory (Princeton VL)
 * Generates ergonomic office chairs with adjustable components
 */
import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../../core/util/MathUtils';
/**
 * Procedural office chair generator with ergonomic features
 */
export class OfficeChairFactory extends AssetFactory {
    constructor(seed) {
        super(seed);
        this.backTypes = ['mesh', 'solid', 'slatted'];
        this.baseTypes = ['five-star', 'four-star', 'pedestal'];
    }
    /**
     * Generate random office chair configuration
     */
    generateConfig() {
        const rng = new SeededRandom(this.seed);
        const baseType = weightedSample(this.baseTypes, rng);
        const hasWheels = rng.uniform() < 0.8;
        return {
            // Seat dimensions
            seatWidth: rng.uniform(0.45, 0.55),
            seatDepth: rng.uniform(0.42, 0.50),
            seatHeight: rng.uniform(0.42, 0.52),
            backHeight: rng.uniform(0.55, 0.75),
            backWidth: rng.uniform(0.35, 0.45),
            // Seat shape
            seatThickness: rng.uniform(0.06, 0.12),
            seatPadding: rng.uniform(0.03, 0.08),
            seatFrontCurve: rng.uniform(0.0, 0.15),
            seatBackCurve: rng.uniform(0.0, 0.1),
            // Back
            backType: weightedSample(this.backTypes, rng),
            backTilt: rng.uniform(0.95, 1.05),
            lumbarSupport: rng.uniform() < 0.6,
            // Arms
            hasArms: rng.uniform() < 0.85,
            armHeight: rng.uniform(0.18, 0.25),
            armWidth: rng.uniform(0.06, 0.10),
            armPadding: rng.uniform() < 0.7,
            // Base
            baseType,
            baseRadius: rng.uniform(0.28, 0.35),
            hasWheels,
            wheelCount: baseType === 'five-star' ? 5 : 4,
            // Gas lift
            gasLiftHeight: rng.uniform(0.15, 0.25),
            gasLiftDiameter: rng.uniform(0.05, 0.08),
        };
    }
    /**
     * Create office chair from configuration
     */
    create(config) {
        const group = new THREE.Group();
        const materials = [];
        // Create base with wheels
        const base = this.createBase(config);
        group.add(base.mesh);
        materials.push(...base.materials);
        // Create gas lift column
        const gasLift = this.createGasLift(config);
        group.add(gasLift);
        materials.push(gasLift.material);
        // Create seat mechanism
        const mechanism = this.createMechanism(config);
        mechanism.position.y = config.gasLiftHeight;
        group.add(mechanism.mesh);
        materials.push(...mechanism.materials);
        // Create seat
        const seat = this.createSeat(config);
        seat.position.y = config.seatThickness / 2 + config.gasLiftHeight;
        group.add(seat.mesh);
        materials.push(...seat.materials);
        // Create backrest
        const backrest = this.createBackrest(config);
        backrest.position.set(0, config.gasLiftHeight + config.seatThickness + config.backHeight / 2, -config.seatDepth / 3);
        group.add(backrest.mesh);
        materials.push(...backrest.materials);
        // Create armrests if applicable
        if (config.hasArms) {
            const arms = this.createArmrests(config);
            arms.position.y = config.gasLiftHeight + config.seatThickness;
            group.add(arms.mesh);
            materials.push(...arms.materials);
        }
        return {
            mesh: group,
            config,
            materials,
        };
    }
    /**
     * Create chair base (star-shaped with optional wheels)
     */
    createBase(config) {
        const group = new THREE.Group();
        const materials = [];
        const material = this.createPlasticMaterial();
        const baseGeometry = new THREE.CylinderGeometry(config.baseRadius, config.baseRadius * 0.3, 0.05, config.wheelCount * 2);
        const base = new THREE.Mesh(baseGeometry, material);
        base.position.y = 0.025;
        group.add(base);
        materials.push(material);
        // Create legs
        for (let i = 0; i < config.wheelCount; i++) {
            const angle = (i / config.wheelCount) * Math.PI * 2;
            const legLength = config.baseRadius * 0.85;
            const legGeometry = new THREE.BoxGeometry(config.baseRadius * 0.15, 0.04, legLength);
            const leg = new THREE.Mesh(legGeometry, material);
            leg.position.set(Math.sin(angle) * legLength / 2, 0.02, Math.cos(angle) * legLength / 2);
            leg.rotation.y = -angle;
            group.add(leg);
            // Add wheels if applicable
            if (config.hasWheels) {
                const wheel = this.createWheel();
                wheel.position.set(Math.sin(angle) * legLength, 0.02, Math.cos(angle) * legLength);
                wheel.rotation.x = Math.PI / 2;
                group.add(wheel);
            }
        }
        return {
            mesh: group,
            config: {},
            materials,
        };
    }
    /**
     * Create gas lift cylinder
     */
    createGasLift(config) {
        const geometry = new THREE.CylinderGeometry(config.gasLiftDiameter / 2, config.gasLiftDiameter / 2, config.gasLiftHeight, 16);
        const material = this.createMetalMaterial();
        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.position.y = config.gasLiftHeight / 2;
        return Object.assign(cylinder, { material });
    }
    /**
     * Create seat mechanism
     */
    createMechanism(config) {
        const group = new THREE.Group();
        const materials = [];
        const geometry = new THREE.BoxGeometry(config.seatWidth * 0.6, 0.08, config.seatDepth * 0.4);
        const material = this.createMetalMaterial();
        const mechanism = new THREE.Mesh(geometry, material);
        group.add(mechanism);
        materials.push(material);
        return {
            mesh: group,
            config: {},
            materials,
        };
    }
    /**
     * Create seat cushion
     */
    createSeat(config) {
        const group = new THREE.Group();
        const materials = [];
        // Create main seat shape with curves
        const shape = new THREE.Shape();
        const w = config.seatWidth / 2;
        const d = config.seatDepth / 2;
        shape.moveTo(-w, -d);
        shape.lineTo(w, -d);
        shape.quadraticCurveTo(w, -d + config.seatFrontCurve, w * 0.7, d);
        shape.quadraticCurveTo(0, d + config.seatBackCurve, -w * 0.7, d);
        shape.quadraticCurveTo(-w, -d + config.seatFrontCurve, -w, -d);
        const extrudeSettings = {
            depth: config.seatThickness,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: 3,
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = this.createFabricMaterial();
        const seat = new THREE.Mesh(geometry, material);
        seat.rotation.x = Math.PI / 2;
        seat.position.z = -config.seatThickness / 2;
        group.add(seat);
        materials.push(material);
        // Add padding layer
        if (config.seatPadding > 0) {
            const paddingGeometry = new THREE.BoxGeometry(config.seatWidth * 0.9, config.seatPadding, config.seatDepth * 0.8);
            const paddingMaterial = this.createFoamMaterial();
            const padding = new THREE.Mesh(paddingGeometry, paddingMaterial);
            padding.position.y = config.seatThickness + config.seatPadding / 2;
            group.add(padding);
            materials.push(paddingMaterial);
        }
        return {
            mesh: group,
            config: {},
            materials,
        };
    }
    /**
     * Create backrest
     */
    createBackrest(config) {
        const group = new THREE.Group();
        const materials = [];
        let geometry;
        const material = config.backType === 'mesh'
            ? this.createMeshMaterial()
            : this.createFabricMaterial();
        switch (config.backType) {
            case 'mesh':
                geometry = new THREE.PlaneGeometry(config.backWidth, config.backHeight, 20, 20);
                break;
            case 'slatted':
                geometry = this.createSlattedBackGeometry(config);
                break;
            default: // solid
                geometry = new THREE.BoxGeometry(config.backWidth, config.backHeight, 0.03);
        }
        const backrest = new THREE.Mesh(geometry, material);
        backrest.rotation.x = (config.backTilt - 1) * 0.2;
        group.add(backrest);
        materials.push(material);
        // Add lumbar support
        if (config.lumbarSupport) {
            const lumbarGeometry = new THREE.BoxGeometry(config.backWidth * 0.6, 0.15, 0.05);
            const lumbar = new THREE.Mesh(lumbarGeometry, material);
            lumbar.position.set(0, config.backHeight * 0.3, 0.02);
            group.add(lumbar);
        }
        // Add frame
        const frameMaterial = this.createPlasticMaterial();
        const frameGeometry = new THREE.TorusGeometry(Math.max(config.backWidth, config.backHeight) / 2, 0.03, 8, 32);
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        group.add(frame);
        materials.push(frameMaterial);
        return {
            mesh: group,
            config: {},
            materials,
        };
    }
    /**
     * Create slatted back geometry
     */
    createSlattedBackGeometry(config) {
        const group = new THREE.Group();
        const slatCount = 8;
        const slatHeight = 0.04;
        const gap = (config.backHeight - slatCount * slatHeight) / (slatCount + 1);
        for (let i = 0; i < slatCount; i++) {
            const geometry = new THREE.BoxGeometry(config.backWidth, slatHeight, 0.03);
            const slat = new THREE.Mesh(geometry);
            slat.position.y = -config.backHeight / 2 + gap + i * (slatHeight + gap);
            group.add(slat);
        }
        // Merge geometries
        return this.mergeGroupGeometries(group);
    }
    /**
     * Create armrests
     */
    createArmrests(config) {
        const group = new THREE.Group();
        const materials = [];
        const armMaterial = config.armPadding
            ? this.createFoamMaterial()
            : this.createPlasticMaterial();
        for (const side of [-1, 1]) {
            const armGeometry = new THREE.BoxGeometry(config.armWidth, config.armHeight, config.seatDepth * 0.7);
            const arm = new THREE.Mesh(armGeometry, armMaterial);
            arm.position.set(side * (config.seatWidth / 2 + config.armWidth / 2), config.armHeight / 2, 0);
            group.add(arm);
            // Add arm support
            const supportGeometry = new THREE.CylinderGeometry(0.03, 0.04, config.gasLiftHeight * 0.5, 8);
            const supportMaterial = this.createMetalMaterial();
            const support = new THREE.Mesh(supportGeometry, supportMaterial);
            support.position.set(side * (config.seatWidth / 2 + 0.05), -config.armHeight / 2, config.seatDepth * 0.2);
            group.add(support);
            materials.push(supportMaterial);
        }
        materials.push(armMaterial);
        return {
            mesh: group,
            config: {},
            materials,
        };
    }
    /**
     * Create wheel caster
     */
    createWheel() {
        const geometry = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
        const material = this.createPlasticMaterial();
        const wheel = new THREE.Mesh(geometry, material);
        return wheel;
    }
    /**
     * Merge geometries from a group
     */
    mergeGroupGeometries(group) {
        // Simplified merge - in production would use BufferGeometryUtils
        const geometries = [];
        group.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                geometries.push(child.geometry.clone());
            }
        });
        if (geometries.length === 0) {
            return new THREE.BufferGeometry();
        }
        if (geometries.length === 1) {
            return geometries[0];
        }
        // For now, return first geometry as placeholder
        return geometries[0];
    }
    /**
     * Material creators
     */
    createPlasticMaterial() {
        const colors = [0x222222, 0x333333, 0x444444, 0x1a1a1a];
        return new THREE.MeshStandardMaterial({
            color: colors[Math.floor(this.rng.uniform() * colors.length)],
            roughness: 0.4,
            metalness: 0.1,
        });
    }
    createMetalMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.3,
            metalness: 0.8,
        });
    }
    createFabricMaterial() {
        const colors = [0x333333, 0x444455, 0x555566, 0x222233];
        return new THREE.MeshStandardMaterial({
            color: colors[Math.floor(this.rng.uniform() * colors.length)],
            roughness: 0.7,
            metalness: 0.0,
        });
    }
    createMeshMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.6,
            metalness: 0.0,
            transparent: true,
            opacity: 0.8,
        });
    }
    createFoamMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.8,
            metalness: 0.0,
        });
    }
}
//# sourceMappingURL=OfficeChairFactory.js.map