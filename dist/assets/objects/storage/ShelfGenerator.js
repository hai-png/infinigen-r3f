/**
 * ShelfGenerator - Procedural shelving unit generation
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';
export class ShelfGenerator extends BaseObjectGenerator {
    getDefaultParams() {
        return {
            width: 1.0,
            height: 2.0,
            depth: 0.3,
            style: 'modern',
            shelfType: 'bookcase',
            shelfCount: 5,
            adjustable: false,
            hasBack: true,
            hasDoors: false,
            variationSeed: undefined,
        };
    }
    generate(params = {}) {
        const finalParams = { ...this.getDefaultParams(), ...params };
        const rng = new SeededRandom(finalParams.variationSeed || this.seed);
        const group = new THREE.Group();
        group.name = 'Shelf';
        const frame = this.createFrame(finalParams, rng);
        group.add(frame);
        const shelves = this.createShelves(finalParams, rng);
        group.add(shelves);
        if (finalParams.hasBack) {
            const back = this.createBack(finalParams, rng);
            group.add(back);
        }
        if (finalParams.hasDoors) {
            const doors = this.createDoors(finalParams, rng);
            group.add(doors);
        }
        const collisionMesh = this.generateCollisionMesh(group);
        group.userData.collisionMesh = collisionMesh;
        group.userData.params = finalParams;
        group.userData.generatorId = ShelfGenerator.GENERATOR_ID;
        return group;
    }
    createFrame(params, rng) {
        const frame = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({
            color: this.getWoodColor(rng, params.style),
            roughness: 0.5,
            metalness: 0.1,
        });
        if (params.shelfType === 'ladder') {
            // Two angled sides
            const sideGeom = new THREE.BoxGeometry(0.05, params.height, params.depth);
            const leftSide = new THREE.Mesh(sideGeom, material);
            leftSide.position.set(-params.width / 2, params.height / 2, 0);
            leftSide.rotation.x = -0.1;
            frame.add(leftSide);
            const rightSide = new THREE.Mesh(sideGeom.clone(), material);
            rightSide.position.set(params.width / 2, params.height / 2, 0);
            rightSide.rotation.x = -0.1;
            frame.add(rightSide);
        }
        else if (params.shelfType === 'wall_shelf') {
            // Brackets for wall mounting
            const bracketGeom = new THREE.BoxGeometry(0.03, 0.15, params.depth);
            const positions = [-params.width / 3, 0, params.width / 3];
            positions.forEach(x => {
                const bracket = new THREE.Mesh(bracketGeom, material);
                bracket.position.set(x, -0.075, 0);
                frame.add(bracket);
            });
        }
        else {
            // Standard bookcase frame
            const sideGeom = new THREE.BoxGeometry(0.04, params.height, params.depth);
            const leftSide = new THREE.Mesh(sideGeom, material);
            leftSide.position.set(-params.width / 2, params.height / 2, 0);
            frame.add(leftSide);
            const rightSide = new THREE.Mesh(sideGeom.clone(), material);
            rightSide.position.set(params.width / 2, params.height / 2, 0);
            frame.add(rightSide);
            // Top
            const topGeom = new THREE.BoxGeometry(params.width, 0.04, params.depth);
            const top = new THREE.Mesh(topGeom, material);
            top.position.set(0, params.height, 0);
            frame.add(top);
        }
        return frame;
    }
    createShelves(params, rng) {
        const shelfGroup = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({
            color: this.getWoodColor(rng, params.style),
            roughness: 0.4,
            metalness: 0.1,
        });
        const spacing = params.height / (params.shelfCount + 1);
        const shelfThickness = 0.03;
        const effectiveDepth = params.shelfType === 'ladder' ? params.depth * 0.9 : params.depth;
        for (let i = 1; i <= params.shelfCount; i++) {
            let y;
            if (params.shelfType === 'ladder') {
                y = spacing * i - Math.abs(i - params.shelfCount / 2) * 0.05;
            }
            else {
                y = spacing * i;
            }
            const shelfGeom = new THREE.BoxGeometry(params.width - (params.shelfType === 'ladder' ? 0.1 : 0.08), shelfThickness, effectiveDepth - (params.shelfType === 'ladder' ? 0.05 : 0));
            const shelf = new THREE.Mesh(shelfGeom, material);
            shelf.position.set(0, y, params.shelfType === 'ladder' ? 0.05 : 0);
            shelf.castShadow = true;
            shelfGroup.add(shelf);
            // Add shelf pins if adjustable
            if (params.adjustable && params.shelfType !== 'ladder') {
                const pinGeom = new THREE.CylinderGeometry(0.003, 0.003, 0.01, 8);
                const pinMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
                [-1, 1].forEach(side => {
                    const pin = new THREE.Mesh(pinGeom, pinMat);
                    pin.position.set(side * (params.width / 2 - 0.02), y, 0);
                    pin.rotation.x = Math.PI / 2;
                    shelfGroup.add(pin);
                });
            }
        }
        return shelfGroup;
    }
    createBack(params, rng) {
        const thickness = 0.01;
        const geometry = new THREE.BoxGeometry(params.width - 0.08, params.height, thickness);
        const material = new THREE.MeshStandardMaterial({
            color: this.getWoodColor(rng, params.style),
            roughness: 0.6,
            metalness: 0.0,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, params.height / 2, -params.depth / 2 + thickness / 2);
        mesh.receiveShadow = true;
        return mesh;
    }
    createDoors(params, rng) {
        const doorGroup = new THREE.Group();
        const doorHeight = params.height * 0.9;
        const doorWidth = (params.width - 0.1) / 2;
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1,
            metalness: 0.0,
            transmission: 0.9,
        });
        const frameMat = new THREE.MeshStandardMaterial({
            color: this.getWoodColor(rng, params.style),
            roughness: 0.4,
            metalness: 0.1,
        });
        // Left door
        const leftDoor = new THREE.Group();
        const leftFrameGeom = new THREE.BoxGeometry(0.05, doorHeight, 0.03);
        const leftStile = new THREE.Mesh(leftFrameGeom, frameMat);
        leftStile.position.set(-doorWidth / 2 + 0.025, 0, 0);
        leftDoor.add(leftStile);
        const rightStile = new THREE.Mesh(leftFrameGeom.clone(), frameMat);
        rightStile.position.set(doorWidth / 2 - 0.025, 0, 0);
        leftDoor.add(rightStile);
        const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.1, doorHeight * 0.8, 0.02), glassMat);
        glassPanel.position.set(0, 0, 0.005);
        leftDoor.add(glassPanel);
        leftDoor.position.set(-params.width / 4 + 0.05, params.height / 2, params.depth / 2);
        doorGroup.add(leftDoor);
        // Right door
        const rightDoor = leftDoor.clone();
        rightDoor.position.set(params.width / 4 - 0.05, params.height / 2, params.depth / 2);
        doorGroup.add(rightDoor);
        return doorGroup;
    }
    getWoodColor(rng, style) {
        const colors = {
            modern: [0x654321, 0x8B4513, 0x4A4A4A, 0xFFFFFF],
            traditional: [0x654321, 0x8B4513, 0x5C4033],
            industrial: [0x4A3728, 0x3E3E3E, 0x5C5C5C],
            scandinavian: [0xD2B48C, 0xC19A6B, 0xF5F5F5],
            rustic: [0x8B4513, 0xA0522D, 0xCD853F],
        };
        const palette = colors[style] || colors.modern;
        return palette[Math.floor(rng.next() * palette.length)];
    }
    getVariationCount() { return 4 * 5 * 4 * 2 * 2 * 2; }
    register() { ObjectRegistry.register(ShelfGenerator.GENERATOR_ID, this); }
}
ShelfGenerator.GENERATOR_ID = 'shelf_generator';
if (typeof window !== 'undefined') {
    new ShelfGenerator().register();
}
export default ShelfGenerator;
//# sourceMappingURL=ShelfGenerator.js.map