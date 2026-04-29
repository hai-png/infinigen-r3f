/**
 * WallDecor - Procedural generation of wall decorations
 *
 * Generates: Picture frames, mirrors, wall art, clocks, shelves
 * Multiple styles and mounting options
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, CircleGeometry, TorusGeometry, PlaneGeometry, ExtrudeGeometry, Shape } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class WallDecor extends BaseObjectGenerator {
    getDefaultConfig() {
        return this.defaultParams;
    }
    constructor() {
        super();
        this.defaultParams = {
            decorType: 'picture',
            style: 'modern',
            frameMaterial: 'wood',
            width: 0.5,
            height: 0.7,
            shape: 'rectangle',
            hasGlass: true,
            hangingStyle: 'wire',
            seed: undefined
        };
    }
    validateParams(params) {
        const validated = { ...params };
        if (validated.width !== undefined)
            validated.width = Math.max(0.2, Math.min(2.0, validated.width));
        if (validated.height !== undefined)
            validated.height = Math.max(0.2, Math.min(2.0, validated.height));
        return validated;
    }
    generate(params = {}) {
        const finalParams = this.validateAndMergeParams(params);
        const group = new Group();
        // Main content (art/mirror/clock face)
        const content = this.createContent(finalParams);
        group.add(content);
        // Frame if applicable
        if (finalParams.frameMaterial !== 'none') {
            const frame = this.createFrame(finalParams);
            group.add(frame);
        }
        // Glass covering if applicable
        if (finalParams.hasGlass && finalParams.decorType !== 'mirror') {
            const glass = this.createGlass(finalParams);
            group.add(glass);
        }
        // Hanging hardware
        const hanger = this.createHangingHardware(finalParams);
        group.add(hanger);
        return group;
    }
    createContent(params) {
        let geometry;
        let material;
        const { width, height, shape, decorType } = params;
        switch (shape) {
            case 'circle':
                geometry = new CircleGeometry(Math.min(width, height) / 2, 32);
                break;
            case 'oval':
                geometry = new CircleGeometry(width / 2, 32, 0, Math.PI * 2, width / height, 1);
                break;
            case 'abstract':
                geometry = this.createAbstractShape(width, height);
                break;
            case 'square':
            case 'rectangle':
            default:
                geometry = new PlaneGeometry(width, height);
                break;
        }
        // Content material based on type
        if (decorType === 'mirror') {
            material = this.createPBRMaterial({
                color: 0xaaccff,
                metalness: 0.95,
                roughness: 0.05,
            });
        }
        else if (decorType === 'clock') {
            material = this.createClockFace(width, height);
        }
        else if (decorType === 'art') {
            material = this.createArtworkMaterial(params.style, width, height);
        }
        else {
            // Picture placeholder
            material = this.createPicturePlaceholder(params.style, width, height);
        }
        const mesh = new Mesh(geometry, material);
        return mesh;
    }
    createFrame(params) {
        const group = new Group();
        const material = this.getFrameMaterial(params.frameMaterial, params.style);
        const { width, height, shape } = params;
        const frameWidth = 0.04;
        const frameDepth = 0.02;
        if (shape === 'circle' || shape === 'oval') {
            // Circular frame
            const outerRadius = shape === 'circle' ? Math.min(width, height) / 2 + frameWidth : width / 2 + frameWidth;
            const innerRadius = shape === 'circle' ? Math.min(width, height) / 2 : width / 2;
            const frameGeo = new TorusGeometry(outerRadius - frameWidth / 2, frameWidth / 2, 16, 64);
            const frame = new Mesh(frameGeo, material);
            group.add(frame);
        }
        else if (shape === 'abstract') {
            // Abstract organic frame
            const frameShape = this.createAbstractShape(width + frameWidth * 2, height + frameWidth * 2);
            const innerShape = this.createAbstractShape(width - frameWidth, height - frameWidth);
            frameShape.holes.push(innerShape);
            const frameGeo = new ExtrudeGeometry(frameShape, { depth: frameDepth, bevelEnabled: false });
            const frame = new Mesh(frameGeo, material);
            group.add(frame);
        }
        else {
            // Rectangular frame
            const frameSegments = [
                // Top
                { w: width + frameWidth * 2, h: frameWidth, x: 0, y: height / 2 + frameWidth / 2 },
                // Bottom
                { w: width + frameWidth * 2, h: frameWidth, x: 0, y: -height / 2 - frameWidth / 2 },
                // Left
                { w: frameWidth, h: height, x: -width / 2 - frameWidth / 2, y: 0 },
                // Right
                { w: frameWidth, h: height, x: width / 2 + frameWidth / 2, y: 0 },
            ];
            frameSegments.forEach(seg => {
                const segGeo = new BoxGeometry(seg.w, seg.h, frameDepth);
                const segMesh = new Mesh(segGeo, material);
                segMesh.position.set(seg.x, seg.y, 0);
                group.add(segMesh);
            });
            // Corner details for traditional style
            if (params.style === 'traditional') {
                const cornerPositions = [
                    { x: -width / 2 - frameWidth / 2, y: height / 2 + frameWidth / 2 },
                    { x: width / 2 + frameWidth / 2, y: height / 2 + frameWidth / 2 },
                    { x: -width / 2 - frameWidth / 2, y: -height / 2 - frameWidth / 2 },
                    { x: width / 2 + frameWidth / 2, y: -height / 2 - frameWidth / 2 },
                ];
                cornerPositions.forEach(pos => {
                    const cornerGeo = new CylinderGeometry(0.015, 0.015, 0.03, 8);
                    const corner = new Mesh(cornerGeo, material);
                    corner.position.set(pos.x, pos.y, frameDepth / 2 + 0.015);
                    group.add(corner);
                });
            }
        }
        return group;
    }
    createGlass(params) {
        const { width, height, shape } = params;
        let geometry;
        switch (shape) {
            case 'circle':
                geometry = new CircleGeometry(Math.min(width, height) / 2 - 0.01, 32);
                break;
            case 'oval':
                geometry = new CircleGeometry(width / 2 - 0.01, 32, 0, Math.PI * 2, (width - 0.02) / (height - 0.02), 1);
                break;
            default:
                geometry = new PlaneGeometry(width - 0.02, height - 0.02);
                break;
        }
        const material = this.createPBRMaterial({
            color: 0xccddff,
            metalness: 0.8,
            roughness: 0.05,
            transparent: true,
            opacity: 0.3,
        });
        const glass = new Mesh(geometry, material);
        glass.position.z = 0.015;
        return glass;
    }
    createHangingHardware(params) {
        const group = new Group();
        const { width, height, hangingStyle } = params;
        const wireMat = this.getMetalMaterial('steel');
        if (hangingStyle === 'wire') {
            // Wire hanger on back
            const wireGeo = new CylinderGeometry(0.003, 0.003, width * 0.6, 8);
            const wire = new Mesh(wireGeo, wireMat);
            wire.position.set(0, height / 2 - 0.05, -0.02);
            wire.rotation.x = Math.PI / 2;
            group.add(wire);
            // Wire supports
            [-0.3, 0.3].forEach(x => {
                const supportGeo = new CylinderGeometry(0.002, 0.002, 0.03, 8);
                const support = new Mesh(supportGeo, wireMat);
                support.position.set(x * width, height / 2 - 0.05, -0.01);
                support.rotation.z = Math.PI / 4;
                group.add(support);
            });
        }
        else if (hangingStyle === 'cleat') {
            // French cleat system
            const cleatGeo = new BoxGeometry(width * 0.8, 0.03, 0.02);
            const cleatMat = this.getFrameMaterial('metal', params.style);
            const cleat = new Mesh(cleatGeo, cleatMat);
            cleat.position.set(0, height / 2 - 0.03, -0.02);
            group.add(cleat);
        }
        else if (hangingStyle === 'bracket') {
            // Sawtooth bracket
            const bracketGeo = new BoxGeometry(0.15, 0.03, 0.01);
            const bracketMat = this.getMetalMaterial('aluminum');
            const bracket = new Mesh(bracketGeo, bracketMat);
            bracket.position.set(0, height / 2 - 0.02, -0.02);
            group.add(bracket);
        }
        else {
            // Adhesive strips (minimal visible hardware)
            const stripGeo = new BoxGeometry(0.05, 0.03, 0.005);
            const stripMat = this.createPBRMaterial({ color: 0xdddddd, metalness: 0.0, roughness: 0.8 });
            [-0.2, 0.2].forEach(x => {
                const strip = new Mesh(stripGeo, stripMat);
                strip.position.set(x * width, height / 2 - 0.02, -0.02);
                group.add(strip);
            });
        }
        return group;
    }
    createAbstractShape(width, height) {
        const shape = new Shape();
        const segments = 8;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const radiusX = width / 2 * (0.7 + 0.3 * Math.sin(angle * 3));
            const radiusY = height / 2 * (0.7 + 0.3 * Math.cos(angle * 2));
            const x = Math.cos(angle) * radiusX;
            const y = Math.sin(angle) * radiusY;
            if (i === 0) {
                shape.moveTo(x, y);
            }
            else {
                shape.lineTo(x, y);
            }
        }
        shape.closePath();
        return shape;
    }
    createClockFace(width, height) {
        // Create clock face with numbers/markers
        const size = Math.min(width, height);
        // Base face
        const faceGeo = new CircleGeometry(size / 2 - 0.02, 32);
        const faceMat = this.createPBRMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.5 });
        // Hour markers
        const markerGroup = new Group();
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const radius = size / 2 - 0.08;
            const isMainHour = i % 3 === 0;
            const markerW = isMainHour ? 0.04 : 0.02;
            const markerH = isMainHour ? 0.015 : 0.01;
            const markerGeo = new BoxGeometry(markerW, markerH, 0.01);
            const markerMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.3 });
            const marker = new Mesh(markerGeo, markerMat);
            marker.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.01);
            marker.rotation.z = -angle;
            markerGroup.add(marker);
        }
        // Clock hands (simplified - would need animation for real clock)
        const handMat = this.getMetalMaterial('steel');
        // Hour hand
        const hourHandGeo = new BoxGeometry(0.015, 0.12, 0.01);
        const hourHand = new Mesh(hourHandGeo, handMat);
        hourHand.position.set(0, 0.04, 0.015);
        markerGroup.add(hourHand);
        // Minute hand
        const minuteHandGeo = new BoxGeometry(0.01, 0.18, 0.01);
        const minuteHand = new Mesh(minuteHandGeo, handMat);
        minuteHand.position.set(0, 0.06, 0.02);
        markerGroup.add(minuteHand);
        // Center cap
        const capGeo = new CylinderGeometry(0.02, 0.02, 0.03, 16);
        const capMat = this.getMetalMaterial('brass');
        const cap = new Mesh(capGeo, capMat);
        cap.position.z = 0.025;
        markerGroup.add(cap);
        // Combine into single material using a group approach
        // For simplicity, return the face material and add markers separately in actual use
        return faceMat;
    }
    createArtworkMaterial(style, width, height) {
        // Generate abstract art pattern
        const colors = [
            [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731], // Modern vibrant
            [0x8b4513, 0xd2691e, 0xcd853f, 0xf4a460], // Traditional warm
            [0x333333, 0x666666, 0x999999, 0xcccccc], // Minimal monochrome
            [0x8b7355, 0x556b2f, 0x8b4513, 0xcd853f], // Bohemian earth
        ];
        const colorSet = style === 'modern' ? colors[0] :
            style === 'traditional' ? colors[1] :
                style === 'minimal' ? colors[2] : colors[3];
        const baseColor = colorSet[Math.floor(Math.random() * colorSet.length)];
        return this.createPBRMaterial({
            color: baseColor,
            metalness: 0.0,
            roughness: 0.9,
        });
    }
    createPicturePlaceholder(style, width, height) {
        // Generic picture/matting placeholder
        const matColors = {
            modern: 0xffffff,
            traditional: 0xf5f5dc,
            minimal: 0xeeeeee,
            industrial: 0x888888,
            bohemian: 0xfff8e8,
        };
        return this.createPBRMaterial({
            color: matColors[style] || 0xffffff,
            metalness: 0.0,
            roughness: 0.95,
        });
    }
    getFrameMaterial(material, style) {
        switch (material) {
            case 'wood':
                return this.createPBRMaterial({
                    color: style === 'modern' ? 0x222222 : style === 'traditional' ? 0x6b4423 : 0x8b6f47,
                    metalness: 0.0,
                    roughness: 0.6,
                });
            case 'metal':
                return this.getMetalMaterial(style === 'industrial' ? 'steel' : 'aluminum');
            case 'plastic':
                return this.createPBRMaterial({
                    color: style === 'modern' ? 0x111111 : 0xffffff,
                    metalness: 0.1,
                    roughness: 0.5,
                });
            default:
                return this.createPBRMaterial({ color: 0x444444, metalness: 0.0, roughness: 0.7 });
        }
    }
    getBoundingBox(params) {
        return {
            min: { x: -params.width / 2 - 0.05, y: -params.height / 2 - 0.05, z: -0.05 },
            max: { x: params.width / 2 + 0.05, y: params.height / 2 + 0.05, z: 0.05 },
        };
    }
    getCollisionMesh(params) {
        const geometry = new BoxGeometry(params.width, params.height, 0.05);
        return this.createMesh(geometry, this.getCollisionMaterial());
    }
    getRandomParams() {
        const types = ['picture', 'mirror', 'art', 'clock'];
        const styles = ['modern', 'traditional', 'minimal', 'industrial', 'bohemian'];
        const materials = ['wood', 'metal', 'plastic', 'none'];
        const shapes = ['rectangle', 'square', 'circle', 'oval'];
        const hangingStyles = ['wire', 'cleat', 'bracket', 'adhesive'];
        const decorType = types[Math.floor(Math.random() * types.length)];
        return {
            decorType,
            style: styles[Math.floor(Math.random() * styles.length)],
            frameMaterial: decorType === 'art' && Math.random() > 0.5 ? 'none' : materials[Math.floor(Math.random() * materials.length)],
            width: 0.3 + Math.random() * 0.8,
            height: 0.3 + Math.random() * 0.8,
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            hasGlass: decorType !== 'mirror' && Math.random() > 0.3,
            hangingStyle: hangingStyles[Math.floor(Math.random() * hangingStyles.length)],
        };
    }
}
//# sourceMappingURL=WallDecor.js.map