/**
 * PictureFrameGenerator - Procedural picture frame generation
 * Generates various frame styles with mats and glass
 */
import { Group, Mesh, PlaneGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, MeshPhysicalMaterial } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class PictureFrameGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            style: 'modern',
            materialType: 'wood',
            orientation: 'portrait',
            width: 0.3,
            height: 0.4,
            frameWidth: 0.03,
            hasMat: true,
            matColor: 0xffffff,
            hasGlass: true,
            seed: undefined
        };
    }
    getDefaultConfig() {
        return { ...this.defaultParams };
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        const group = new Group();
        // Create backing
        this.createBacking(group, finalParams);
        // Create frame
        this.createFrame(group, finalParams);
        // Add mat if requested
        if (finalParams.hasMat) {
            this.createMat(group, finalParams);
        }
        // Add glass if requested
        if (finalParams.hasGlass) {
            this.createGlass(group, finalParams);
        }
        // Add hanging hardware
        this.createHangingHardware(group, finalParams);
        return group;
    }
    createBacking(group, params) {
        const backingGeom = new BoxGeometry(params.width, params.height, 0.01);
        const backingMat = new MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });
        const backing = new Mesh(backingGeom, backingMat);
        backing.position.z = -0.005;
        group.add(backing);
    }
    createFrame(group, params) {
        const frameMat = this.getFrameMaterial(params.materialType, params.style);
        const fw = params.frameWidth;
        // Top and bottom
        const horizontalGeom = new BoxGeometry(params.width + fw * 2, fw, 0.015);
        const topFrame = new Mesh(horizontalGeom, frameMat);
        topFrame.position.y = params.height / 2 + fw / 2;
        group.add(topFrame);
        const bottomFrame = new Mesh(horizontalGeom, frameMat);
        bottomFrame.position.y = -params.height / 2 - fw / 2;
        group.add(bottomFrame);
        // Left and right
        const verticalGeom = new BoxGeometry(fw, params.height, 0.015);
        const leftFrame = new Mesh(verticalGeom, frameMat);
        leftFrame.position.x = -params.width / 2 - fw / 2;
        group.add(leftFrame);
        const rightFrame = new Mesh(verticalGeom, frameMat);
        rightFrame.position.x = params.width / 2 + fw / 2;
        group.add(rightFrame);
        // Add ornate details for certain styles
        if (params.style === 'ornate' || params.style === 'classic') {
            this.addOrnateDetails(group, params, frameMat);
        }
    }
    addOrnateDetails(group, params, material) {
        const cornerSize = params.frameWidth * 1.3;
        const cornerGeom = new BoxGeometry(cornerSize, cornerSize, 0.018);
        const corners = [
            [-params.width / 2 - params.frameWidth / 2, params.height / 2 + params.frameWidth / 2],
            [params.width / 2 + params.frameWidth / 2, params.height / 2 + params.frameWidth / 2],
            [-params.width / 2 - params.frameWidth / 2, -params.height / 2 - params.frameWidth / 2],
            [params.width / 2 + params.frameWidth / 2, -params.height / 2 - params.frameWidth / 2]
        ];
        corners.forEach(pos => {
            const corner = new Mesh(cornerGeom, material);
            corner.position.set(pos[0], pos[1], 0);
            group.add(corner);
        });
    }
    createMat(group, params) {
        const matOverlap = 0.01;
        const innerWidth = params.width - matOverlap * 2;
        const innerHeight = params.height - matOverlap * 2;
        // Create mat with cutout using multiple boxes
        const matThickness = 0.005;
        const matColor = new MeshStandardMaterial({
            color: params.matColor,
            roughness: 0.9
        });
        const topStrip = new Mesh(new BoxGeometry(innerWidth, params.frameWidth * 0.8, matThickness), matColor);
        topStrip.position.y = params.height / 2 - params.frameWidth * 0.4;
        group.add(topStrip);
        const bottomStrip = new Mesh(new BoxGeometry(innerWidth, params.frameWidth * 0.8, matThickness), matColor);
        bottomStrip.position.y = -params.height / 2 + params.frameWidth * 0.4;
        group.add(bottomStrip);
        const leftStrip = new Mesh(new BoxGeometry(params.frameWidth * 0.8, innerHeight - params.frameWidth * 1.6, matThickness), matColor);
        leftStrip.position.x = -params.width / 2 + params.frameWidth * 0.4;
        group.add(leftStrip);
        const rightStrip = new Mesh(new BoxGeometry(params.frameWidth * 0.8, innerHeight - params.frameWidth * 1.6, matThickness), matColor);
        rightStrip.position.x = params.width / 2 - params.frameWidth * 0.4;
        group.add(rightStrip);
    }
    createGlass(group, params) {
        const glassGeom = new PlaneGeometry(params.width - 0.01, params.height - 0.01);
        const glassMat = new MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.05,
            transmission: 0.95,
            transparent: true,
            opacity: 0.3,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02
        });
        const glass = new Mesh(glassGeom, glassMat);
        glass.position.z = params.frameWidth * 0.5;
        group.add(glass);
    }
    createHangingHardware(group, params) {
        // Wire
        const wirePoints = [
            [-params.width / 2 + 0.05, params.height / 2 - 0.08, -0.01],
            [0, params.height / 2 - 0.03, -0.01],
            [params.width / 2 - 0.05, params.height / 2 - 0.08, -0.01]
        ];
        // Simple representation of wire as small spheres
        const wireMat = new MeshStandardMaterial({ color: 0x666666, metalness: 0.8 });
        wirePoints.forEach(point => {
            const wireSeg = new Mesh(new SphereGeometry(0.003, 8, 8), wireMat);
            wireSeg.position.set(...point);
            group.add(wireSeg);
        });
        // Hooks
        const hookGeom = new CylinderGeometry(0.005, 0.005, 0.02, 8);
        const hookMat = new MeshStandardMaterial({ color: 0x888888, metalness: 0.7 });
        const leftHook = new Mesh(hookGeom, hookMat);
        leftHook.position.set(-params.width / 2 + 0.05, params.height / 2 - 0.05, -0.02);
        leftHook.rotation.x = Math.PI / 2;
        group.add(leftHook);
        const rightHook = new Mesh(hookGeom, hookMat);
        rightHook.position.set(params.width / 2 - 0.05, params.height / 2 - 0.05, -0.02);
        rightHook.rotation.x = Math.PI / 2;
        group.add(rightHook);
    }
    getFrameMaterial(type, style) {
        let color;
        let roughness;
        let metalness;
        switch (type) {
            case 'wood':
                color = style === 'rustic' ? 0x5c4033 : style === 'classic' ? 0x654321 : 0x8B4513;
                roughness = 0.6;
                metalness = 0.0;
                break;
            case 'metal':
                color = style === 'modern' ? 0x1a1a1a : style === 'gallery' ? 0x333333 : 0x666666;
                roughness = 0.3;
                metalness = 0.8;
                break;
            case 'plastic':
                color = style === 'minimal' ? 0x000000 : 0xffffff;
                roughness = 0.5;
                metalness = 0.0;
                break;
            case 'composite':
                color = 0x4a4a4a;
                roughness = 0.4;
                metalness = 0.2;
                break;
            default:
                color = 0x8B4513;
                roughness = 0.6;
                metalness = 0.0;
        }
        return new MeshStandardMaterial({ color, roughness, metalness });
    }
}
//# sourceMappingURL=PictureFrameGenerator.js.map