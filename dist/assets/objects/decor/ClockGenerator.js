/**
 * ClockGenerator - Procedural clock generation with various styles
 * Generates wall clocks, mantel clocks, grandfather clocks, and digital clocks
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
import { NoiseUtils } from '../../utils/NoiseUtils';
export class ClockGenerator extends BaseObjectGenerator {
    constructor() {
        super();
        this.defaultParams = {
            style: 'wall',
            materialType: 'wood',
            faceStyle: 'analog',
            size: 'medium',
            hasPendulum: false,
            hasChime: false,
            ornateLevel: 0,
            seed: undefined
        };
        this.noise = new NoiseUtils();
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        if (finalParams.seed !== undefined) {
            this.noise.setSeed(finalParams.seed);
        }
        const group = new Group();
        switch (finalParams.style) {
            case 'wall':
                this.createWallClock(group, finalParams);
                break;
            case 'mantel':
                this.createMantelClock(group, finalParams);
                break;
            case 'grandfather':
                this.createGrandfatherClock(group, finalParams);
                break;
            case 'digital':
                this.createDigitalClock(group, finalParams);
                break;
            case 'cuckoo':
                this.createCuckooClock(group, finalParams);
                break;
            case 'pendulum':
                this.createPendulumClock(group, finalParams);
                break;
            case 'alarm':
                this.createAlarmClock(group, finalParams);
                break;
        }
        return group;
    }
    createWallClock(group, params) {
        const size = this.getSizeMultiplier(params.size);
        const radius = 0.15 * size;
        const depth = 0.03 * size;
        // Clock body/frame
        const bodyMat = this.getMaterialByType(params.materialType);
        if (params.ornateLevel > 0) {
            // Ornate frame with torus details
            const frameGeom = new TorusGeometry(radius + 0.02 * size, 0.015 * size, 8, 32);
            const frame = new Mesh(frameGeom, bodyMat);
            group.add(frame);
            // Add decorative elements based on ornate level
            for (let i = 0; i < params.ornateLevel * 4; i++) {
                const angle = (i / (params.ornateLevel * 4)) * Math.PI * 2;
                const decorGeom = new SphereGeometry(0.008 * size, 8, 8);
                const decor = new Mesh(decorGeom, bodyMat);
                decor.position.set(Math.cos(angle) * (radius + 0.02 * size), Math.sin(angle) * (radius + 0.02 * size), 0);
                group.add(decor);
            }
        }
        else {
            // Simple circular body
            const bodyGeom = new CylinderGeometry(radius, radius, depth, 32);
            const body = new Mesh(bodyGeom, bodyMat);
            body.rotation.x = Math.PI / 2;
            group.add(body);
        }
        // Clock face
        const faceGeom = new CylinderGeometry(radius * 0.9, radius * 0.9, 0.005, 32);
        const faceMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const face = new Mesh(faceGeom, faceMat);
        face.position.z = depth / 2 + 0.003;
        group.add(face);
        // Clock hands
        this.createClockHands(group, radius * 0.7, params.faceStyle, bodyMat);
        // Mounting hardware
        const hookGeom = new CylinderGeometry(0.005, 0.005, 0.02, 8);
        const hook = new Mesh(hookGeom, new MeshStandardMaterial({ color: 0x888888, metalness: 0.8 }));
        hook.rotation.x = Math.PI / 2;
        hook.position.y = radius + 0.01;
        group.add(hook);
    }
    createMantelClock(group, params) {
        const size = this.getSizeMultiplier(params.size);
        const width = 0.25 * size;
        const height = 0.15 * size;
        const depth = 0.08 * size;
        const bodyMat = this.getMaterialByType(params.materialType);
        // Main body
        const bodyGeom = new BoxGeometry(width, height, depth);
        const body = new Mesh(bodyGeom, bodyMat);
        body.position.y = height / 2;
        group.add(body);
        // Decorative top
        if (params.ornateLevel > 0) {
            const topGeom = new CylinderGeometry(width * 0.6, width * 0.5, 0.03 * size, 16);
            const top = new Mesh(topGeom, bodyMat);
            top.position.y = height + 0.015 * size;
            group.add(top);
        }
        // Clock face
        const faceRadius = Math.min(width, height) * 0.35;
        const faceGeom = new CylinderGeometry(faceRadius, faceRadius, 0.005, 32);
        const faceMat = new MeshStandardMaterial({ color: 0xfffff0, roughness: 0.3 });
        const face = new Mesh(faceGeom, faceMat);
        face.position.set(0, height * 0.55, depth / 2 + 0.003);
        face.rotation.x = 0;
        group.add(face);
        // Hands
        this.createClockHands(group, faceRadius * 0.7, params.faceStyle, bodyMat, true);
        // Feet
        const footGeom = new SphereGeometry(0.015 * size, 8, 8);
        const footMat = new MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6 });
        const positions = [
            [-width / 2 + 0.02, 0, depth / 2 - 0.02],
            [width / 2 - 0.02, 0, depth / 2 - 0.02],
            [-width / 2 + 0.02, 0, -depth / 2 + 0.02],
            [width / 2 - 0.02, 0, -depth / 2 + 0.02]
        ];
        positions.forEach(pos => {
            const foot = new Mesh(footGeom, footMat);
            foot.position.set(...pos);
            group.add(foot);
        });
    }
    createGrandfatherClock(group, params) {
        const size = this.getSizeMultiplier(params.size);
        const width = 0.3 * size;
        const height = 1.2 * size;
        const depth = 0.25 * size;
        const bodyMat = this.getMaterialByType(params.materialType);
        // Main tower
        const towerGeom = new BoxGeometry(width, height * 0.7, depth);
        const tower = new Mesh(towerGeom, bodyMat);
        tower.position.y = height * 0.35;
        group.add(tower);
        // Top section (hood)
        const hoodGeom = new BoxGeometry(width * 1.1, height * 0.25, depth * 1.05);
        const hood = new Mesh(hoodGeom, bodyMat);
        hood.position.y = height * 0.825;
        group.add(hood);
        // Base
        const baseGeom = new BoxGeometry(width * 1.15, height * 0.15, depth * 1.1);
        const base = new Mesh(baseGeom, bodyMat);
        base.position.y = height * 0.075;
        group.add(base);
        // Clock face
        const faceRadius = width * 0.35;
        const faceGeom = new CylinderGeometry(faceRadius, faceRadius, 0.008, 32);
        const faceMat = new MeshStandardMaterial({ color: 0xffffee, roughness: 0.2 });
        const face = new Mesh(faceGeom, faceMat);
        face.position.set(0, height * 0.45, depth / 2 + 0.005);
        group.add(face);
        // Hands
        this.createClockHands(group, faceRadius * 0.7, params.faceStyle, bodyMat, true);
        // Pendulum (if enabled)
        if (params.hasPendulum) {
            this.createPendulum(group, height * 0.3, depth, bodyMat);
        }
        // Decorative columns
        if (params.ornateLevel > 0) {
            const columnGeom = new CylinderGeometry(0.02 * size, 0.02 * size, height * 0.5, 8);
            const columnPositions = [
                [-width / 2 + 0.03, height * 0.35, depth / 2 + 0.02],
                [width / 2 - 0.03, height * 0.35, depth / 2 + 0.02]
            ];
            columnPositions.forEach(pos => {
                const column = new Mesh(columnGeom, bodyMat);
                column.position.set(...pos);
                group.add(column);
            });
        }
    }
    createDigitalClock(group, params) {
        const size = this.getSizeMultiplier(params.size);
        const width = 0.2 * size;
        const height = 0.08 * size;
        const depth = 0.04 * size;
        const bodyMat = this.getMaterialByType(params.materialType);
        // Main body (rectangular)
        const bodyGeom = new BoxGeometry(width, height, depth);
        const body = new Mesh(bodyGeom, bodyMat);
        group.add(body);
        // Display screen
        const screenGeom = new BoxGeometry(width * 0.85, height * 0.6, 0.005);
        const screenMat = new MeshStandardMaterial({
            color: 0x111111,
            emissive: 0x003300,
            emissiveIntensity: 0.3
        });
        const screen = new Mesh(screenGeom, screenMat);
        screen.position.z = depth / 2 + 0.003;
        group.add(screen);
        // Stand/legs
        const legGeom = new BoxGeometry(0.02 * size, 0.03 * size, depth * 0.8);
        const legPositions = [
            [-width / 2 + 0.03, -height / 2 - 0.015, 0],
            [width / 2 - 0.03, -height / 2 - 0.015, 0]
        ];
        legPositions.forEach(pos => {
            const leg = new Mesh(legGeom, bodyMat);
            leg.position.set(...pos);
            group.add(leg);
        });
        // Buttons
        const buttonGeom = new CylinderGeometry(0.008, 0.008, 0.005, 8);
        const buttonMat = new MeshStandardMaterial({ color: 0x333333 });
        for (let i = 0; i < 4; i++) {
            const button = new Mesh(buttonGeom, buttonMat);
            button.position.set(-width / 4 + i * 0.04, 0, depth / 2 + 0.005);
            group.add(button);
        }
    }
    createCuckooClock(group, params) {
        const size = this.getSizeMultiplier(params.size);
        // House-shaped body
        const houseWidth = 0.2 * size;
        const houseHeight = 0.25 * size;
        const houseDepth = 0.15 * size;
        const bodyMat = this.getMaterialByType(params.materialType);
        // Main house body
        const houseGeom = new BoxGeometry(houseWidth, houseHeight * 0.7, houseDepth);
        const house = new Mesh(houseGeom, bodyMat);
        house.position.y = houseHeight * 0.35;
        group.add(house);
        // Roof
        const roofGeom = new CylinderGeometry(houseWidth * 0.6, houseWidth * 0.6, houseDepth * 1.2, 3, 1, false, 0, Math.PI * 2, true);
        const roof = new Mesh(roofGeom, bodyMat);
        roof.rotation.z = Math.PI / 4;
        roof.rotation.y = Math.PI / 2;
        roof.position.y = houseHeight * 0.8;
        group.add(roof);
        // Clock face
        const faceRadius = houseWidth * 0.25;
        const faceGeom = new CylinderGeometry(faceRadius, faceRadius, 0.005, 32);
        const faceMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const face = new Mesh(faceGeom, faceMat);
        face.position.set(0, houseHeight * 0.4, houseDepth / 2 + 0.003);
        group.add(face);
        // Hands
        this.createClockHands(group, faceRadius * 0.7, params.faceStyle, bodyMat);
        // Cuckoo bird door
        const doorGeom = new BoxGeometry(0.04 * size, 0.05 * size, 0.005);
        const door = new Mesh(doorGeom, bodyMat);
        door.position.set(0, houseHeight * 0.55, houseDepth / 2 + 0.003);
        group.add(door);
        // Pinecone weights
        if (params.hasPendulum) {
            const weightGeom = new CylinderGeometry(0.015, 0.01, 0.04, 8);
            const weightMat = new MeshStandardMaterial({ color: 0x8B4513 });
            const weight1 = new Mesh(weightGeom, weightMat);
            weight1.position.set(-houseWidth / 3, -houseHeight * 0.3, 0);
            group.add(weight1);
            const weight2 = new Mesh(weightGeom, weightMat);
            weight2.position.set(houseWidth / 3, -houseHeight * 0.3, 0);
            group.add(weight2);
        }
    }
    createPendulumClock(group, params) {
        // Similar to wall clock but with pendulum
        this.createWallClock(group, { ...params, style: 'wall' });
        if (params.hasPendulum) {
            const size = this.getSizeMultiplier(params.size);
            const bodyMat = this.getMaterialByType(params.materialType);
            this.createPendulum(group, 0.15 * size, 0.03 * size, bodyMat);
        }
    }
    createAlarmClock(group, params) {
        const size = this.getSizeMultiplier(params.size);
        const radius = 0.1 * size;
        const depth = 0.06 * size;
        const bodyMat = this.getMaterialByType(params.materialType);
        // Main round body
        const bodyGeom = new CylinderGeometry(radius, radius, depth, 32);
        const body = new Mesh(bodyGeom, bodyMat);
        body.rotation.x = Math.PI / 2;
        group.add(body);
        // Legs
        const legGeom = new CylinderGeometry(0.008, 0.008, 0.03, 8);
        const legMat = new MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
        const legPositions = [
            [-radius * 0.5, -radius * 0.3, 0],
            [radius * 0.5, -radius * 0.3, 0]
        ];
        legPositions.forEach(pos => {
            const leg = new Mesh(legGeom, legMat);
            leg.rotation.x = Math.PI / 6;
            leg.position.set(...pos);
            group.add(leg);
        });
        // Bells on top
        const bellGeom = new SphereGeometry(radius * 0.25, 16, 16);
        const bellMat = new MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });
        const bell1 = new Mesh(bellGeom, bellMat);
        bell1.position.set(-radius * 0.4, radius * 0.3, 0);
        group.add(bell1);
        const bell2 = new Mesh(bellGeom, bellMat);
        bell2.position.set(radius * 0.4, radius * 0.3, 0);
        group.add(bell2);
        // Hammer between bells
        const hammerGeom = new BoxGeometry(0.02 * size, 0.03 * size, 0.005);
        const hammer = new Mesh(hammerGeom, legMat);
        hammer.position.set(0, radius * 0.35, 0.005);
        group.add(hammer);
        // Clock face
        const faceRadius = radius * 0.7;
        const faceGeom = new CylinderGeometry(faceRadius, faceRadius, 0.005, 32);
        const faceMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const face = new Mesh(faceGeom, faceMat);
        face.position.z = depth / 2 + 0.003;
        group.add(face);
        // Hands
        this.createClockHands(group, faceRadius * 0.7, params.faceStyle, bodyMat);
    }
    createClockHands(group, scale, faceStyle, material, isVertical = false) {
        const handMat = new MeshStandardMaterial({ color: 0x111111, metalness: 0.5 });
        // Hour hand
        const hourLength = scale * 0.5;
        const hourGeom = new BoxGeometry(0.01 * scale, hourLength, 0.002);
        const hourHand = new Mesh(hourGeom, handMat);
        hourHand.position.y = hourLength / 2;
        if (isVertical) {
            hourHand.rotation.z = Math.PI / 6; // 1 o'clock position
        }
        else {
            hourHand.rotation.z = Math.PI / 6;
        }
        group.add(hourHand);
        // Minute hand
        const minuteLength = scale * 0.75;
        const minuteGeom = new BoxGeometry(0.008 * scale, minuteLength, 0.002);
        const minuteHand = new Mesh(minuteGeom, handMat);
        minuteHand.position.y = minuteLength / 2;
        if (isVertical) {
            minuteHand.rotation.z = -Math.PI / 3; // 10 o'clock position
        }
        else {
            minuteHand.rotation.z = -Math.PI / 3;
        }
        group.add(minuteHand);
        // Second hand (optional, thinner)
        const secondLength = scale * 0.85;
        const secondGeom = new BoxGeometry(0.004 * scale, secondLength, 0.001);
        const secondMat = new MeshStandardMaterial({ color: 0xcc0000 });
        const secondHand = new Mesh(secondGeom, secondMat);
        secondHand.position.y = secondLength / 2;
        if (isVertical) {
            secondHand.rotation.z = Math.PI / 2; // 12 o'clock position
        }
        else {
            secondHand.rotation.z = Math.PI / 2;
        }
        group.add(secondHand);
        // Center cap
        const capGeom = new CylinderGeometry(0.015 * scale, 0.015 * scale, 0.005, 8);
        const cap = new Mesh(capGeom, handMat);
        cap.position.z = 0.004;
        group.add(cap);
    }
    createPendulum(group, length, depth, material) {
        // Pendulum rod
        const rodGeom = new CylinderGeometry(0.005, 0.005, length * 0.6, 8);
        const rod = new Mesh(rodGeom, material);
        rod.position.y = -length * 0.3;
        group.add(rod);
        // Pendulum bob
        const bobGeom = new SphereGeometry(0.03, 16, 16);
        const bobMat = new MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
        const bob = new Mesh(bobGeom, bobMat);
        bob.position.y = -length * 0.6;
        group.add(bob);
    }
    getSizeMultiplier(size) {
        switch (size) {
            case 'small': return 0.7;
            case 'medium': return 1.0;
            case 'large': return 1.4;
        }
    }
    getMaterialByType(type) {
        const configs = {
            wood: { color: 0x8B4513, roughness: 0.6, metalness: 0.0 },
            metal: { color: 0x888888, roughness: 0.3, metalness: 0.7 },
            plastic: { color: 0xf5f5f5, roughness: 0.4, metalness: 0.0 },
            glass: { color: 0xe0e0e0, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.8 },
            ceramic: { color: 0xfffff0, roughness: 0.3, metalness: 0.0 },
            brass: { color: 0xffd700, roughness: 0.2, metalness: 0.9 }
        };
        const config = configs[type];
        return new MeshStandardMaterial(config);
    }
    getVariations() {
        const styles = ['wall', 'mantel', 'grandfather', 'digital', 'cuckoo', 'pendulum', 'alarm'];
        const materials = ['wood', 'metal', 'plastic', 'glass', 'ceramic', 'brass'];
        const faces = ['analog', 'digital', 'roman', 'minimal', 'ornate'];
        const sizes = ['small', 'medium', 'large'];
        return styles.flatMap(style => materials.map(material => ({
            style,
            materialType: material,
            faceStyle: faces[Math.floor(Math.random() * faces.length)],
            size: sizes[Math.floor(Math.random() * sizes.length)],
            hasPendulum: style === 'grandfather' || style === 'pendulum',
            hasChime: style === 'grandfather' || style === 'cuckoo',
            ornateLevel: Math.floor(Math.random() * 3),
            seed: Math.floor(Math.random() * 10000)
        })));
    }
}
//# sourceMappingURL=ClockGenerator.js.map