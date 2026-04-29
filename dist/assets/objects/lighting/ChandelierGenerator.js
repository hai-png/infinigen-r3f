/**
 * Chandelier Generator
 *
 * Procedural ornate ceiling light fixtures inspired by Infinigen's indoor lighting system.
 * Generates various chandelier styles with customizable arms, crystals, and light sources.
 *
 * Features:
 * - Multiple chandelier styles (classic, modern, rustic, crystal, minimalist)
 * - Configurable arm count and arrangement
 * - Crystal/drop elements with glass materials
 * - Multiple light bulb types and arrangements
 * - Ornate decorative elements
 * - Material variations (brass, bronze, iron, gold, silver)
 * - LOD support for performance
 */
import * as THREE from 'three';
const DEFAULT_CHANDELIER_PARAMS = {
    style: 'classic',
    armCount: 6,
    tierCount: 2,
    radius: 1.5,
    height: 1.2,
    frameMaterial: 'brass',
    crystalType: 'crystal',
    crystalCount: 48,
    bulbType: 'candle',
    bulbCount: 6,
    bulbColor: new THREE.Color(0xffddaa),
    intensity: 1.5,
    hasOrnaments: true,
    ornamentDensity: 0.5,
    chainLength: 0.5,
    lodLevel: 0,
};
/**
 * Chandelier Generator Class
 */
