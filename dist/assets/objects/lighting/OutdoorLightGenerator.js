/**
 * Outdoor Light Generator
 *
 * Procedural generation of outdoor lighting fixtures including
 * street lights, garden lights, pathway lights, and flood lights.
 *
 * @module OutdoorLightGenerator
 */
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
export class OutdoorLightGenerator {
    constructor() {
        this.noise = createNoise3D();
    }
    /**
     * Generate an outdoor light fixture
     */
    generate(params = {}) {
        const finalParams = {
            type: params.type || 'street',
            style: params.style || 'modern',
            height: params.height || 4,
            poleThickness: params.poleThickness || 0.15,
            lightColor: params.lightColor || new THREE.Color(0xffeebb),
            intensity: params.intensity ?? 1.5,
            range: params.range ?? 20,
            coneAngle: params.coneAngle,
            materialType: params.materialType || 'metal',
            fixtureCount: params.fixtureCount || 1,
            decorative: params.decorative || false,
            solarPanel: params.solarPanel || false
        };
        const group = new THREE.Group();
        const lights = [];
        // Generate pole
        const pole = this.createPole(finalParams);
        group.add(pole);
        // Generate fixtures
        for (let i = 0; i < finalParams.fixtureCount; i++) {
            const fixture = this.createFixture(finalParams, i);
            group.add(fixture.mesh);
            lights.push(...fixture.lights);
        }
        // Add solar panel if requested
        if (finalParams.solarPanel) {
            const solarPanel = this.createSolarPanel(finalParams);
            group.add(solarPanel);
        }
        // Add decorative elements
        if (finalParams.decorative) {
            const decorations = this.createDecorations(finalParams);
            group.add(decorations);
        }
        return {
            mesh: group,
            lights,
            params: finalParams
        };
    }
    /**
     * Create the main pole structure
     */
    createPole(params) {
        const geometry = new THREE.CylinderGeometry(params.poleThickness * 0.8, params.poleThickness, params.height, 8, 1);
        const material = this.getPoleMaterial(params.materialType, params.style);
        const pole = new THREE.Mesh(geometry, material);
        pole.position.y = params.height / 2;
        pole.castShadow = true;
        pole.receiveShadow = true;
        return pole;
    }
    /**
     * Create light fixture at top of pole
     */
    createFixture(params, index = 0) {
        const group = new THREE.Group();
        const lights = [];
        const fixtureHeight = params.height - 0.3 - (index * 0.5);
        // Create arm/bracket
        const arm = this.createArm(params);
        arm.position.y = fixtureHeight;
        group.add(arm);
        // Create lamp housing
        const housing = this.createHousing(params);
        housing.position.copy(arm.position).add(this.getArmEndPosition(params));
        group.add(housing);
        // Create actual light source
        const light = this.createLightSource(params);
        light.position.copy(housing.position).add(new THREE.Vector3(0, -0.2, 0));
        group.add(light);
        lights.push(light);
        // Add lens/glass cover
        const lens = this.createLens(params);
        lens.position.copy(light.position);
        group.add(lens);
        return { mesh: group, lights };
    }
    /**
     * Create support arm based on style
     */
    createArm(params) {
        let geometry;
        const armLength = params.type === 'street' ? 1.5 : 0.8;
        switch (params.style) {
            case 'vintage':
                // Curved ornate arm
                geometry = new THREE.TorusGeometry(armLength, 0.03, 8, 20, Math.PI / 3);
                break;
            case 'industrial':
                // Angular metal arm
                geometry = new THREE.BoxGeometry(armLength, 0.05, 0.05);
                break;
            case 'decorative':
                // Ornamental curved arm
                geometry = new THREE.TorusGeometry(armLength, 0.04, 8, 24, Math.PI / 4);
                break;
            default:
                // Simple straight arm
                geometry = new THREE.BoxGeometry(armLength, 0.04, 0.04);
        }
        const material = this.getPoleMaterial(params.materialType, params.style);
        const arm = new THREE.Mesh(geometry, material);
        arm.rotation.z = -Math.PI / 2;
        arm.castShadow = true;
        return arm;
    }
    /**
     * Create lamp housing
     */
    createHousing(params) {
        let geometry;
        switch (params.type) {
            case 'flood':
                geometry = new THREE.BoxGeometry(0.6, 0.4, 0.15);
                break;
            case 'garden':
                geometry = new THREE.SphereGeometry(0.25, 16, 16);
                break;
            case 'bollard':
                geometry = new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8);
                break;
            default:
                geometry = new THREE.ConeGeometry(0.3, 0.4, 8);
        }
        const material = this.getPoleMaterial(params.materialType, params.style);
        const housing = new THREE.Mesh(geometry, material);
        housing.castShadow = true;
        return housing;
    }
    /**
     * Create actual light source
     */
    createLightSource(params) {
        const group = new THREE.Group();
        // Main spotlight/point light
        let light;
        if (params.type === 'flood' || params.coneAngle) {
            const coneAngle = params.coneAngle || Math.PI / 6;
            light = new THREE.SpotLight(params.lightColor, params.intensity, params.range, coneAngle, 0.5);
            light.castShadow = true;
        }
        else {
            light = new THREE.PointLight(params.lightColor, params.intensity, params.range);
            light.castShadow = true;
        }
        group.add(light);
        // Add visible bulb mesh
        const bulbGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const bulbMaterial = new THREE.MeshBasicMaterial({
            color: params.lightColor.clone().multiplyScalar(2),
            transparent: true,
            opacity: 0.9
        });
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
        group.add(bulb);
        return group;
    }
    /**
     * Create glass lens/cover
     */
    createLens(params) {
        const geometry = new THREE.SphereGeometry(0.26, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            transmission: 0.9,
            roughness: 0.1,
            metalness: 0
        });
        const lens = new THREE.Mesh(geometry, material);
        return lens;
    }
    /**
     * Create solar panel attachment
     */
    createSolarPanel(params) {
        const geometry = new THREE.BoxGeometry(0.6, 0.02, 0.4);
        const material = new THREE.MeshStandardMaterial({
            color: 0x1a1a3e,
            roughness: 0.3,
            metalness: 0.8
        });
        const panel = new THREE.Mesh(geometry, material);
        panel.position.set(0, params.height + 0.1, 0);
        panel.rotation.x = -Math.PI / 6; // Tilt towards sun
        panel.castShadow = true;
        return panel;
    }
    /**
     * Create decorative elements
     */
    createDecorations(params) {
        const group = new THREE.Group();
        if (params.style === 'vintage' || params.style === 'decorative') {
            // Add ornamental rings
            const ringGeometry = new THREE.TorusGeometry(params.poleThickness * 1.3, 0.02, 8, 16);
            const material = this.getPoleMaterial(params.materialType, params.style);
            for (let i = 0; i < 3; i++) {
                const ring = new THREE.Mesh(ringGeometry, material);
                ring.position.y = params.height * (0.3 + i * 0.2);
                group.add(ring);
            }
            // Add finial at top
            const finialGeometry = new THREE.SphereGeometry(params.poleThickness * 1.5, 8, 8);
            const finial = new THREE.Mesh(finialGeometry, material);
            finial.position.y = params.height + 0.1;
            group.add(finial);
        }
        return group;
    }
    /**
     * Get appropriate material for pole
     */
    getPoleMaterial(materialType, style) {
        switch (materialType) {
            case 'wood':
                return new THREE.MeshStandardMaterial({
                    color: 0x8b6f47,
                    roughness: 0.7,
                    metalness: 0
                });
            case 'concrete':
                return new THREE.MeshStandardMaterial({
                    color: 0x999999,
                    roughness: 0.9,
                    metalness: 0
                });
            case 'plastic':
                return new THREE.MeshStandardMaterial({
                    color: 0x333333,
                    roughness: 0.5,
                    metalness: 0.1
                });
            default: // metal
                const metalness = style === 'vintage' ? 0.3 : 0.7;
                const roughness = style === 'industrial' ? 0.4 : 0.2;
                return new THREE.MeshStandardMaterial({
                    color: style === 'vintage' ? 0x4a4a4a : 0x666666,
                    roughness,
                    metalness
                });
        }
    }
    /**
     * Get arm end position for fixture placement
     */
    getArmEndPosition(params) {
        const armLength = params.type === 'street' ? 1.5 : 0.8;
        return new THREE.Vector3(armLength, 0, 0);
    }
    /**
     * Generate a row of street lights
     */
    generateStreetLightRow(count, spacing, params = {}) {
        const group = new THREE.Group();
        const alternating = params.style === 'vintage';
        for (let i = 0; i < count; i++) {
            const lightParams = { ...params };
            if (alternating && i % 2 === 1) {
                // Alternate sides for vintage style
                lightParams.style = 'vintage';
            }
            const light = this.generate(lightParams);
            light.mesh.position.x = i * spacing;
            // Merge lights into single group
            group.add(light.mesh);
        }
        return group;
    }
    /**
     * Generate garden path lighting
     */
    generatePathwayLights(length, spacing, params = {}) {
        const finalParams = {
            ...params,
            type: params.type || 'bollard',
            height: params.height || 1.2,
            fixtureCount: 1
        };
        const group = new THREE.Group();
        const count = Math.floor(length / spacing);
        for (let i = 0; i < count; i++) {
            const light = this.generate(finalParams);
            light.mesh.position.set(0, 0, i * spacing);
            group.add(light.mesh);
        }
        return group;
    }
}
export default OutdoorLightGenerator;
//# sourceMappingURL=OutdoorLightGenerator.js.map