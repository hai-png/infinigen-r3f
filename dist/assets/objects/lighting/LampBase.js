/**
 * LampBase - Abstract base class for procedural lamp generation
 *
 * Provides common functionality for all lamp types including:
 * - Base structures (various shapes and materials)
 * - Stem/pole systems
 * - Shade attachments
 * - Bulb/socket simulation
 * - Light emission integration
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class LampBase extends BaseObjectGenerator {
    constructor() {
        super();
        this.defaultParams = {
            style: 'modern',
            baseMaterial: 'metal',
            shadeMaterial: 'fabric',
            shadeShape: 'cylinder',
            bulbType: 'led',
            hasDimmer: false,
            cordLength: 1.8,
            switchType: 'inline',
        };
    }
    validateParams(params) {
        const validated = { ...params };
        if (validated.cordLength !== undefined) {
            validated.cordLength = Math.max(1.0, Math.min(3.0, validated.cordLength));
        }
        return validated;
    }
    /**
     * Generate the lamp base structure
     */
    generateBase(params, width = 0.2, height = 0.15) {
        const group = new Group();
        const material = this.getBaseMaterial(params.baseMaterial, params.style);
        if (params.style === 'modern' || params.style === 'minimal') {
            // Sleek geometric base
            const baseGeo = params.style === 'modern'
                ? new BoxGeometry(width, height, width)
                : new CylinderGeometry(width / 2, width / 2, height * 0.6, 32);
            const base = new Mesh(baseGeo, material);
            base.position.y = height / 2;
            group.add(base);
        }
        else if (params.style === 'traditional') {
            // Ornate turned base
            const segments = [
                { radius: width / 2, height: 0.03, y: 0.015 },
                { radius: width / 3, height: 0.04, y: 0.05 },
                { radius: width / 2, height: 0.05, y: 0.095 },
                { radius: width / 2.5, height: 0.04, y: 0.14 },
                { radius: width / 2, height: 0.03, y: 0.175 },
            ];
            segments.forEach(seg => {
                const segGeo = new CylinderGeometry(seg.radius, seg.radius, seg.height, 16);
                const segMesh = new Mesh(segGeo, material);
                segMesh.position.y = seg.y;
                group.add(segMesh);
            });
        }
        else if (params.style === 'industrial') {
            // Heavy industrial base with visible hardware
            const baseGeo = new CylinderGeometry(width / 2, width / 2 + 0.05, height, 8);
            const base = new Mesh(baseGeo, material);
            base.position.y = height / 2;
            group.add(base);
            // Add visible bolts
            const boltCount = 4;
            for (let i = 0; i < boltCount; i++) {
                const angle = (i / boltCount) * Math.PI * 2;
                const boltGeo = new CylinderGeometry(0.015, 0.015, 0.03, 8);
                const boltMat = this.getMetalMaterial('steel');
                const bolt = new Mesh(boltGeo, boltMat);
                bolt.position.set(Math.cos(angle) * (width / 2 - 0.03), height / 2, Math.sin(angle) * (width / 2 - 0.03));
                group.add(bolt);
            }
        }
        else if (params.style === 'art-deco') {
            // Stepped art deco base
            const steps = [
                { size: width, height: 0.04, y: 0.02 },
                { size: width * 0.75, height: 0.05, y: 0.065 },
                { size: width * 0.5, height: 0.06, y: 0.12 },
            ];
            steps.forEach(step => {
                const stepGeo = new BoxGeometry(step.size, step.height, step.size);
                const stepMesh = new Mesh(stepGeo, material);
                stepMesh.position.y = step.y;
                group.add(stepMesh);
            });
        }
        else {
            // Default simple base
            const baseGeo = new CylinderGeometry(width / 2, width / 2, height, 16);
            const base = new Mesh(baseGeo, material);
            base.position.y = height / 2;
            group.add(base);
        }
        return group;
    }
    /**
     * Generate the stem/pole connecting base to shade
     */
    generateStem(params, height = 0.4, diameter = 0.03) {
        let geometry;
        if (params.style === 'industrial') {
            // Pipe-style stem with fittings
            const stemGroup = new Group();
            const pipeGeo = new CylinderGeometry(diameter, diameter, height, 16);
            const pipeMat = this.getMetalMaterial('steel');
            const pipe = new Mesh(pipeGeo, pipeMat);
            pipe.position.y = height / 2;
            stemGroup.add(pipe);
            // Add pipe fittings
            const fittingGeo = new CylinderGeometry(diameter * 1.3, diameter * 1.3, 0.04, 16);
            const fitting1 = new Mesh(fittingGeo, pipeMat);
            fitting1.position.y = 0.02;
            stemGroup.add(fitting1);
            const fitting2 = new Mesh(fittingGeo, pipeMat);
            fitting2.position.y = height - 0.02;
            stemGroup.add(fitting2);
            // Return first mesh for type compatibility (caller should handle Group)
            return pipe;
        }
        else if (params.style === 'art-deco') {
            // Tapered art deco stem
            geometry = new CylinderGeometry(diameter * 0.7, diameter * 1.3, height, 16);
        }
        else if (params.baseMaterial === 'wood') {
            // Turned wood stem
            geometry = new CylinderGeometry(diameter * 0.8, diameter * 1.1, height, 16);
        }
        else {
            // Standard cylindrical stem
            geometry = new CylinderGeometry(diameter, diameter, height, 16);
        }
        const material = this.getBaseMaterial(params.baseMaterial, params.style);
        const stem = new Mesh(geometry, material);
        stem.position.y = height / 2;
        return stem;
    }
    /**
     * Generate the lampshade
     */
    generateShade(params, topRadius = 0.15, bottomRadius = 0.25, height = 0.25) {
        let geometry;
        switch (params.shadeShape) {
            case 'cone':
                geometry = new ConeGeometry(bottomRadius, height, 32, 1, true);
                break;
            case 'sphere':
                geometry = new SphereGeometry(bottomRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
                break;
            case 'rectangle':
                // Rectangular prism shade (open bottom)
                const boxGeo = new BoxGeometry(bottomRadius * 2, height, bottomRadius * 2);
                // Would need CSG to hollow out - using solid for now
                geometry = boxGeo;
                break;
            case 'empire':
                // Empire shape - wider at bottom, curved sides
                geometry = new CylinderGeometry(topRadius, bottomRadius * 1.1, height, 32, 1, true);
                break;
            case 'cylinder':
            default:
                geometry = new CylinderGeometry(topRadius, bottomRadius, height, 32, 1, true);
                break;
        }
        const material = this.getShadeMaterial(params.shadeMaterial, params.style);
        const shade = new Mesh(geometry, material);
        shade.position.y = height / 2;
        return shade;
    }
    /**
     * Generate bulb and socket assembly
     */
    generateBulbAssembly(params) {
        const group = new Group();
        // Socket
        const socketGeo = new CylinderGeometry(0.025, 0.03, 0.06, 16);
        const socketMat = this.createPBRMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.4 });
        const socket = new Mesh(socketGeo, socketMat);
        socket.position.y = 0.03;
        group.add(socket);
        // Bulb based on type
        let bulbGeo;
        let bulbMat;
        switch (params.bulbType) {
            case 'edison':
                // Vintage Edison bulb with visible filament
                bulbGeo = new SphereGeometry(0.04, 16, 16);
                bulbMat = this.createPBRMaterial({
                    color: 0xffdd88,
                    emissive: 0xffaa44,
                    emissiveIntensity: 0.8,
                    transparent: true,
                    opacity: 0.8
                });
                break;
            case 'fluorescent':
                // Spiral CFL bulb
                bulbGeo = new CylinderGeometry(0.02, 0.02, 0.08, 8);
                bulbMat = this.createPBRMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.9 });
                break;
            case 'halogen':
                // Small halogen capsule
                bulbGeo = new CylinderGeometry(0.015, 0.015, 0.04, 16);
                bulbMat = this.createPBRMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 1.0 });
                break;
            case 'led':
            default:
                // Modern LED bulb shape
                bulbGeo = new SphereGeometry(0.035, 16, 16);
                bulbMat = this.createPBRMaterial({
                    color: 0xffffff,
                    emissive: 0xffffee,
                    emissiveIntensity: 0.95,
                    transparent: true,
                    opacity: 0.9
                });
                break;
        }
        const bulb = new Mesh(bulbGeo, bulbMat);
        bulb.position.y = 0.08;
        group.add(bulb);
        // Edison bulb filament detail
        if (params.bulbType === 'edison') {
            const filamentGeo = new CylinderGeometry(0.002, 0.002, 0.03, 4);
            const filamentMat = this.createEmissiveMaterial(0xff8800, 1.0);
            for (let i = 0; i < 5; i++) {
                const filament = new Mesh(filamentGeo, filamentMat);
                filament.position.x = (i - 2) * 0.008;
                filament.position.y = 0.08;
                group.add(filament);
            }
        }
        return group;
    }
    /**
     * Generate power cord
     */
    generateCord(params, length) {
        const cordGeo = new CylinderGeometry(0.005, 0.005, length, 8);
        const cordMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.0, roughness: 0.8 });
        const cord = new Mesh(cordGeo, cordMat);
        cord.position.y = -length / 2;
        return cord;
    }
    /**
     * Generate switch based on type
     */
    generateSwitch(params) {
        switch (params.switchType) {
            case 'pull-chain':
                const chainGeo = new CylinderGeometry(0.003, 0.003, 0.15, 8);
                const chainMat = this.getMetalMaterial('brass');
                const chain = new Mesh(chainGeo, chainMat);
                const pullGeo = new SphereGeometry(0.015, 8, 8);
                const pull = new Mesh(pullGeo, chainMat);
                pull.position.y = -0.075;
                chain.add(pull);
                return chain;
            case 'inline':
                // Inline switch on cord - handled separately
                return null;
            case 'base':
                const baseSwitchGeo = new CylinderGeometry(0.015, 0.015, 0.02, 16);
                const baseSwitchMat = this.createPBRMaterial({ color: 0x444444, metalness: 0.3, roughness: 0.5 });
                return new Mesh(baseSwitchGeo, baseSwitchMat);
            case 'touch':
                // Touch switch - no visible component
                return null;
            default:
                return null;
        }
    }
    /**
     * Material helpers
     */
    getBaseMaterial(material, style) {
        switch (material) {
            case 'metal':
                return this.getMetalMaterial(style === 'industrial' ? 'steel' : 'brushed-nickel');
            case 'wood':
                return this.createPBRMaterial({
                    color: style === 'traditional' ? 0x6b4423 : 0x8b6f47,
                    metalness: 0.0,
                    roughness: 0.7,
                });
            case 'ceramic':
                return this.createPBRMaterial({
                    color: style === 'art-deco' ? 0x224466 : 0xdddddd,
                    metalness: 0.1,
                    roughness: 0.3,
                });
            case 'glass':
                return this.createPBRMaterial({
                    color: 0xaaccff,
                    metalness: 0.9,
                    roughness: 0.05,
                    transparent: true,
                    opacity: 0.5,
                });
            case 'stone':
                return this.createPBRMaterial({
                    color: 0x888888,
                    metalness: 0.0,
                    roughness: 0.8,
                });
            default:
                return this.getMetalMaterial('brushed-nickel');
        }
    }
    getShadeMaterial(material, style) {
        switch (material) {
            case 'fabric':
                return this.createPBRMaterial({
                    color: style === 'traditional' ? 0xf5f5dc : style === 'modern' ? 0x333333 : 0xffffff,
                    metalness: 0.0,
                    roughness: 1.0,
                    side: 2, // DoubleSide
                });
            case 'paper':
                return this.createPBRMaterial({
                    color: 0xfff8e8,
                    metalness: 0.0,
                    roughness: 0.9,
                    transparent: true,
                    opacity: 0.85,
                    side: 2,
                });
            case 'glass':
                return this.createPBRMaterial({
                    color: 0xccddff,
                    metalness: 0.5,
                    roughness: 0.1,
                    transparent: true,
                    opacity: 0.4,
                    side: 2,
                });
            case 'metal':
                return this.getMetalMaterial(style === 'industrial' ? 'painted-steel' : 'aluminum');
            case 'plastic':
            default:
                return this.createPBRMaterial({
                    color: 0xffffff,
                    metalness: 0.0,
                    roughness: 0.6,
                    side: 2,
                });
        }
    }
    getMetalMaterial(type) {
        const configs = {
            'steel': { color: 0xaaaaaa, metalness: 0.9, roughness: 0.3 },
            'brushed-nickel': { color: 0xcccccc, metalness: 0.95, roughness: 0.2 },
            'brass': { color: 0xccaa44, metalness: 0.9, roughness: 0.25 },
            'bronze': { color: 0x886633, metalness: 0.85, roughness: 0.35 },
            'aluminum': { color: 0xdddddd, metalness: 0.9, roughness: 0.15 },
            'painted-steel': { color: 0x333333, metalness: 0.7, roughness: 0.4 },
        };
        const config = configs[type] || configs['steel'];
        return this.createPBRMaterial(config);
    }
    getBoundingBox(params) {
        return {
            min: { x: -0.3, y: 0, z: -0.3 },
            max: { x: 0.3, y: params.style === 'floor' ? 1.5 : 0.7, z: 0.3 },
        };
    }
    getCollisionMesh(params) {
        const geometry = new CylinderGeometry(0.15, 0.2, 0.5, 16);
        return this.createMesh(geometry, this.getCollisionMaterial());
    }
    getRandomParams() {
        const styles = ['modern', 'traditional', 'industrial', 'minimal', 'art-deco'];
        const baseMaterials = ['metal', 'wood', 'ceramic', 'glass', 'stone'];
        const shadeMaterials = ['fabric', 'paper', 'glass', 'metal', 'plastic'];
        const shadeShapes = ['cylinder', 'cone', 'sphere', 'rectangle', 'empire'];
        const bulbTypes = ['edison', 'led', 'fluorescent', 'halogen'];
        const switchTypes = ['pull-chain', 'inline', 'base', 'touch'];
        return {
            style: styles[Math.floor(Math.random() * styles.length)],
            baseMaterial: baseMaterials[Math.floor(Math.random() * baseMaterials.length)],
            shadeMaterial: shadeMaterials[Math.floor(Math.random() * shadeMaterials.length)],
            shadeShape: shadeShapes[Math.floor(Math.random() * shadeShapes.length)],
            bulbType: bulbTypes[Math.floor(Math.random() * bulbTypes.length)],
            hasDimmer: Math.random() > 0.7,
            cordLength: 1.5 + Math.random(),
            switchType: switchTypes[Math.floor(Math.random() * switchTypes.length)],
        };
    }
}
//# sourceMappingURL=LampBase.js.map