export class ChandelierGenerator {
    constructor(params = {}) {
        this.params = { ...DEFAULT_CHANDELIER_PARAMS, ...params };
        this.group = new THREE.Group();
        this.materials = new Map();
        this.generate();
    }
    /**
     * Generate the complete chandelier
     */
    generate() {
        this.group.clear();
        this.materials.clear();
        // Create materials
        this.createFrameMaterial();
        this.createCrystalMaterial();
        this.createBulbMaterial();
        // Build structure
        this.createChain();
        this.createCentralColumn();
        this.createArms();
        this.createCrystals();
        this.createBulbs();
        this.createOrnaments();
        return this.group;
    }
    /**
     * Create frame material based on type
     */
    createFrameMaterial() {
        const materialConfig = {
            brass: { color: 0xffd700, metalness: 0.9, roughness: 0.2 },
            bronze: { color: 0xcd7f32, metalness: 0.8, roughness: 0.3 },
            iron: { color: 0x4a4a4a, metalness: 0.7, roughness: 0.4 },
            gold: { color: 0xffe55c, metalness: 1.0, roughness: 0.1 },
            silver: { color: 0xc0c0c0, metalness: 0.95, roughness: 0.15 },
            black_metal: { color: 0x1a1a1a, metalness: 0.6, roughness: 0.5 },
            chrome: { color: 0xe8e8e8, metalness: 1.0, roughness: 0.05 },
        };
        const config = materialConfig[this.params.frameMaterial];
        const material = new THREE.MeshStandardMaterial({
            color: config.color,
            metalness: config.metalness,
            roughness: config.roughness,
            name: 'frame',
        });
        this.materials.set('frame', material);
    }
    /**
     * Create crystal/glass material
     */
    createCrystalMaterial() {
        let color = 0xffffff;
        let transmission = 0.95;
        let opacity = 0.9;
        switch (this.params.crystalType) {
            case 'glass':
                color = 0xffffff;
                break;
            case 'crystal':
                color = 0xf0f0ff;
                transmission = 0.98;
                break;
            case 'amber':
                color = 0xffbf00;
                transmission = 0.85;
                break;
            case 'colored':
                color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5).getHex();
                transmission = 0.9;
                break;
        }
        const material = new THREE.MeshPhysicalMaterial({
            color: color,
            metalness: 0,
            roughness: 0.05,
            transmission: transmission,
            opacity: opacity,
            transparent: true,
            ior: 1.5,
            thickness: 0.5,
            envMapIntensity: 1.5,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            name: 'crystal',
        });
        this.materials.set('crystal', material);
    }
    /**
     * Create bulb emissive material
     */
    createBulbMaterial() {
        const material = new THREE.MeshStandardMaterial({
            color: this.params.bulbColor,
            emissive: this.params.bulbColor,
            emissiveIntensity: 2.0,
            metalness: 0,
            roughness: 0.3,
            name: 'bulb',
        });
        this.materials.set('bulb', material);
    }
    /**
     * Create hanging chain/rod
     */
    createChain() {
        const chainGeometry = new THREE.CylinderGeometry(0.02, 0.02, this.params.chainLength, 8);
        const chainMaterial = this.materials.get('frame');
        const chain = new THREE.Mesh(chainGeometry, chainMaterial);
        chain.position.y = this.params.height / 2 + this.params.chainLength / 2;
        this.group.add(chain);
        // Chain links if not minimalist
        if (this.params.style !== 'minimalist' && this.params.lodLevel < 2) {
            const linkGeometry = new THREE.TorusGeometry(0.03, 0.005, 4, 8);
            const linkCount = Math.floor(this.params.chainLength / 0.1);
            for (let i = 0; i < linkCount; i++) {
                const link = new THREE.Mesh(linkGeometry, chainMaterial);
                link.position.y = this.params.height / 2 + 0.05 + i * 0.1;
                link.rotation.x = Math.PI / 2;
                this.group.add(link);
            }
        }
    }
    /**
     * Create central column/spine
     */
    createCentralColumn() {
        const frameMaterial = this.materials.get('frame');
        // Main column
        const columnGeometry = new THREE.CylinderGeometry(0.08, 0.1, this.params.height, 8);
        const column = new THREE.Mesh(columnGeometry, frameMaterial);
        column.position.y = 0;
        this.group.add(column);
        // Decorative elements based on style
        if (this.params.style === 'classic' || this.params.style === 'crystal') {
            // Ornate top finial
            const finialGeometry = new THREE.SphereGeometry(0.12, 8, 8);
            const finial = new THREE.Mesh(finialGeometry, frameMaterial);
            finial.position.y = this.params.height / 2;
            this.group.add(finial);
            // Decorative base
            const baseGeometry = new THREE.CylinderGeometry(0.15, 0.12, 0.1, 8);
            const base = new THREE.Mesh(baseGeometry, frameMaterial);
            base.position.y = -this.params.height / 2;
            this.group.add(base);
        }
        else if (this.params.style === 'modern') {
            // Sleek spherical elements
            const sphereGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            const topSphere = new THREE.Mesh(sphereGeometry, frameMaterial);
            topSphere.position.y = this.params.height / 2;
            this.group.add(topSphere);
        }
    }
    /**
     * Create chandelier arms
     */
    createArms() {
        const frameMaterial = this.materials.get('frame');
        const angleStep = (Math.PI * 2) / this.params.armCount;
        for (let tier = 0; tier < this.params.tierCount; tier++) {
            const tierY = this.params.height / 2 - (tier / (this.params.tierCount - 1 || 1)) * (this.params.height * 0.7);
            const tierRadius = this.params.radius * (1 - tier * 0.2);
            for (let i = 0; i < this.params.armCount; i++) {
                const angle = i * angleStep;
                const armGroup = new THREE.Group();
                // Arm curve based on style
                if (this.params.style === 'classic' || this.params.style === 'crystal') {
                    // Curved ornate arm
                    const armPoints = [];
                    const segments = 20;
                    for (let s = 0; s <= segments; s++) {
                        const t = s / segments;
                        const x = Math.cos(angle) * tierRadius * t * (0.3 + 0.7 * Math.sin(t * Math.PI));
                        const z = Math.sin(angle) * tierRadius * t * (0.3 + 0.7 * Math.sin(t * Math.PI));
                        const y = -t * 0.2 + Math.sin(t * Math.PI) * 0.1;
                        armPoints.push(new THREE.Vector3(x, y, z));
                    }
                    const armCurve = new THREE.CatmullRomCurve3(armPoints);
                    const armGeometry = new THREE.TubeGeometry(armCurve, 20, 0.03, 8, false);
                    const arm = new THREE.Mesh(armGeometry, frameMaterial);
                    arm.position.y = tierY;
                    armGroup.add(arm);
                }
                else if (this.params.style === 'modern' || this.params.style === 'minimalist') {
                    // Straight angular arm
                    const armGeometry = new THREE.CylinderGeometry(0.025, 0.03, tierRadius * 0.7, 8);
                    const arm = new THREE.Mesh(armGeometry, frameMaterial);
                    arm.position.set(Math.cos(angle) * tierRadius * 0.35, tierY, Math.sin(angle) * tierRadius * 0.35);
                    arm.rotation.z = -Math.PI / 2;
                    arm.rotation.y = -angle;
                    armGroup.add(arm);
                }
                else if (this.params.style === 'rustic') {
                    // Irregular branch-like arm
                    const armGeometry = new THREE.CylinderGeometry(0.02, 0.04, tierRadius * 0.6, 6);
                    const arm = new THREE.Mesh(armGeometry, frameMaterial);
                    arm.position.set(Math.cos(angle) * tierRadius * 0.3, tierY, Math.sin(angle) * tierRadius * 0.3);
                    arm.rotation.z = -Math.PI / 2 + 0.1;
                    arm.rotation.y = -angle;
                    armGroup.add(arm);
                }
                else if (this.params.style === 'industrial') {
                    // Pipe-style arm with joints
                    const jointGeometry = new THREE.SphereGeometry(0.04, 8, 8);
                    const joint = new THREE.Mesh(jointGeometry, frameMaterial);
                    joint.position.set(Math.cos(angle) * tierRadius * 0.3, tierY, Math.sin(angle) * tierRadius * 0.3);
                    armGroup.add(joint);
                    const pipeGeometry = new THREE.CylinderGeometry(0.02, 0.02, tierRadius * 0.5, 8);
                    const pipe = new THREE.Mesh(pipeGeometry, frameMaterial);
                    pipe.position.set(Math.cos(angle) * tierRadius * 0.55, tierY, Math.sin(angle) * tierRadius * 0.55);
                    pipe.rotation.z = -Math.PI / 2;
                    pipe.rotation.y = -angle;
                    armGroup.add(pipe);
                }
                this.group.add(armGroup);
            }
        }
    }
    /**
     * Create hanging crystals/drops
     */
    createCrystals() {
        if (this.params.crystalType === 'none' || this.params.crystalCount === 0)
            return;
        const crystalMaterial = this.materials.get('crystal');
        const crystalPositions = this.generateCrystalPositions();
        crystalPositions.forEach((pos, index) => {
            const crystalType = index % 4;
            let crystalGeometry;
            switch (crystalType) {
                case 0: // Teardrop
                    crystalGeometry = new THREE.SphereGeometry(0.04, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
                    crystalGeometry.scale(1, 1.5, 1);
                    break;
                case 1: // Prism
                    crystalGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.15, 4);
                    break;
                case 2: // Sphere
                    crystalGeometry = new THREE.SphereGeometry(0.035, 8, 8);
                    break;
                case 3: // Diamond
                    crystalGeometry = new THREE.OctahedronGeometry(0.04);
                    break;
                default:
                    crystalGeometry = new THREE.SphereGeometry(0.03, 8, 8);
            }
            const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
            crystal.position.copy(pos);
            this.group.add(crystal);
            // Add chain/string for hanging
            if (this.params.lodLevel < 2) {
                const chainGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.08, 4);
                const chainMaterial = this.materials.get('frame');
                const chain = new THREE.Mesh(chainGeometry, chainMaterial);
                chain.position.set(pos.x, pos.y + 0.04, pos.z);
                this.group.add(chain);
            }
        });
    }
    /**
     * Generate crystal positions
     */
    generateCrystalPositions() {
        const positions = [];
        const angleStep = (Math.PI * 2) / this.params.armCount;
        for (let i = 0; i < this.params.crystalCount; i++) {
            const tier = Math.floor(i / (this.params.crystalCount / this.params.tierCount));
            const tierY = this.params.height / 2 - 0.2 - (tier / (this.params.tierCount - 1 || 1)) * (this.params.height * 0.6);
            const armIndex = i % this.params.armCount;
            const angle = armIndex * angleStep + (i % 2) * 0.1;
            const radiusFactor = 0.3 + Math.random() * 0.5;
            const radius = this.params.radius * radiusFactor;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = tierY - Math.random() * 0.3;
            positions.push(new THREE.Vector3(x, y, z));
        }
        return positions;
    }
    /**
     * Create light bulbs
     */
    createBulbs() {
        const bulbMaterial = this.materials.get('bulb');
        const angleStep = (Math.PI * 2) / this.params.bulbCount;
        for (let i = 0; i < this.params.bulbCount; i++) {
            const angle = i * angleStep;
            const bulbY = this.params.height / 2 - 0.15;
            const bulbRadius = this.params.radius * 0.5;
            let bulbGeometry;
            switch (this.params.bulbType) {
                case 'candle':
                    bulbGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8);
                    break;
                case 'edison':
                    bulbGeometry = new THREE.SphereGeometry(0.05, 8, 8);
                    bulbGeometry.scale(1, 1.3, 1);
                    break;
                case 'globe':
                    bulbGeometry = new THREE.SphereGeometry(0.06, 12, 12);
                    break;
                case 'tube':
                    bulbGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8);
                    break;
                case 'chandelier_bulb':
                    bulbGeometry = new THREE.SphereGeometry(0.03, 8, 8);
                    bulbGeometry.scale(1, 1.5, 1);
                    break;
                default:
                    bulbGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.1, 8);
            }
            const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
            bulb.position.set(Math.cos(angle) * bulbRadius, bulbY, Math.sin(angle) * bulbRadius);
            // Add point light
            const light = new THREE.PointLight(this.params.bulbColor, this.params.intensity, 5.0);
            light.position.copy(bulb.position);
            this.group.add(light);
            this.group.add(bulb);
        }
    }
    /**
     * Create decorative ornaments
     */
    createOrnaments() {
        if (!this.params.hasOrnaments || this.params.lodLevel > 1)
            return;
        const frameMaterial = this.materials.get('frame');
        const ornamentCount = Math.floor(this.params.armCount * this.params.ornamentDensity * 2);
        for (let i = 0; i < ornamentCount; i++) {
            const angle = (i / ornamentCount) * Math.PI * 2;
            const y = (Math.random() - 0.5) * this.params.height * 0.8;
            const radius = this.params.radius * (0.6 + Math.random() * 0.3);
            const ornamentGeometry = new THREE.SphereGeometry(0.03, 8, 8);
            const ornament = new THREE.Mesh(ornamentGeometry, frameMaterial);
            ornament.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
            this.group.add(ornament);
        }
    }
    /**
     * Get the generated group
     */
    getGroup() {
        return this.group;
    }
    /**
     * Update parameters and regenerate
     */
    updateParams(params) {
        this.params = { ...this.params, ...params };
        this.generate();
    }
    /**
     * Export to JSON
     */
    toJSON() {
        return {
            type: 'Chandelier',
            params: {
                ...this.params,
                bulbColor: this.params.bulbColor.getHex(),
            },
        };
    }
}
export default ChandelierGenerator;
//# sourceMappingURL=ChandelierGenerator.js.map