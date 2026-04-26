/**
 * Wardrobe Generator
 *
 * Procedural generation of wardrobes and armoires including
 * freestanding wardrobes, built-in closets, armoires,
 * and wardrobe cabinets with various door styles.
 *
 * @module WardrobeGenerator
 */
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
export class WardrobeGenerator {
    constructor() {
        this.noise = createNoise3D();
    }
    /**
     * Generate a wardrobe
     */
    generate(params = {}) {
        const finalParams = {
            type: params.type || 'freestanding',
            doorStyle: params.doorStyle || 'hinged',
            material: params.material || 'wood',
            width: params.width || 1.5,
            height: params.height || 2.2,
            depth: params.depth || 0.6,
            doorCount: params.doorCount || 2,
            color: params.color || new THREE.Color(0x8b6f47),
            interiorColor: params.interiorColor,
            handleStyle: params.handleStyle || 'pull',
            interiorLayout: params.interiorLayout || 'mixed',
            shelves: params.shelves ?? true,
            drawers: params.drawers ?? false,
            mirror: params.mirror ?? false,
            decorative: params.decorative || false,
            feet: params.feet ?? true,
            crown: params.crown ?? false
        };
        if (!finalParams.interiorColor) {
            finalParams.interiorColor = finalParams.color.clone().multiplyScalar(0.8);
        }
        const group = new THREE.Group();
        const doors = [];
        // Create main cabinet structure
        const cabinet = this.createCabinet(finalParams);
        group.add(cabinet);
        // Create doors based on style
        const doorSystem = this.createDoors(finalParams);
        doors.push(...doorSystem.doors);
        group.add(doorSystem.frame);
        // Create interior layout
        const interior = this.createInterior(finalParams);
        group.add(interior);
        // Add feet/base
        if (finalParams.feet) {
            const feet = this.createFeet(finalParams);
            group.add(feet);
        }
        // Add crown molding
        if (finalParams.crown) {
            const crown = this.createCrown(finalParams);
            group.add(crown);
        }
        // Add decorative elements
        if (finalParams.decorative) {
            const decorations = this.createDecorations(finalParams);
            group.add(decorations);
        }
        return {
            mesh: group,
            doors,
            interior,
            params: finalParams
        };
    }
    /**
     * Create main cabinet box
     */
    createCabinet(params) {
        const group = new THREE.Group();
        const panelThickness = 0.02;
        // Back panel
        const backGeometry = new THREE.BoxGeometry(params.width, params.height, panelThickness);
        const backMaterial = this.getMaterial(params.material, params.color);
        const back = new THREE.Mesh(backGeometry, backMaterial);
        back.position.z = -params.depth / 2 + panelThickness / 2;
        back.castShadow = true;
        back.receiveShadow = true;
        group.add(back);
        // Side panels
        const sideGeometry = new THREE.BoxGeometry(panelThickness, params.height, params.depth);
        const sideMaterial = this.getMaterial(params.material, params.color);
        const leftSide = new THREE.Mesh(sideGeometry, sideMaterial);
        leftSide.position.x = -params.width / 2 + panelThickness / 2;
        leftSide.castShadow = true;
        leftSide.receiveShadow = true;
        group.add(leftSide);
        const rightSide = new THREE.Mesh(sideGeometry, sideMaterial);
        rightSide.position.x = params.width / 2 - panelThickness / 2;
        rightSide.castShadow = true;
        rightSide.receiveShadow = true;
        group.add(rightSide);
        // Top panel
        const topGeometry = new THREE.BoxGeometry(params.width, panelThickness, params.depth);
        const top = new THREE.Mesh(topGeometry, sideMaterial);
        top.position.y = params.height / 2 - panelThickness / 2;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);
        // Bottom panel (raised if feet enabled)
        const bottomY = params.feet ? 0.08 : panelThickness / 2;
        const bottomGeometry = new THREE.BoxGeometry(params.width, panelThickness, params.depth);
        const bottom = new THREE.Mesh(bottomGeometry, sideMaterial);
        bottom.position.y = bottomY;
        bottom.castShadow = true;
        bottom.receiveShadow = true;
        group.add(bottom);
        // Fixed center divider for multi-door wardrobes
        if (params.doorCount >= 3 && params.type !== 'sliding') {
            const dividerGeometry = new THREE.BoxGeometry(panelThickness, params.height - panelThickness * 2, params.depth - 0.02);
            const divider = new THREE.Mesh(dividerGeometry, sideMaterial);
            divider.position.x = 0;
            divider.position.y = 0;
            group.add(divider);
        }
        return group;
    }
    /**
     * Create door system
     */
    createDoors(params) {
        const frame = new THREE.Group();
        const doors = [];
        const doorWidth = params.width / params.doorCount;
        const doorHeight = params.height - 0.04;
        const doorThickness = 0.025;
        // Create door frame
        const frameMaterial = this.getMaterial(params.material, params.color);
        // Top rail
        const topRailGeometry = new THREE.BoxGeometry(params.width, 0.05, 0.03);
        const topRail = new THREE.Mesh(topRailGeometry, frameMaterial);
        topRail.position.y = params.height / 2 - 0.025;
        frame.add(topRail);
        // Bottom rail
        const bottomRailGeometry = new THREE.BoxGeometry(params.width, 0.05, 0.03);
        const bottomRail = new THREE.Mesh(bottomRailGeometry, frameMaterial);
        bottomRail.position.y = -params.height / 2 + 0.025;
        frame.add(bottomRail);
        // Stiles (vertical frame pieces)
        const stileGeometry = new THREE.BoxGeometry(0.05, params.height - 0.1, 0.03);
        const leftStile = new THREE.Mesh(stileGeometry, frameMaterial);
        leftStile.position.x = -params.width / 2 + 0.025;
        frame.add(leftStile);
        const rightStile = new THREE.Mesh(stileGeometry, frameMaterial);
        rightStile.position.x = params.width / 2 - 0.025;
        frame.add(rightStile);
        // Create individual doors
        for (let i = 0; i < params.doorCount; i++) {
            const door = this.createDoor(params, doorWidth - 0.01, doorHeight, doorThickness, i);
            const x = -params.width / 2 + doorWidth / 2 + i * doorWidth;
            door.position.set(x, 0, params.depth / 2 - doorThickness / 2 - 0.01);
            doors.push(door);
            frame.add(door);
        }
        return { frame, doors };
    }
    /**
     * Create individual door
     */
    createDoor(params, width, height, thickness, index) {
        let geometry;
        if (params.doorStyle === 'french') {
            // French door with panels
            geometry = this.createPanelDoorGeometry(width, height, thickness);
        }
        else if (params.doorStyle === 'sliding') {
            // Sliding door (often full glass or mirrored)
            geometry = new THREE.BoxGeometry(width, height, thickness);
        }
        else {
            // Standard flat or raised panel door
            geometry = new THREE.BoxGeometry(width, height, thickness);
        }
        const material = this.getDoorMaterial(params);
        const door = new THREE.Mesh(geometry, material);
        // Add handle
        if (params.handleStyle !== 'none' && params.doorStyle !== 'curtain') {
            const handle = this.createHandle(params);
            const handleX = params.doorStyle === 'sliding' ? 0 : width / 2 - 0.05;
            handle.position.set(handleX, 0, thickness / 2 + 0.01);
            door.add(handle);
        }
        // Add mirror if requested
        if (params.mirror && (index === 0 || index === params.doorCount - 1)) {
            const mirrorGeometry = new THREE.PlaneGeometry(width * 0.6, height * 0.7);
            const mirrorMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0,
                metalness: 1
            });
            const mirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
            mirror.position.set(0, 0, thickness / 2 + 0.005);
            door.add(mirror);
        }
        return door;
    }
    /**
     * Create panel door geometry (French style)
     */
    createPanelDoorGeometry(width, height, thickness) {
        const geometry = new THREE.BoxGeometry(width, height, thickness);
        // In production, would add recessed panels using custom geometry
        // For now, use simple box with frame detail
        return geometry;
    }
    /**
     * Create door handle
     */
    createHandle(params) {
        let geometry;
        const material = new THREE.MeshStandardMaterial({
            color: params.material === 'metal' ? 0xcccccc : 0xffd700,
            roughness: 0.2,
            metalness: 0.9
        });
        switch (params.handleStyle) {
            case 'knob':
                geometry = new THREE.SphereGeometry(0.02, 8, 8);
                break;
            case 'pull':
                geometry = new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8);
                break;
            case 'recessed':
                geometry = new THREE.BoxGeometry(0.02, 0.08, 0.01);
                break;
            case 'ornate':
                geometry = new THREE.TorusGeometry(0.025, 0.008, 8, 16);
                break;
            default:
                geometry = new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8);
        }
        const handle = new THREE.Mesh(geometry, material);
        if (params.handleStyle === 'pull') {
            handle.rotation.x = Math.PI / 2;
        }
        else if (params.handleStyle === 'ornate') {
            handle.rotation.y = Math.PI / 2;
        }
        return handle;
    }
    /**
     * Create interior layout
     */
    createInterior(params) {
        const group = new THREE.Group();
        const interiorWidth = params.width - 0.08;
        const interiorHeight = params.height - 0.1;
        const interiorDepth = params.depth - 0.04;
        // Hanging rod
        if (params.interiorLayout !== 'shelves-only') {
            const rodGeometry = new THREE.CylinderGeometry(0.015, 0.015, interiorWidth, 8);
            const rodMaterial = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.3,
                metalness: 0.8
            });
            const rod = new THREE.Mesh(rodGeometry, rodMaterial);
            rod.position.set(0, interiorHeight / 3, -interiorDepth / 2 + 0.3);
            group.add(rod);
            // Rod supports
            const supportGeometry = new THREE.BoxGeometry(0.03, 0.1, 0.15);
            const supportMaterial = this.getMaterial(params.material, params.interiorColor);
            const leftSupport = new THREE.Mesh(supportGeometry, supportMaterial);
            leftSupport.position.set(-interiorWidth / 2 + 0.05, interiorHeight / 3 + 0.05, -interiorDepth / 2 + 0.1);
            group.add(leftSupport);
            const rightSupport = new THREE.Mesh(supportGeometry, supportMaterial);
            rightSupport.position.set(interiorWidth / 2 - 0.05, interiorHeight / 3 + 0.05, -interiorDepth / 2 + 0.1);
            group.add(rightSupport);
        }
        // Shelves
        if (params.shelves && params.interiorLayout !== 'hanging-only') {
            const shelfCount = 3;
            const shelfSpacing = interiorHeight / shelfCount;
            const shelfGeometry = new THREE.BoxGeometry(interiorWidth, 0.02, interiorDepth - 0.1);
            const shelfMaterial = this.getMaterial(params.material, params.interiorColor);
            for (let i = 0; i < shelfCount; i++) {
                const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
                shelf.position.set(0, -interiorHeight / 2 + shelfSpacing * (i + 1), 0);
                shelf.receiveShadow = true;
                group.add(shelf);
            }
        }
        // Drawers at bottom
        if (params.drawers) {
            const drawerCount = 2;
            const drawerHeight = 0.15;
            const drawerY = -interiorHeight / 2 + drawerHeight / 2;
            for (let i = 0; i < drawerCount; i++) {
                const drawer = this.createDrawer(params, interiorWidth - 0.04, drawerHeight, interiorDepth - 0.1);
                drawer.position.set(0, drawerY + i * drawerHeight, 0);
                group.add(drawer);
            }
        }
        return group;
    }
    /**
     * Create interior drawer
     */
    createDrawer(params, width, height, depth) {
        const group = new THREE.Group();
        // Drawer box
        const boxGeometry = new THREE.BoxGeometry(width, height, depth);
        const boxMaterial = this.getMaterial(params.material, params.interiorColor);
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        group.add(box);
        // Drawer front
        const frontGeometry = new THREE.BoxGeometry(width, height, 0.02);
        const frontMaterial = this.getMaterial(params.material, params.color);
        const front = new THREE.Mesh(frontGeometry, frontMaterial);
        front.position.z = depth / 2 + 0.01;
        group.add(front);
        // Drawer handle
        const handle = this.createHandle({ ...params, handleStyle: 'pull' });
        handle.position.set(0, 0, depth / 2 + 0.025);
        group.add(handle);
        return group;
    }
    /**
     * Create wardrobe feet/base
     */
    createFeet(params) {
        const group = new THREE.Group();
        const footPositions = [
            [-params.width / 2 + 0.05, 0.04, -params.depth / 2 + 0.05],
            [params.width / 2 - 0.05, 0.04, -params.depth / 2 + 0.05],
            [-params.width / 2 + 0.05, 0.04, params.depth / 2 - 0.05],
            [params.width / 2 - 0.05, 0.04, params.depth / 2 - 0.05]
        ];
        if (params.style === 'modern' || params.material === 'metal') {
            // Modern block feet
            const footGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
            const footMaterial = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.3,
                metalness: 0.8
            });
            footPositions.forEach(pos => {
                const foot = new THREE.Mesh(footGeometry, footMaterial);
                foot.position.set(...pos);
                group.add(foot);
            });
        }
        else {
            // Traditional turned feet
            const footGeometry = new THREE.CylinderGeometry(0.03, 0.05, 0.08, 8);
            const footMaterial = this.getMaterial(params.material, params.color);
            footPositions.forEach(pos => {
                const foot = new THREE.Mesh(footGeometry, footMaterial);
                foot.position.set(...pos);
                group.add(foot);
            });
        }
        // Add baseboard/plinth
        const plinthGeometry = new THREE.BoxGeometry(params.width - 0.04, 0.05, params.depth - 0.04);
        const plinthMaterial = this.getMaterial(params.material, params.color);
        const plinth = new THREE.Mesh(plinthGeometry, plinthMaterial);
        plinth.position.y = 0.05;
        group.add(plinth);
        return group;
    }
    /**
     * Create crown molding
     */
    createCrown(params) {
        const group = new THREE.Group();
        // Front crown
        const frontGeometry = new THREE.BoxGeometry(params.width, 0.08, 0.06);
        const frontMaterial = this.getMaterial(params.material, params.color);
        const frontCrown = new THREE.Mesh(frontGeometry, frontMaterial);
        frontCrown.position.y = params.height / 2 + 0.04;
        frontCrown.position.z = params.depth / 2 - 0.03;
        group.add(frontCrown);
        // Side crowns
        const sideGeometry = new THREE.BoxGeometry(0.06, 0.08, params.depth);
        const leftSide = new THREE.Mesh(sideGeometry, frontMaterial);
        leftSide.position.set(-params.width / 2 + 0.03, params.height / 2 + 0.04, 0);
        group.add(leftSide);
        const rightSide = new THREE.Mesh(sideGeometry, frontMaterial);
        rightSide.position.set(params.width / 2 - 0.03, params.height / 2 + 0.04, 0);
        group.add(rightSide);
        return group;
    }
    /**
     * Create decorative elements
     */
    createDecorations(params) {
        const group = new THREE.Group();
        if (params.type === 'armoire' || params.decorative) {
            // Add decorative pediment at top
            const pedimentGeometry = new THREE.ConeGeometry(params.width / 2 + 0.1, 0.3, 4);
            const pedimentMaterial = this.getMaterial(params.material, params.color);
            const pediment = new THREE.Mesh(pedimentGeometry, pedimentMaterial);
            pediment.position.y = params.height + 0.15;
            pediment.rotation.y = Math.PI / 4;
            group.add(pediment);
            // Add decorative side columns
            const columnGeometry = new THREE.CylinderGeometry(0.04, 0.05, params.height * 0.8, 8);
            const leftColumn = new THREE.Mesh(columnGeometry, pedimentMaterial);
            leftColumn.position.set(-params.width / 2 - 0.05, 0, params.depth / 2 + 0.05);
            group.add(leftColumn);
            const rightColumn = new THREE.Mesh(columnGeometry, pedimentMaterial);
            rightColumn.position.set(params.width / 2 + 0.05, 0, params.depth / 2 + 0.05);
            group.add(rightColumn);
        }
        return group;
    }
    /**
     * Get appropriate material
     */
    getMaterial(materialType, color) {
        switch (materialType) {
            case 'wood':
                return new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.6,
                    metalness: 0
                });
            case 'mdf':
                return new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.4,
                    metalness: 0
                });
            case 'metal':
                return new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.3,
                    metalness: 0.7
                });
            case 'glass':
                return new THREE.MeshPhysicalMaterial({
                    color: color.clone().multiplyScalar(0.5),
                    transparent: true,
                    opacity: 0.3,
                    transmission: 0.9,
                    roughness: 0.1,
                    metalness: 0
                });
            case 'mirrored':
                return new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    roughness: 0,
                    metalness: 1
                });
            case 'composite':
            default:
                return new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.5,
                    metalness: 0.1
                });
        }
    }
    /**
     * Get door material (may differ from cabinet body)
     */
    getDoorMaterial(params) {
        if (params.doorStyle === 'curtain') {
            return new THREE.MeshStandardMaterial({
                color: params.color,
                roughness: 0.8,
                metalness: 0,
                side: THREE.DoubleSide
            });
        }
        return this.getMaterial(params.material, params.color);
    }
    /**
     * Generate a set of matching wardrobes
     */
    generateSet(count, spacing, params = {}) {
        const group = new THREE.Group();
        for (let i = 0; i < count; i++) {
            const wardrobe = this.generate(params);
            wardrobe.mesh.position.x = i * (params.width || 1.5 + spacing);
            group.add(wardrobe.mesh);
        }
        return group;
    }
}
export default WardrobeGenerator;
//# sourceMappingURL=WardrobeGenerator.js.map