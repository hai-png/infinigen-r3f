/**
 * ChairFactory - Procedural chair generator
 *
 * Ported from Infinigen's ChairFactory (Princeton VL)
 * Generates varied chair designs with configurable legs, backs, arms, and materials
 */
import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../../core/util/MathUtils';
import { BezierCurveGenerator } from '../../utils/curves';
import { MeshUtils } from '../../utils/mesh';
export class ChairFactory extends AssetFactory {
    constructor(factorySeed, coarse = false) {
        super(factorySeed, coarse);
        this.curveGenerator = new BezierCurveGenerator();
        this.config = this.generateConfig();
    }
    /**
     * Generate random chair configuration
     */
    generateConfig() {
        const rng = new SeededRandom(this.factorySeed);
        // Basic dimensions
        const width = rng.uniform(0.4, 0.5);
        const size = rng.uniform(0.38, 0.45);
        const thickness = rng.uniform(0.04, 0.08);
        const bevelWidth = thickness * (rng.uniform() < 0.4 ? 0.1 : 0.5);
        // Seat parameters
        const seatBack = rng.uniform() < 0.75 ? rng.uniform(0.7, 1.0) : 1.0;
        const seatMid = rng.uniform(0.7, 0.8);
        const seatMidX = rng.uniform(seatBack + seatMid * (1 - seatBack), 1);
        const seatMidZ = rng.uniform(0, 0.5);
        const seatFront = rng.uniform(1.0, 1.2);
        const isSeatRound = rng.uniform() < 0.6;
        const isSeatSubsurf = rng.uniform() < 0.5;
        // Leg parameters
        const legThickness = rng.uniform(0.04, 0.06);
        const limbProfile = rng.uniform(1.5, 2.5);
        const legHeight = rng.uniform(0.45, 0.5);
        const backHeight = rng.uniform(0.4, 0.5);
        const isLegRound = rng.uniform() < 0.5;
        const legType = weightedSample(['vertical', 'straight', 'up-curved', 'down-curved']);
        // Initialize offsets
        let legXOffset = 0;
        let legYOffset = [0, 0];
        let backXOffset = 0;
        let backYOffset = 0;
        // Leg bars
        const hasLegXBar = rng.uniform() < 0.6;
        const hasLegYBar = rng.uniform() < 0.6;
        const legOffsetBar = [rng.uniform(0.2, 0.4), rng.uniform(0.6, 0.8)];
        // Arm parameters
        const hasArm = rng.uniform() < 0.7;
        const armThickness = rng.uniform(0.04, 0.06);
        const armHeight = armThickness * rng.uniform(0.6, 1);
        const armY = rng.uniform(0.8, 1) * size;
        const armZ = rng.uniform(0.3, 0.6) * backHeight;
        const armMid = new THREE.Vector3(rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.09), rng.uniform(-0.09, 0.03));
        const armProfile = [rng.logUniform(0.1, 3)];
        // Back parameters
        const backThickness = rng.uniform(0.04, 0.05);
        const backType = weightedSample(ChairFactory.BACK_TYPES);
        const backProfile = [[0, 1]];
        const backVerticalCuts = Math.floor(rng.uniform(1, 4));
        const backPartialScale = rng.uniform(1, 1.4);
        // Post-init offset calculations
        if (legType !== 'vertical') {
            legXOffset = width * rng.uniform(0.05, 0.2);
            legYOffset = [size * rng.uniform(0.05, 0.2), size * rng.uniform(0.05, 0.2)];
            backXOffset = width * rng.uniform(-0.1, 0.15);
            backYOffset = size * rng.uniform(0.1, 0.25);
        }
        // Back profile based on type
        let finalBackProfile = backProfile;
        switch (backType) {
            case 'partial':
                finalBackProfile = [[rng.uniform(0.4, 0.8), 1]];
                break;
            case 'horizontal-bar': {
                const nCuts = Math.floor(rng.uniform(2, 4));
                const locs = [];
                let sum = 0;
                for (let i = 0; i < nCuts; i++) {
                    sum += rng.uniform(1, 2);
                    locs.push(sum);
                }
                const total = locs[locs.length - 1];
                const ratio = rng.uniform(0.5, 0.75);
                const lowest = rng.uniform(0, 0.4);
                // Simplified profile calculation
                finalBackProfile = [[lowest, 1]];
                break;
            }
            case 'vertical-bar':
                finalBackProfile = [[rng.uniform(0.8, 0.9), 1]];
                break;
        }
        return {
            width, size, thickness, bevelWidth,
            seatBack, seatMid, seatMidX, seatMidZ, seatFront,
            isSeatRound, isSeatSubsurf,
            legThickness, limbProfile, legHeight, backHeight,
            isLegRound, legType,
            legXOffset, legYOffset, backXOffset, backYOffset,
            hasLegXBar, hasLegYBar, legOffsetBar,
            hasArm, armThickness, armHeight, armY, armZ, armMid, armProfile,
            backThickness, backType, backProfile: finalBackProfile,
            backVerticalCuts, backPartialScale
        };
    }
    /**
     * Create placeholder bounding box
     */
    createPlaceholder() {
        const c = this.config;
        const maxXOffset = Math.max(c.legXOffset, c.backXOffset);
        const xSize = c.width / 2 + maxXOffset;
        const ySize = c.size + c.legYOffset[1] + c.legThickness * 0.5;
        const zMin = -c.legHeight;
        const zMax = c.backHeight * 1.2;
        const geometry = new THREE.BoxGeometry(xSize * 2, ySize * 2, zMax - zMin);
        const material = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.z = Math.PI / 2;
        return mesh;
    }
    /**
     * Create complete chair asset
     */
    createAsset(params) {
        const group = new THREE.Group();
        // Create seat
        const seat = this.makeSeat();
        group.add(seat);
        // Create legs
        const legs = this.makeLegs();
        legs.forEach(leg => group.add(leg));
        // Create backs
        const backs = this.makeBacks();
        backs.forEach(back => group.add(back));
        // Create leg decorations (bars)
        const legDecors = this.makeLegDecors(legs);
        legDecors.forEach(decor => group.add(decor));
        // Create arms if enabled
        if (this.config.hasArm) {
            const arms = this.makeArms(seat, backs);
            arms.forEach(arm => group.add(arm));
        }
        // Create back decorations
        const backDecors = this.makeBackDecors(backs);
        backDecors.forEach(decor => group.add(decor));
        // Center the group
        MeshUtils.centerGeometry(group);
        return group;
    }
    /**
     * Generate seat mesh using bezier curves
     */
    makeSeat() {
        const c = this.config;
        const xAnchors = [0, 0.1, 1, c.seatMidX, c.seatBack, 0].map(x => x * c.width / 2);
        const yAnchors = [-c.seatFront, -c.seatFront, -1, -c.seatMid, 0, 0].map(y => y * c.size);
        const zAnchors = [0, 0, 0, c.seatMidZ, 0, 0].map(z => z * c.thickness);
        const vectorLocations = c.isSeatRound ? [4] : [2, 4];
        // Create base curve
        const curve = this.curveGenerator.createBezierCurve(xAnchors, yAnchors, zAnchors, vectorLocations);
        // Extrude to create surface
        const geometry = this.curveGenerator.extrudeCurve(curve, c.thickness);
        // Apply mirror modifier effect
        MeshUtils.applyMirror(geometry, 'x');
        // Add bevel
        if (c.bevelWidth > 0) {
            // Simplified bevel - in production would use proper bevel modifier
        }
        const material = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.7,
            metalness: 0.1
        });
        return new THREE.Mesh(geometry, material);
    }
    /**
     * Generate leg meshes
     */
    makeLegs() {
        const c = this.config;
        const legStarts = [
            new THREE.Vector3(-c.seatBack * c.width / 2, 0, 0),
            new THREE.Vector3(-c.width / 2, -c.size, 0),
            new THREE.Vector3(c.width / 2, -c.size, 0),
            new THREE.Vector3(c.seatBack * c.width / 2, 0, 0)
        ];
        const legEnds = legStarts.map((start, i) => {
            const end = start.clone();
            if (i === 0 || i === 1)
                end.x -= c.legXOffset;
            if (i === 2 || i === 3)
                end.x += c.legXOffset;
            if (i === 0 || i === 3)
                end.y += c.legYOffset[0];
            if (i === 1 || i === 2)
                end.y -= c.legYOffset[1];
            end.z = -c.legHeight;
            return end;
        });
        return this.makeLimbs(legEnds, legStarts);
    }
    /**
     * Generate limb segments (legs, backs)
     */
    makeLimbs(ends, starts) {
        const c = this.config;
        const limbs = [];
        for (let i = 0; i < starts.length; i++) {
            const start = starts[i];
            const end = ends[i];
            // Create curve between points
            const curve = new THREE.CatmullRomCurve3([start, end]);
            // Apply profile scaling based on leg type
            let axes = null;
            let scale = null;
            switch (c.legType) {
                case 'up-curved':
                    axes = [[0, 0, 1], [0, 0, 0]];
                    scale = [c.limbProfile, 1];
                    break;
                case 'down-curved':
                    axes = [[0, 0, 0], [0, 0, 1]];
                    scale = [1, c.limbProfile];
                    break;
            }
            // Create tube geometry
            const radius = c.legThickness / 2;
            const geometry = new THREE.TubeGeometry(curve, 8, radius, 8, false);
            // Apply location offset
            const locationOffset = new THREE.Vector3(end.x < 0 ? 1 : -1, end.y < -c.size / 2 ? 1 : -1, 0).multiplyScalar(c.legThickness / 2);
            geometry.translate(locationOffset.x, locationOffset.y, locationOffset.z);
            const material = new THREE.MeshStandardMaterial({
                color: 0x654321,
                roughness: 0.8,
                metalness: 0.1
            });
            const limb = new THREE.Mesh(geometry, material);
            limbs.push(limb);
        }
        return limbs;
    }
    /**
     * Generate back support meshes
     */
    makeBacks() {
        const c = this.config;
        const backStarts = [
            new THREE.Vector3(-c.seatBack * c.width / 2, 0, 0),
            new THREE.Vector3(c.seatBack * c.width / 2, 0, 0)
        ];
        const backEnds = backStarts.map((start, i) => {
            const end = start.clone();
            end.x += i === 0 ? c.backXOffset : -c.backXOffset;
            end.y = c.backYOffset;
            end.z = c.backHeight;
            return end;
        });
        return this.makeLimbs(backEnds, backStarts);
    }
    /**
     * Generate leg decoration bars
     */
    makeLegDecors(legs) {
        const decors = [];
        const c = this.config;
        if (c.hasLegXBar) {
            const zHeight = -c.legHeight * ((c.legOffsetBar[0] + c.legOffsetBar[1]) / 2);
            // Simplified bar creation
            const barGeo1 = new THREE.CylinderGeometry(c.legThickness / 2, c.legThickness / 2, c.width, 8);
            const bar1 = new THREE.Mesh(barGeo1, new THREE.MeshStandardMaterial({ color: 0x654321 }));
            bar1.position.set(0, 0, zHeight);
            decors.push(bar1);
        }
        if (c.hasLegYBar) {
            const zHeight = -c.legHeight * ((c.legOffsetBar[0] + c.legOffsetBar[1]) / 2);
            const barGeo2 = new THREE.CylinderGeometry(c.legThickness / 2, c.legThickness / 2, c.size, 8);
            const bar2 = new THREE.Mesh(barGeo2, new THREE.MeshStandardMaterial({ color: 0x654321 }));
            bar2.rotation.x = Math.PI / 2;
            bar2.position.set(0, -c.size / 2, zHeight);
            decors.push(bar2);
        }
        return decors;
    }
    /**
     * Generate back decoration panels
     */
    makeBackDecors(backs) {
        const parts = [];
        const c = this.config;
        if (backs.length >= 2) {
            // Create panel between backs
            const panelWidth = c.backThickness;
            const panelHeight = c.backHeight;
            const panelDepth = c.width * 0.8;
            const geometry = new THREE.BoxGeometry(panelWidth, panelDepth, panelHeight);
            const material = new THREE.MeshStandardMaterial({
                color: 0x8B4513,
                roughness: 0.7
            });
            const panel = new THREE.Mesh(geometry, material);
            panel.position.set(0, c.backYOffset / 2, panelHeight / 2);
            parts.push(panel);
        }
        return parts;
    }
    /**
     * Generate armrests
     */
    makeArms(base, backs) {
        const arms = [];
        const c = this.config;
        if (!c.hasArm || backs.length === 0)
            return arms;
        // Simplified arm creation
        const armLength = c.size * 0.8;
        const armGeo = new THREE.CylinderGeometry(c.armThickness / 2, c.armThickness / 2, armLength, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8
        });
        // Left arm
        const leftArm = new THREE.Mesh(armGeo, material);
        leftArm.rotation.x = Math.PI / 2;
        leftArm.position.set(-c.width / 2, -c.armY, c.armZ);
        arms.push(leftArm);
        // Right arm
        const rightArm = new THREE.Mesh(armGeo, material);
        rightArm.rotation.x = Math.PI / 2;
        rightArm.position.set(c.width / 2, -c.armY, c.armZ);
        arms.push(rightArm);
        return arms;
    }
}
ChairFactory.BACK_TYPES = ['whole', 'partial', 'horizontal-bar', 'vertical-bar'];
//# sourceMappingURL=ChairFactory.js.map