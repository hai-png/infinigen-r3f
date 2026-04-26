/**
 * BedGenerator - Procedural generation of beds and bedding
 *
 * Generates: Bed frames, headboards, mattresses, pillows, comforters
 * Multiple styles from modern platform to traditional four-poster
 */
import { Group, BoxGeometry, CylinderGeometry, SphereGeometry, Mesh } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class BedGenerator extends BaseObjectGenerator {
    constructor() {
        super();
        this.defaultParams = {
            size: 'queen',
            style: 'modern',
            frameMaterial: 'wood',
            hasHeadboard: true,
            hasFootboard: false,
            hasStorage: false,
            mattressThickness: 0.25,
            pillowCount: 2,
            beddingStyle: 'duvet',
        };
    }
    validateParams(params) {
        const validated = { ...params };
        if (validated.pillowCount !== undefined) {
            validated.pillowCount = Math.max(1, Math.min(6, validated.pillowCount));
        }
        if (validated.mattressThickness !== undefined) {
            validated.mattressThickness = Math.max(0.15, Math.min(0.4, validated.mattressThickness));
        }
        return validated;
    }
    generate(params = {}) {
        const finalParams = this.validateAndMergeParams(params);
        const group = new Group();
        const dimensions = this.getBedDimensions(finalParams.size);
        // Frame
        const frame = this.createFrame(dimensions, finalParams);
        group.add(frame);
        // Headboard
        if (finalParams.hasHeadboard) {
            const headboard = this.createHeadboard(dimensions, finalParams);
            headboard.position.z = -dimensions.length / 2 - 0.1;
            group.add(headboard);
        }
        // Footboard
        if (finalParams.hasFootboard) {
            const footboard = this.createFootboard(dimensions, finalParams);
            footboard.position.z = dimensions.length / 2 + 0.1;
            group.add(footboard);
        }
        // Mattress
        const mattress = this.createMattress(dimensions, finalParams.mattressThickness);
        group.add(mattress);
        // Bedding
        const bedding = this.createBedding(dimensions, finalParams);
        bedding.position.y = finalParams.mattressThickness / 2 + 0.01;
        group.add(bedding);
        // Pillows
        const pillows = this.createPillows(dimensions, finalParams.pillowCount, finalParams.style);
        pillows.position.y = finalParams.mattressThickness + 0.02;
        pillows.position.z = -dimensions.length / 4;
        group.add(pillows);
        // Storage drawers if applicable
        if (finalParams.hasStorage || finalParams.style === 'storage') {
            const storage = this.createStorageDrawers(dimensions, finalParams);
            group.add(storage);
        }
        // Canopy posts if applicable
        if (finalParams.style === 'canopy') {
            const canopy = this.createCanopy(dimensions, finalParams);
            group.add(canopy);
        }
        return group;
    }
    getBedDimensions(size) {
        const dimensions = {
            'twin': { width: 1.0, length: 1.9 },
            'full': { width: 1.35, length: 1.9 },
            'queen': { width: 1.52, length: 2.03 },
            'king': { width: 1.93, length: 2.03 },
            'cal-king': { width: 1.83, length: 2.13 },
        };
        return dimensions[size] || dimensions['queen'];
    }
    createFrame(dimensions, params) {
        const group = new Group();
        const material = this.getFrameMaterial(params.frameMaterial, params.style);
        const frameHeight = params.style === 'platform' || params.style === 'modern' ? 0.15 : 0.3;
        if (params.style === 'modern' || params.style === 'minimal') {
            // Platform bed - low profile solid base
            const baseGeo = new BoxGeometry(dimensions.width + 0.05, frameHeight, dimensions.length + 0.05);
            const base = new Mesh(baseGeo, material);
            base.position.y = frameHeight / 2;
            group.add(base);
            // Legs (minimal visible)
            if (params.style === 'modern') {
                const legPositions = [
                    { x: -dimensions.width / 2 + 0.1, z: -dimensions.length / 2 + 0.1 },
                    { x: dimensions.width / 2 - 0.1, z: -dimensions.length / 2 + 0.1 },
                    { x: -dimensions.width / 2 + 0.1, z: dimensions.length / 2 - 0.1 },
                    { x: dimensions.width / 2 - 0.1, z: dimensions.length / 2 - 0.1 },
                ];
                legPositions.forEach(pos => {
                    const leg = new Mesh(new BoxGeometry(0.08, 0.1, 0.08), material);
                    leg.position.set(pos.x, 0.05, pos.z);
                    group.add(leg);
                });
            }
        }
        else if (params.style === 'traditional') {
            // Traditional frame with side rails and slats
            const railWidth = 0.1;
            const railHeight = 0.15;
            // Side rails
            [-1, 1].forEach(side => {
                const railGeo = new BoxGeometry(railWidth, railHeight, dimensions.length);
                const rail = new Mesh(railGeo, material);
                rail.position.set(side * (dimensions.width / 2 - railWidth / 2), frameHeight / 2, 0);
                group.add(rail);
            });
            // Head and foot rails
            [-1, 1].forEach(end => {
                const railGeo = new BoxGeometry(dimensions.width, railHeight, railWidth);
                const rail = new Mesh(railGeo, material);
                rail.position.set(0, frameHeight / 2, end * (dimensions.length / 2 - railWidth / 2));
                group.add(rail);
            });
            // Corner posts
            const postPositions = [
                { x: -dimensions.width / 2, z: -dimensions.length / 2 },
                { x: dimensions.width / 2, z: -dimensions.length / 2 },
                { x: -dimensions.width / 2, z: dimensions.length / 2 },
                { x: dimensions.width / 2, z: dimensions.length / 2 },
            ];
            postPositions.forEach(pos => {
                const postGeo = new CylinderGeometry(0.06, 0.06, frameHeight + 0.5, 8);
                const post = new Mesh(postGeo, material);
                post.position.set(pos.x, frameHeight / 2 + 0.25, pos.z);
                group.add(post);
            });
            // Slats
            for (let i = 0; i < 12; i++) {
                const slatZ = -dimensions.length / 2 + 0.15 + (i * (dimensions.length - 0.3) / 11);
                const slatGeo = new BoxGeometry(dimensions.width - 0.15, 0.03, 0.08);
                const slat = new Mesh(slatGeo, material);
                slat.position.set(0, frameHeight / 2, slatZ);
                group.add(slat);
            }
        }
        else if (params.frameMaterial === 'metal') {
            // Metal frame - tubular construction
            const tubeRadius = 0.03;
            // Rectangular base frame
            const framePaths = [
                { start: { x: -dimensions.width / 2, z: -dimensions.length / 2 }, end: { x: dimensions.width / 2, z: -dimensions.length / 2 } },
                { start: { x: dimensions.width / 2, z: -dimensions.length / 2 }, end: { x: dimensions.width / 2, z: dimensions.length / 2 } },
                { start: { x: dimensions.width / 2, z: dimensions.length / 2 }, end: { x: -dimensions.width / 2, z: dimensions.length / 2 } },
                { start: { x: -dimensions.width / 2, z: dimensions.length / 2 }, end: { x: -dimensions.width / 2, z: -dimensions.length / 2 } },
            ];
            framePaths.forEach(path => {
                const length = Math.sqrt(Math.pow(path.end.x - path.start.x, 2) + Math.pow(path.end.z - path.start.z, 2));
                const angle = Math.atan2(path.end.z - path.start.z, path.end.x - path.start.x);
                const tubeGeo = new CylinderGeometry(tubeRadius, tubeRadius, length, 16);
                const tube = new Mesh(tubeGeo, material);
                tube.rotation.y = -angle;
                tube.position.set((path.start.x + path.end.x) / 2, frameHeight / 2, (path.start.z + path.end.z) / 2);
                group.add(tube);
            });
            // Center support
            const centerTubeGeo = new CylinderGeometry(tubeRadius, tubeRadius, dimensions.length, 16);
            const centerTube = new Mesh(centerTubeGeo, material);
            centerTube.rotation.x = Math.PI / 2;
            centerTube.position.set(0, frameHeight / 2, 0);
            group.add(centerTube);
        }
        else {
            // Upholstered or leather - padded platform
            const paddingThickness = 0.1;
            const baseGeo = new BoxGeometry(dimensions.width, frameHeight + paddingThickness, dimensions.length);
            const base = new Mesh(baseGeo, material);
            base.position.y = (frameHeight + paddingThickness) / 2;
            group.add(base);
        }
        return group;
    }
    createHeadboard(dimensions, params) {
        const group = new Group();
        const material = this.getFrameMaterial(params.frameMaterial, params.style);
        const height = params.style === 'traditional' ? 1.4 : params.style === 'modern' ? 1.0 : 0.8;
        const thickness = params.frameMaterial === 'upholstered' ? 0.15 : 0.05;
        if (params.style === 'traditional') {
            // Traditional panel headboard
            const panelGeo = new BoxGeometry(dimensions.width + 0.1, height, thickness);
            const panel = new Mesh(panelGeo, material);
            panel.position.y = height / 2;
            group.add(panel);
            // Decorative posts
            [-1, 1].forEach(side => {
                const postGeo = new CylinderGeometry(0.07, 0.07, height + 0.1, 8);
                const post = new Mesh(postGeo, material);
                post.position.set(side * (dimensions.width / 2 + 0.05), height / 2 + 0.05, 0);
                group.add(post);
                // Finials
                const finialGeo = new SphereGeometry(0.05, 16, 16);
                const finial = new Mesh(finialGeo, material);
                finial.position.set(side * (dimensions.width / 2 + 0.05), height + 0.1, 0);
                group.add(finial);
            });
        }
        else if (params.style === 'modern') {
            // Modern sleek headboard
            const panelGeo = new BoxGeometry(dimensions.width, height, thickness);
            const panel = new Mesh(panelGeo, material);
            panel.position.y = height / 2;
            group.add(panel);
            if (params.frameMaterial === 'upholstered') {
                // Tufted upholstery effect
                const tuftPositions = [];
                for (let row = 0; row < 3; row++) {
                    for (let col = 0; col < 5; col++) {
                        tuftPositions.push({
                            x: -dimensions.width * 0.35 + col * (dimensions.width * 0.175),
                            y: 0.3 + row * 0.3,
                        });
                    }
                }
                tuftPositions.forEach(pos => {
                    const tuftGeo = new SphereGeometry(0.02, 8, 8);
                    const tuftMat = this.createPBRMaterial({ color: 0x333333, metalness: 0.0, roughness: 0.8 });
                    const tuft = new Mesh(tuftGeo, tuftMat);
                    tuft.position.set(pos.x, pos.y, thickness / 2 + 0.01);
                    group.add(tuft);
                });
            }
        }
        else if (params.style === 'canopy') {
            // Tall headboard for canopy bed
            const panelGeo = new BoxGeometry(dimensions.width, height + 0.3, thickness);
            const panel = new Mesh(panelGeo, material);
            panel.position.y = (height + 0.3) / 2;
            group.add(panel);
        }
        else {
            // Minimal or storage - simple panel
            const panelGeo = new BoxGeometry(dimensions.width, height, thickness);
            const panel = new Mesh(panelGeo, material);
            panel.position.y = height / 2;
            group.add(panel);
        }
        return group;
    }
    createFootboard(dimensions, params) {
        const group = new Group();
        const material = this.getFrameMaterial(params.frameMaterial, params.style);
        const height = params.style === 'traditional' ? 0.6 : 0.3;
        const thickness = 0.05;
        if (params.style === 'traditional') {
            const panelGeo = new BoxGeometry(dimensions.width + 0.1, height, thickness);
            const panel = new Mesh(panelGeo, material);
            panel.position.y = height / 2;
            group.add(panel);
            // Matching posts
            [-1, 1].forEach(side => {
                const postGeo = new CylinderGeometry(0.06, 0.06, height + 0.05, 8);
                const post = new Mesh(postGeo, material);
                post.position.set(side * (dimensions.width / 2 + 0.05), height / 2 + 0.025, 0);
                group.add(post);
            });
        }
        else {
            // Simple footboard
            const panelGeo = new BoxGeometry(dimensions.width, height, thickness);
            const panel = new Mesh(panelGeo, material);
            panel.position.y = height / 2;
            group.add(panel);
        }
        return group;
    }
    createMattress(dimensions, thickness) {
        const geometry = new BoxGeometry(dimensions.width, thickness, dimensions.length);
        const material = this.createPBRMaterial({
            color: 0xf5f5f5,
            metalness: 0.0,
            roughness: 0.9,
        });
        const mattress = new Mesh(geometry, material);
        mattress.position.y = thickness / 2;
        return mattress;
    }
    createBedding(dimensions, params) {
        const group = new Group();
        const overhang = 0.15;
        const beddingLength = dimensions.length - 0.3;
        if (params.beddingStyle === 'duvet') {
            // Duvet with slight fold at top
            const duvetGeo = new BoxGeometry(dimensions.width + overhang * 2, 0.05, beddingLength);
            const duvetMat = this.getBeddingMaterial();
            const duvet = new Mesh(duvetGeo, duvetMat);
            duvet.position.y = 0.025;
            duvet.position.z = -overhang / 2;
            group.add(duvet);
            // Folded back portion
            const foldGeo = new BoxGeometry(dimensions.width + overhang * 2, 0.08, 0.25);
            const fold = new Mesh(foldGeo, duvetMat);
            fold.position.y = 0.065;
            fold.position.z = -beddingLength / 2 + 0.15;
            fold.rotation.x = -Math.PI / 6;
            group.add(fold);
        }
        else if (params.beddingStyle === 'comforter') {
            // Puffy comforter
            const comforterGeo = new BoxGeometry(dimensions.width + overhang * 2, 0.12, beddingLength);
            const comforterMat = this.getBeddingMaterial();
            const comforter = new Mesh(comforterGeo, comforterMat);
            comforter.position.y = 0.06;
            group.add(comforter);
            // Quilting pattern simulation
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 6; j++) {
                    const quiltGeo = new BoxGeometry(0.02, 0.01, 0.02);
                    const quilt = new Mesh(quiltGeo, comforterMat);
                    quilt.position.set(-dimensions.width / 2 + 0.2 + i * 0.35, 0.125, -beddingLength / 2 + 0.2 + j * 0.25);
                    group.add(quilt);
                }
            }
        }
        else if (params.beddingStyle === 'quilt') {
            // Thinner quilt with patchwork effect
            const quiltGeo = new BoxGeometry(dimensions.width + overhang * 2, 0.04, beddingLength);
            const quiltMat = this.getBeddingMaterial();
            const quilt = new Mesh(quiltGeo, quiltMat);
            quilt.position.y = 0.02;
            group.add(quilt);
        }
        else {
            // Sheets only - fitted sheet simulation
            const sheetGeo = new BoxGeometry(dimensions.width + 0.05, 0.02, dimensions.length + 0.05);
            const sheetMat = this.createPBRMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.95 });
            const sheet = new Mesh(sheetGeo, sheetMat);
            sheet.position.y = 0.01;
            group.add(sheet);
        }
        return group;
    }
    createPillows(dimensions, count, style) {
        const group = new Group();
        const pillowWidth = 0.65;
        const pillowDepth = 0.45;
        const pillowHeight = 0.15;
        const startX = -(count - 1) * pillowWidth / 2;
        for (let i = 0; i < count; i++) {
            const pillowGeo = new BoxGeometry(pillowWidth, pillowHeight, pillowDepth);
            const pillowMat = this.getBeddingMaterial();
            const pillow = new Mesh(pillowGeo, pillowMat);
            pillow.position.x = startX + i * pillowWidth;
            pillow.position.z = (style === 'traditional' ? 0.05 : 0);
            pillow.rotation.x = style === 'traditional' ? -Math.PI / 12 : -Math.PI / 8;
            group.add(pillow);
            // Add decorative sham for traditional style
            if (style === 'traditional' && i < 2) {
                const shamGeo = new BoxGeometry(pillowWidth + 0.1, pillowHeight + 0.05, pillowDepth + 0.05);
                const shamMat = this.createPBRMaterial({ color: 0xdddddd, metalness: 0.0, roughness: 0.8 });
                const sham = new Mesh(shamGeo, shamMat);
                sham.position.copy(pillow.position);
                sham.position.z -= 0.1;
                sham.position.y += 0.025;
                sham.rotation.x = pillow.rotation.x;
                group.add(sham);
            }
        }
        return group;
    }
    createStorageDrawers(dimensions, params) {
        const group = new Group();
        const material = this.getFrameMaterial('wood', params.style);
        // Under-bed drawers on sides
        const drawerWidth = 0.5;
        const drawerHeight = 0.2;
        const drawerDepth = 0.4;
        [-1, 1].forEach(side => {
            for (let i = 0; i < 2; i++) {
                const drawerGeo = new BoxGeometry(drawerWidth, drawerHeight, drawerDepth);
                const drawer = new Mesh(drawerGeo, material);
                drawer.position.set(side * (dimensions.width / 2 + drawerWidth / 2 + 0.05), 0.1, -dimensions.length / 4 + i * 0.3);
                // Drawer handle
                const handleGeo = new CylinderGeometry(0.02, 0.02, 0.08, 16);
                const handleMat = this.createPBRMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
                const handle = new Mesh(handleGeo, handleMat);
                handle.rotation.x = Math.PI / 2;
                handle.position.set(side * (dimensions.width / 2 + drawerWidth + 0.06), 0.1, -dimensions.length / 4 + i * 0.3);
                group.add(drawer);
                group.add(handle);
            }
        });
        return group;
    }
    createCanopy(dimensions, params) {
        const group = new Group();
        const material = this.getFrameMaterial(params.frameMaterial, params.style);
        const postHeight = 2.2;
        const postPositions = [
            { x: -dimensions.width / 2 + 0.1, z: -dimensions.length / 2 + 0.1 },
            { x: dimensions.width / 2 - 0.1, z: -dimensions.length / 2 + 0.1 },
            { x: -dimensions.width / 2 + 0.1, z: dimensions.length / 2 - 0.1 },
            { x: dimensions.width / 2 - 0.1, z: dimensions.length / 2 - 0.1 },
        ];
        // Four posts
        postPositions.forEach(pos => {
            const postGeo = new CylinderGeometry(0.05, 0.05, postHeight, 16);
            const post = new Mesh(postGeo, material);
            post.position.set(pos.x, postHeight / 2, pos.z);
            group.add(post);
            // Decorative finials
            const finialGeo = new SphereGeometry(0.04, 16, 16);
            const finial = new Mesh(finialGeo, material);
            finial.position.set(pos.x, postHeight, pos.z);
            group.add(finial);
        });
        // Top frame
        const topFrameHeight = postHeight;
        const framePaths = [
            { start: { x: postPositions[0].x, z: postPositions[0].z }, end: { x: postPositions[1].x, z: postPositions[1].z } },
            { start: { x: postPositions[1].x, z: postPositions[1].z }, end: { x: postPositions[3].x, z: postPositions[3].z } },
            { start: { x: postPositions[3].x, z: postPositions[3].z }, end: { x: postPositions[2].x, z: postPositions[2].z } },
            { start: { x: postPositions[2].x, z: postPositions[2].z }, end: { x: postPositions[0].x, z: postPositions[0].z } },
        ];
        framePaths.forEach(path => {
            const length = Math.sqrt(Math.pow(path.end.x - path.start.x, 2) + Math.pow(path.end.z - path.start.z, 2));
            const angle = Math.atan2(path.end.z - path.start.z, path.end.x - path.start.x);
            const beamGeo = new CylinderGeometry(0.04, 0.04, length, 16);
            const beam = new Mesh(beamGeo, material);
            beam.rotation.y = -angle;
            beam.position.set((path.start.x + path.end.x) / 2, topFrameHeight, (path.start.z + path.end.z) / 2);
            group.add(beam);
        });
        // Optional curtain rod for drapes
        const curtainRodGeo = new CylinderGeometry(0.02, 0.02, dimensions.width + 0.2, 16);
        const curtainRod = new Mesh(curtainRodGeo, material);
        curtainRod.rotation.x = Math.PI / 2;
        curtainRod.position.set(0, topFrameHeight - 0.1, -dimensions.length / 2 - 0.1);
        group.add(curtainRod);
        return group;
    }
    getFrameMaterial(frameMaterial, style) {
        if (frameMaterial === 'wood') {
            return this.createPBRMaterial({
                color: style === 'modern' ? 0x4a3728 : style === 'traditional' ? 0x6b4423 : 0x8b6f47,
                metalness: 0.0,
                roughness: 0.6,
            });
        }
        else if (frameMaterial === 'metal') {
            return this.createPBRMaterial({
                color: style === 'modern' ? 0x222222 : 0x444444,
                metalness: 0.9,
                roughness: 0.3,
            });
        }
        else if (frameMaterial === 'upholstered') {
            return this.createPBRMaterial({
                color: style === 'luxury' ? 0x4a4a6a : 0x8888aa,
                metalness: 0.0,
                roughness: 0.9,
            });
        }
        else {
            // Leather
            return this.createPBRMaterial({
                color: 0x3d2817,
                metalness: 0.1,
                roughness: 0.5,
            });
        }
    }
    getBeddingMaterial() {
        const colors = [0xffffff, 0xf0f0f0, 0xe8e8ff, 0xfff0f0, 0xf0fff0];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return this.createPBRMaterial({
            color,
            metalness: 0.0,
            roughness: 0.95,
        });
    }
    getBoundingBox(params) {
        const dimensions = this.getBedDimensions(params.size);
        const height = params.style === 'canopy' ? 2.2 : params.hasHeadboard ? 1.4 : 0.6;
        return {
            min: { x: -dimensions.width / 2 - 0.1, y: 0, z: -dimensions.length / 2 - 0.2 },
            max: { x: dimensions.width / 2 + 0.1, y: height, z: dimensions.length / 2 + 0.2 },
        };
    }
    getCollisionMesh(params) {
        const dimensions = this.getBedDimensions(params.size);
        const geometry = new BoxGeometry(dimensions.width + 0.2, 0.5, dimensions.length + 0.2);
        return this.createMesh(geometry, this.getCollisionMaterial());
    }
    getRandomParams() {
        const sizes = ['twin', 'full', 'queen', 'king', 'cal-king'];
        const styles = ['modern', 'traditional', 'minimal', 'canopy', 'storage'];
        const materials = ['wood', 'metal', 'upholstered', 'leather'];
        const beddingStyles = ['duvet', 'comforter', 'quilt', 'sheets-only'];
        const style = styles[Math.floor(Math.random() * styles.length)];
        return {
            size: sizes[Math.floor(Math.random() * sizes.length)],
            style,
            frameMaterial: materials[Math.floor(Math.random() * materials.length)],
            hasHeadboard: Math.random() > 0.2,
            hasFootboard: style === 'traditional' && Math.random() > 0.5,
            hasStorage: style === 'storage' || (Math.random() > 0.7),
            mattressThickness: 0.2 + Math.random() * 0.15,
            pillowCount: 2 + Math.floor(Math.random() * 3),
            beddingStyle: beddingStyles[Math.floor(Math.random() * beddingStyles.length)],
        };
    }
}
//# sourceMappingURL=BedGenerator.js.map