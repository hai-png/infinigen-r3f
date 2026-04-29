/**
 * Serving Dishes Generator
 *
 * Procedural serving dish generation with various types,
 * materials, sizes, and decorative elements.
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class ServingDishesGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            type: 'platter',
            material: 'ceramic',
            color: '#FFFFFF',
            size: 'medium',
            hasLid: false,
            lidStyle: 'domed',
            handles: 'none',
            pattern: 'none',
            patternColor: '#000000',
            ornateLevel: 0,
            seed: undefined
        };
        this.sizeDimensions = {
            small: { width: 0.2, depth: 0.15, height: 0.05 },
            medium: { width: 0.3, depth: 0.22, height: 0.07 },
            large: { width: 0.4, depth: 0.3, height: 0.09 },
            xlarge: { width: 0.5, depth: 0.38, height: 0.11 }
        };
    }
    generate(params = {}) {
        const config = { ...this.defaultParams, ...params };
        const group = new THREE.Group();
        // Main dish body
        const dish = this.createDishBody(config);
        group.add(dish);
        // Lid if applicable
        if (config.hasLid) {
            const lid = this.createLid(config);
            group.add(lid);
        }
        // Handles if applicable
        if (config.handles !== 'none') {
            const handles = this.createHandles(config);
            group.add(handles);
        }
        return group;
    }
    createDishBody(config) {
        let geometry;
        const dims = this.sizeDimensions[config.size];
        switch (config.type) {
            case 'bowl':
                geometry = this.createBowlGeometry(dims);
                break;
            case 'tureen':
                geometry = this.createTureenGeometry(dims);
                break;
            case 'casserole':
                geometry = this.createCasseroleGeometry(dims);
                break;
            case 'tray':
                geometry = this.createTrayGeometry(dims);
                break;
            case 'pitcher':
                geometry = this.createPitcherGeometry(dims);
                break;
            default: // platter
                geometry = this.createPlatterGeometry(dims);
        }
        const material = this.getDishMaterial(config);
        return new THREE.Mesh(geometry, material);
    }
    createPlatterGeometry(dims) {
        return new THREE.CylinderGeometry(dims.width / 2, dims.width / 2 * 0.95, dims.height * 0.3, 64, 1, true);
    }
    createBowlGeometry(dims) {
        const geometry = new THREE.SphereGeometry(dims.width / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        geometry.scale(1, 0.6, 1);
        return geometry;
    }
    createTureenGeometry(dims) {
        const points = [];
        const segments = 20;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = (t - 0.5) * dims.height * 1.5;
            const radius = dims.width / 2 * (0.7 + 0.3 * Math.sin(t * Math.PI));
            points.push(new THREE.Vector2(radius, y));
        }
        return new THREE.LatheGeometry(points, 32);
    }
    createCasseroleGeometry(dims) {
        return new THREE.BoxGeometry(dims.width, dims.height, dims.depth);
    }
    createTrayGeometry(dims) {
        const trayShape = new THREE.Shape();
        trayShape.moveTo(-dims.width / 2, -dims.depth / 2);
        trayShape.lineTo(dims.width / 2, -dims.depth / 2);
        trayShape.lineTo(dims.width / 2, dims.depth / 2);
        trayShape.lineTo(-dims.width / 2, dims.depth / 2);
        trayShape.closePath();
        const extrudeSettings = {
            depth: dims.height * 0.2,
            bevelEnabled: true,
            bevelThickness: 0.005,
            bevelSize: 0.005,
            bevelSegments: 2
        };
        return new THREE.ExtrudeGeometry(trayShape, extrudeSettings);
    }
    createPitcherGeometry(dims) {
        const points = [];
        const segments = 20;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = (t - 0.5) * dims.height * 2;
            let radius;
            if (t < 0.3) {
                radius = dims.width / 2 * (0.8 + 0.2 * t);
            }
            else if (t < 0.7) {
                radius = dims.width / 2;
            }
            else {
                radius = dims.width / 2 * (1 - (t - 0.7) * 0.5);
            }
            points.push(new THREE.Vector2(radius, y));
        }
        return new THREE.LatheGeometry(points, 32);
    }
    getDishMaterial(config) {
        let roughness = 0.3;
        let metalness = 0.0;
        let transmission = 0;
        switch (config.material) {
            case 'silver':
                roughness = 0.15;
                metalness = 0.95;
                break;
            case 'stainless':
                roughness = 0.2;
                metalness = 0.8;
                break;
            case 'glass':
                roughness = 0.1;
                transmission = 0.9;
                break;
            case 'wood':
                roughness = 0.8;
                break;
            case 'porcelain':
                roughness = 0.2;
                break;
            default: // ceramic
                roughness = 0.4;
        }
        return new THREE.MeshPhysicalMaterial({
            color: config.color,
            roughness,
            metalness,
            transmission,
            transparent: transmission > 0,
            clearcoat: config.material === 'silver' || config.material === 'porcelain' ? 0.8 : 0.0
        });
    }
    createLid(config) {
        const dims = this.sizeDimensions[config.size];
        let lidGeometry;
        switch (config.lidStyle) {
            case 'flat':
                lidGeometry = new THREE.CylinderGeometry(dims.width / 2 * 0.95, dims.width / 2 * 0.95, dims.height * 0.1, 32);
                break;
            case 'ornate':
                lidGeometry = this.createOrnateLidGeometry(dims);
                break;
            case 'knobbed':
                lidGeometry = this.createKnobbedLidGeometry(dims);
                break;
            default: // domed
                lidGeometry = new THREE.SphereGeometry(dims.width / 2 * 0.9, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        }
        const lid = new THREE.Mesh(lidGeometry, this.getDishMaterial(config));
        lid.position.y = dims.height * 0.8;
        return lid;
    }
    createOrnateLidGeometry(dims) {
        const points = [];
        const segments = 30;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 0.5;
            const radius = dims.width / 2 * 0.9 * Math.cos(angle);
            const y = dims.width / 2 * 0.9 * Math.sin(angle) * 1.3;
            points.push(new THREE.Vector2(radius, y));
        }
        return new THREE.LatheGeometry(points, 32);
    }
    createKnobbedLidGeometry(dims) {
        const lidGroup = new THREE.Group();
        const baseLid = new THREE.SphereGeometry(dims.width / 2 * 0.9, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const knob = new THREE.SphereGeometry(dims.width * 0.1, 16, 16);
        knob.translate(0, dims.width / 2 * 0.9 + dims.width * 0.05, 0);
        // Merge would require BufferGeometryUtils, simplified here
        return baseLid;
    }
    createHandles(config) {
        const handles = new THREE.Group();
        const dims = this.sizeDimensions[config.size];
        const handleMaterial = this.getDishMaterial(config);
        if (config.handles === 'side') {
            // Side handles for casserole/tray
            const handleGeom = new THREE.BoxGeometry(0.03, dims.height * 0.4, 0.08);
            const leftHandle = new THREE.Mesh(handleGeom, handleMaterial);
            leftHandle.position.set(-dims.width / 2 - 0.02, 0, 0);
            const rightHandle = leftHandle.clone();
            rightHandle.position.set(dims.width / 2 + 0.02, 0, 0);
            handles.add(leftHandle, rightHandle);
        }
        else if (config.handles === 'loop') {
            // Loop handles for tureen/pitcher
            const loopShape = new THREE.TorusGeometry(dims.width * 0.15, 0.01, 16, 32, Math.PI);
            const leftLoop = new THREE.Mesh(loopShape, handleMaterial);
            leftLoop.rotation.z = Math.PI / 2;
            leftLoop.position.set(-dims.width / 2, dims.height * 0.3, 0);
            const rightLoop = leftLoop.clone();
            rightLoop.position.set(dims.width / 2, dims.height * 0.3, 0);
            handles.add(leftLoop, rightLoop);
        }
        else if (config.handles === 'integrated') {
            // Integrated handles (part of body, simplified)
            const intGeom = new THREE.BoxGeometry(0.05, dims.height * 0.3, 0.03);
            const handle = new THREE.Mesh(intGeom, handleMaterial);
            handle.position.set(dims.width / 2, 0, 0);
            handles.add(handle);
        }
        return handles;
    }
    getVariations() {
        return [
            { ...this.defaultParams, type: 'platter', material: 'porcelain', size: 'large' },
            { ...this.defaultParams, type: 'bowl', material: 'ceramic', color: '#F5F5DC', size: 'medium' },
            { ...this.defaultParams, type: 'tureen', material: 'silver', hasLid: true, lidStyle: 'ornate', handles: 'loop' },
            { ...this.defaultParams, type: 'casserole', material: 'ceramic', color: '#8B0000', hasLid: true, handles: 'side' },
            { ...this.defaultParams, type: 'pitcher', material: 'glass', size: 'large' }
        ];
    }
}
//# sourceMappingURL=ServingDishes.js.map