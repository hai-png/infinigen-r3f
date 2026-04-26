/**
 * Ceiling Light Fixtures Generator
 * Generates various ceiling-mounted lighting fixtures
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';
export class CeilingLights extends BaseObjectGenerator {
    constructor() {
        super();
        this.category = 'lighting';
        this.subcategory = 'ceiling';
    }
    getDefaultParams() {
        return {
            fixtureType: 'flush',
            width: 0.4,
            depth: 0.4,
            height: 0.15,
            numLights: 1,
            style: 'modern',
            material: 'metal',
            color: '#FFFFFF',
            lightColor: '#FFF5E1',
            intensity: 800,
            dimmable: false,
            shadeShape: 'dome',
            chainLength: 0.5,
        };
    }
    generate(params = {}) {
        const finalParams = { ...this.getDefaultParams(), ...params };
        const group = new THREE.Group();
        let fixture;
        switch (finalParams.fixtureType) {
            case 'flush':
                fixture = this.createFlushMount(finalParams);
                break;
            case 'semi-flush':
                fixture = this.createSemiFlush(finalParams);
                break;
            case 'pendant':
                fixture = this.createPendant(finalParams);
                break;
            case 'chandelier':
                fixture = this.createChandelier(finalParams);
                break;
            case 'track':
                fixture = this.createTrackLighting(finalParams);
                break;
            case 'recessed':
                fixture = this.createRecessed(finalParams);
                break;
            default:
                fixture = this.createFlushMount(finalParams);
        }
        // Generate collision mesh
        const collisionMesh = this.generateCollisionMesh(fixture);
        fixture.userData.collisionMesh = collisionMesh;
        // Add light source
        this.addLightSource(fixture, finalParams);
        group.add(fixture);
        return group;
    }
    createFlushMount(params) {
        const group = new THREE.Group();
        // Base plate
        const baseRadius = params.width / 2;
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius, 0.03, 32);
        const baseMaterial = this.getMaterial(params.material, params.color);
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = params.height / 2 + 0.015;
        group.add(base);
        // Shade
        const shadeGeometry = this.createShadeGeometry(params.shadeShape, baseRadius * 0.8, params.height - 0.03);
        const shadeMaterial = params.material === 'glass' || params.material === 'crystal'
            ? new THREE.MeshPhysicalMaterial({
                transparent: true,
                opacity: 0.3,
                roughness: 0.1,
                transmission: 0.9
            })
            : this.getMaterial(params.material, params.color);
        const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
        shade.position.y = -params.height / 2 + 0.015;
        group.add(shade);
        // Decorative elements based on style
        if (params.style === 'traditional' || params.style === 'crystal') {
            this.addCrystalAccents(group, params);
        }
        return group;
    }
    createSemiFlushMount(params) {
        const group = new THREE.Group();
        // Mounting plate
        const plateRadius = params.width / 2;
        const plateGeometry = new THREE.CylinderGeometry(plateRadius, plateRadius, 0.02, 32);
        const plateMaterial = this.getMaterial(params.material, params.color);
        const plate = new THREE.Mesh(plateGeometry, plateMaterial);
        plate.position.y = params.height + 0.01;
        group.add(plate);
        // Stem
        const stemRadius = 0.03;
        const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius, params.height * 0.4, 16);
        const stem = new THREE.Mesh(stemGeometry, plateMaterial);
        stem.position.y = params.height * 0.8;
        group.add(stem);
        // Shade
        const shadeRadius = params.width * 0.7;
        const shadeGeometry = this.createShadeGeometry(params.shadeShape, shadeRadius, params.height * 0.6);
        const shadeMaterial = this.getShadeMaterial(params);
        const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
        shade.position.y = params.height * 0.3;
        group.add(shade);
        return group;
    }
    createPendant(params) {
        const group = new THREE.Group();
        // Canopy
        const canopyRadius = 0.08;
        const canopyGeometry = new THREE.CylinderGeometry(canopyRadius, canopyRadius, 0.03, 32);
        const canopyMaterial = this.getMaterial(params.material, params.color);
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.position.y = params.chainLength + params.height / 2 + 0.015;
        group.add(canopy);
        // Chain/Cord
        const chainGeometry = new THREE.CylinderGeometry(0.01, 0.01, params.chainLength, 8);
        const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
        const chain = new THREE.Mesh(chainGeometry, chainMaterial);
        chain.position.y = params.chainLength / 2;
        group.add(chain);
        // Fixture body
        const fixtureRadius = params.width / 2;
        const fixtureGeometry = this.createShadeGeometry(params.shadeShape, fixtureRadius, params.height);
        const fixtureMaterial = this.getShadeMaterial(params);
        const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
        group.add(fixture);
        return group;
    }
    createChandelier(params) {
        const group = new THREE.Group();
        // Central column
        const columnRadius = 0.05;
        const columnGeometry = new THREE.CylinderGeometry(columnRadius, columnRadius * 0.8, params.height, 16);
        const columnMaterial = this.getMaterial(params.material === 'crystal' ? 'metal' : params.material, params.color);
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        group.add(column);
        // Arms
        const numArms = Math.max(3, params.numLights);
        const armRadius = params.width / 2;
        for (let i = 0; i < numArms; i++) {
            const angle = (i / numArms) * Math.PI * 2;
            const armGroup = new THREE.Group();
            // Arm
            const armGeometry = new THREE.TorusGeometry(armRadius * 0.3, 0.015, 8, 32, Math.PI);
            const armMaterial = this.getMaterial('metal', params.style === 'crystal' ? '#C0C0C0' : params.color);
            const arm = new THREE.Mesh(armGeometry, armMaterial);
            arm.rotation.x = Math.PI / 2;
            arm.rotation.z = angle;
            armGroup.add(arm);
            // Light socket
            const socketGeometry = new THREE.CylinderGeometry(0.03, 0.04, 0.08, 16);
            const socket = new THREE.Mesh(socketGeometry, armMaterial);
            socket.position.set(Math.cos(angle) * armRadius, -0.1, Math.sin(angle) * armRadius);
            armGroup.add(socket);
            // Crystal drops or shade
            if (params.style === 'crystal') {
                this.addCrystalDrop(armGroup, Math.cos(angle) * armRadius, -0.2, Math.sin(angle) * armRadius);
            }
            else {
                const shadeGeometry = this.createShadeGeometry('cone', 0.08, 0.15);
                const shadeMaterial = this.getShadeMaterial(params);
                const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
                shade.position.set(Math.cos(angle) * armRadius, -0.15, Math.sin(angle) * armRadius);
                armGroup.add(shade);
            }
            armGroup.rotation.y = angle;
            group.add(armGroup);
        }
        // Central crystal cluster
        if (params.style === 'crystal') {
            this.addCrystalCluster(group, params.height * 0.7);
        }
        return group;
    }
    createTrackLighting(params) {
        const group = new THREE.Group();
        // Track
        const trackLength = params.width;
        const trackGeometry = new THREE.BoxGeometry(trackLength, 0.05, 0.08);
        const trackMaterial = this.getMaterial('metal', params.color);
        const track = new THREE.Mesh(trackGeometry, trackMaterial);
        group.add(track);
        // Light heads
        const spacing = trackLength / (params.numLights + 1);
        for (let i = 0; i < params.numLights; i++) {
            const headGroup = new THREE.Group();
            // Mount
            const mountGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16);
            const mount = new THREE.Mesh(mountGeometry, trackMaterial);
            headGroup.add(mount);
            // Head
            const headGeometry = new THREE.CylinderGeometry(0.04, 0.05, 0.12, 16);
            const headMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.3 });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.rotation.x = Math.PI / 4;
            head.position.y = -0.05;
            headGroup.add(head);
            headGroup.position.x = -trackLength / 2 + spacing * (i + 1);
            headGroup.position.y = -0.05;
            group.add(headGroup);
        }
        return group;
    }
    createRecessed(params) {
        const group = new THREE.Group();
        // Trim ring
        const outerRadius = params.width / 2;
        const innerRadius = outerRadius * 0.7;
        const trimGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 32);
        const trimMaterial = new THREE.MeshStandardMaterial({ color: params.color, metalness: 0.3, roughness: 0.5 });
        const trim = new THREE.Mesh(trimGeometry, trimMaterial);
        trim.rotation.x = Math.PI / 2;
        group.add(trim);
        // Inner baffle
        const baffleGeometry = new THREE.CylinderGeometry(innerRadius, innerRadius * 0.9, 0.08, 32, 1, true);
        const baffleMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, side: THREE.DoubleSide });
        const baffle = new THREE.Mesh(baffleGeometry, baffleMaterial);
        baffle.position.y = -0.04;
        group.add(baffle);
        return group;
    }
    createShadeGeometry(shape, radius, height) {
        switch (shape) {
            case 'dome':
                return new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            case 'drum':
                return new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
            case 'globe':
                return new THREE.SphereGeometry(radius, 32, 32, 0, Math.PI * 2, 0, Math.PI);
            case 'cylinder':
                return new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
            case 'cone':
                return new THREE.ConeGeometry(radius, height, 32, 1, true);
            default:
                return new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        }
    }
    getShadeMaterial(params) {
        if (params.material === 'glass' || params.material === 'crystal') {
            return new THREE.MeshPhysicalMaterial({
                transparent: true,
                opacity: 0.4,
                roughness: 0.1,
                transmission: 0.9,
                color: params.color,
            });
        }
        else if (params.material === 'fabric') {
            return new THREE.MeshStandardMaterial({
                color: params.color,
                roughness: 0.8,
                metalness: 0.0,
            });
        }
        else {
            return this.getMaterial(params.material, params.color);
        }
    }
    addCrystalAccents(group, params) {
        const crystalMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xFFFFFF,
            metalness: 0.0,
            roughness: 0.0,
            transmission: 1.0,
            transparent: true,
        });
        // Add hanging crystals
        const numCrystals = 8;
        for (let i = 0; i < numCrystals; i++) {
            const angle = (i / numCrystals) * Math.PI * 2;
            const radius = params.width * 0.4;
            const crystalGeometry = new THREE.OctahedronGeometry(0.03);
            const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
            crystal.position.set(Math.cos(angle) * radius, -params.height * 0.3, Math.sin(angle) * radius);
            group.add(crystal);
        }
    }
    addCrystalDrop(group, x, y, z) {
        const crystalMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xFFFFFF,
            metalness: 0.0,
            roughness: 0.0,
            transmission: 1.0,
        });
        const dropGeometry = new THREE.TeardropShape ? new THREE.LatheGeometry(new Float32Array([0, 0, 0.02, 0.05, 0.01, 0.08, 0, 0.1]), 16) : new THREE.OctahedronGeometry(0.02);
        const drop = new THREE.Mesh(dropGeometry, crystalMaterial);
        drop.position.set(x, y, z);
        group.add(drop);
    }
    addCrystalCluster(group, yPos) {
        const crystalMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xFFFFFF,
            metalness: 0.0,
            roughness: 0.0,
            transmission: 1.0,
        });
        for (let i = 0; i < 5; i++) {
            const size = 0.02 + Math.random() * 0.02;
            const crystalGeometry = new THREE.OctahedronGeometry(size);
            const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
            crystal.position.set((Math.random() - 0.5) * 0.1, yPos - i * 0.03, (Math.random() - 0.5) * 0.1);
            group.add(crystal);
        }
    }
    addLightSource(object, params) {
        const light = new THREE.PointLight(params.lightColor, params.intensity, 10);
        light.position.y = -params.height * 0.3;
        object.add(light);
        if (params.dimmable) {
            object.userData.dimmable = true;
            object.userData.baseIntensity = params.intensity;
        }
    }
    getRandomParams() {
        const fixtureTypes = ['flush', 'semi-flush', 'pendant', 'chandelier', 'track'];
        const styles = ['modern', 'traditional', 'industrial', 'crystal', 'farmhouse'];
        const materials = ['metal', 'glass', 'crystal', 'wood', 'fabric'];
        const shapes = ['dome', 'drum', 'globe', 'cylinder', 'cone'];
        return {
            fixtureType: fixtureTypes[Math.floor(Math.random() * fixtureTypes.length)],
            width: 0.3 + Math.random() * 0.6,
            depth: 0.3 + Math.random() * 0.6,
            height: 0.1 + Math.random() * 0.4,
            numLights: Math.floor(Math.random() * 5) + 1,
            style: styles[Math.floor(Math.random() * styles.length)],
            material: materials[Math.floor(Math.random() * materials.length)],
            shadeShape: shapes[Math.floor(Math.random() * shapes.length)],
            chainLength: Math.random() * 0.8,
            dimmable: Math.random() > 0.7,
        };
    }
    validateParams(params) {
        return (params.width > 0.1 && params.width < 2.0 &&
            params.height > 0.05 && params.height < 1.5 &&
            params.numLights >= 1 && params.numLights <= 12);
    }
}
// Register the generator
ObjectRegistry.register('ceiling_lights', CeilingLights, {
    category: 'lighting',
    subcategory: 'ceiling',
    description: 'Ceiling-mounted light fixtures including flush mounts, pendants, and chandeliers',
});
//# sourceMappingURL=CeilingLights.js.map