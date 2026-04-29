/**
 * KitchenAppliances - Procedural generation of kitchen appliances
 *
 * Generates: Refrigerators, Stoves/Ovens, Dishwashers, Microwaves
 * Each with multiple variations, parametric controls, and style options
 */
import { Group, BoxGeometry, CylinderGeometry, TorusGeometry, Mesh } from 'three';
import { ApplianceBase } from './ApplianceBase';
export class KitchenAppliances extends ApplianceBase {
    getDefaultConfig() {
        return {
            ...super.getDefaultConfig(),
            applianceType: 'refrigerator',
            capacity: 'standard',
            fuelType: 'electric',
            hasIceMaker: false,
            hasConvection: false,
            burnerCount: 4,
        };
    }
    constructor() {
        super();
    }
    generate(params = {}) {
        const finalParams = this.validateAndMergeParams(params);
        const group = new Group();
        switch (finalParams.applianceType) {
            case 'refrigerator':
                group.add(this.generateRefrigerator(finalParams));
                break;
            case 'stove':
                group.add(this.generateStove(finalParams));
                break;
            case 'dishwasher':
                group.add(this.generateDishwasher(finalParams));
                break;
            case 'microwave':
                group.add(this.generateMicrowave(finalParams));
                break;
        }
        return group;
    }
    generateRefrigerator(params) {
        const group = new Group();
        const height = params.capacity === 'compact' ? 1.2 : params.capacity === 'large' ? 1.9 : 1.6;
        const width = params.capacity === 'compact' ? 0.5 : params.capacity === 'large' ? 0.9 : 0.7;
        const depth = 0.7;
        // Main body
        const bodyGroup = this.generateMainBody({ ...params, width, height, depth });
        group.add(bodyGroup);
        // Door configuration based on style
        if (params.style === 'modern') {
            // Side-by-side or French door
            const doorHeight = height * 0.45;
            // Left door (freezer)
            const leftDoor = this.createDoor(params, { x: -width * 0.25, y: height * 0.25, z: 0 }, { w: width * 0.45, h: doorHeight });
            group.add(leftDoor);
            // Right door (fridge)
            const rightDoor = this.createDoor(params, { x: width * 0.25, y: height * 0.25, z: 0 }, { w: width * 0.45, h: doorHeight });
            group.add(rightDoor);
            // Bottom freezer drawer if French door
            if (Math.random() > 0.5) {
                const drawer = this.createDrawer(params, width, height * 0.4);
                drawer.position.y = -height * 0.3;
                group.add(drawer);
            }
        }
        else {
            // Top-freezer or bottom-freezer single door
            const topDoorHeight = height * 0.25;
            const bottomDoorHeight = height * 0.65;
            // Top door
            const topDoor = this.createDoor(params, { x: 0, y: height * 0.375, z: 0 }, { w: width, h: topDoorHeight });
            group.add(topDoor);
            // Bottom door
            const bottomDoor = this.createDoor(params, { x: 0, y: -height * 0.175, z: 0 }, { w: width, h: bottomDoorHeight });
            group.add(bottomDoor);
        }
        // Ice maker dispenser
        if (params.hasIceMaker && params.style === 'modern') {
            const iceDispenser = this.createIceDispenser();
            iceDispenser.position.set(-width * 0.15, height * 0.3, depth / 2 + 0.02);
            group.add(iceDispenser);
        }
        // Handles
        this.addRefrigeratorHandles(group, params, width, height, depth);
        return group;
    }
    generateStove(params) {
        const group = new Group();
        const width = params.burnerCount === 6 ? 0.9 : 0.6;
        const height = 0.9;
        const depth = 0.65;
        // Base cabinet
        const baseGroup = this.generateMainBody({ ...params, width, height: height * 0.6, depth });
        group.add(baseGroup);
        // Cooktop
        const cooktop = this.createCooktop(params, width, depth);
        cooktop.position.y = height * 0.6 / 2 + height * 0.4 / 2;
        group.add(cooktop);
        // Control panel
        const controlPanel = this.createControlPanel(params, width);
        controlPanel.position.set(0, height * 0.75, depth / 2 + 0.02);
        group.add(controlPanel);
        // Oven door
        const ovenDoor = this.createOvenDoor(params, width, height * 0.5);
        ovenDoor.position.set(0, height * 0.3, depth / 2 + 0.02);
        group.add(ovenDoor);
        // Backguard
        if (params.style !== 'minimal') {
            const backguard = this.createBackguard(params, width);
            backguard.position.set(0, height * 0.8, -depth / 2);
            group.add(backguard);
        }
        // Gas burners or electric coils
        if (params.fuelType === 'gas') {
            this.addGasBurners(group, params, width, params.burnerCount || 4);
        }
        else {
            this.addElectricCoils(group, params, width, params.burnerCount || 4);
        }
        return group;
    }
    generateDishwasher(params) {
        const group = new Group();
        const width = 0.6;
        const height = 0.85;
        const depth = 0.6;
        // Main body
        const bodyGroup = this.generateMainBody({ ...params, width, height, depth });
        group.add(bodyGroup);
        // Front panel/door
        const door = this.createDoor(params, { x: 0, y: 0, z: 0 }, { w: width, h: height * 0.85 });
        door.position.z = depth / 2 + 0.02;
        group.add(door);
        // Control strip at top
        const controlStrip = this.createControlStrip(params, width);
        controlStrip.position.set(0, height * 0.4, depth / 2 + 0.01);
        group.add(controlStrip);
        // Kick plate
        const kickPlate = this.createKickPlate(params, width);
        kickPlate.position.set(0, -height / 2 + 0.05, depth / 2);
        group.add(kickPlate);
        return group;
    }
    generateMicrowave(params) {
        const group = new Group();
        const width = params.capacity === 'compact' ? 0.45 : 0.55;
        const height = params.capacity === 'compact' ? 0.3 : 0.35;
        const depth = 0.35;
        // Main body
        const bodyGroup = this.generateMainBody({ ...params, width, height, depth });
        group.add(bodyGroup);
        // Door with window
        const doorGroup = this.createMicrowaveDoor(params, width, height);
        doorGroup.position.z = depth / 2 + 0.02;
        group.add(doorGroup);
        // Control panel on side
        const controlPanel = this.createMicrowaveControls(params);
        controlPanel.position.set(width / 2 + 0.02, 0, 0);
        group.add(controlPanel);
        return group;
    }
    createCooktop(params, width, depth) {
        const group = new Group();
        const cooktopGeo = new BoxGeometry(width, 0.03, depth);
        const cooktopMat = this.createPBRMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1,
        });
        const cooktop = new Mesh(cooktopGeo, cooktopMat);
        group.add(cooktop);
        return group;
    }
    createControlPanel(params, width) {
        const group = new Group();
        const panelGeo = new BoxGeometry(width * 0.8, 0.05, 0.03);
        const panelMat = this.createPBRMaterial({
            color: 0x222222,
            metalness: 0.5,
            roughness: 0.3,
        });
        const panel = new Mesh(panelGeo, panelMat);
        group.add(panel);
        // Add knobs or buttons
        const knobCount = params.fuelType === 'gas' ? 4 : 3;
        for (let i = 0; i < knobCount; i++) {
            const knob = new Mesh(new CylinderGeometry(0.02, 0.02, 0.03, 16), this.getHandleMaterial('stainless'));
            knob.rotation.x = Math.PI / 2;
            knob.position.x = -width * 0.3 + (i * width * 0.2);
            knob.position.z = 0.03;
            group.add(knob);
        }
        return group;
    }
    createOvenDoor(params, width, height) {
        const group = new Group();
        const doorGeo = new BoxGeometry(width * 0.9, height * 0.9, 0.04);
        const doorMat = this.createPBRMaterial({
            color: params.finish === 'stainless' ? 0x333333 : 0x111111,
            metalness: 0.7,
            roughness: 0.2,
        });
        const door = new Mesh(doorGeo, doorMat);
        group.add(door);
        // Window
        const windowGeo = new BoxGeometry(width * 0.6, height * 0.5, 0.02);
        const windowMat = this.createPBRMaterial({
            color: 0x000000,
            metalness: 0.9,
            roughness: 0.05,
        });
        const window = new Mesh(windowGeo, windowMat);
        window.position.z = 0.03;
        group.add(window);
        // Handle
        const handle = this.createHandle(params.handleStyle, width * 0.6, params.finish);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0, height * 0.3, 0.04);
        group.add(handle);
        return group;
    }
    createBackguard(params, width) {
        const group = new Group();
        const backGeo = new BoxGeometry(width, 0.15, 0.05);
        const backMat = this.getFinishMaterial(params.finish);
        const back = new Mesh(backGeo, backMat);
        group.add(back);
        return group;
    }
    addGasBurners(group, params, width, count) {
        const burnerPositions = this.getBurnerPositions(count, width);
        burnerPositions.forEach(pos => {
            const burner = new Mesh(new TorusGeometry(0.06, 0.01, 8, 24), this.createPBRMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 }));
            burner.rotation.x = Math.PI / 2;
            burner.position.set(pos.x, 0.02, pos.z);
            group.add(burner);
            // Burner grate
            const grate = this.createBurnerGrate();
            grate.position.set(pos.x, 0.04, pos.z);
            group.add(grate);
        });
    }
    addElectricCoils(group, params, width, count) {
        const burnerPositions = this.getBurnerPositions(count, width);
        burnerPositions.forEach(pos => {
            const coil = new Mesh(new TorusGeometry(0.07, 0.008, 8, 32), this.createPBRMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }));
            coil.rotation.x = Math.PI / 2;
            coil.position.set(pos.x, 0.02, pos.z);
            group.add(coil);
        });
    }
    getBurnerPositions(count, width) {
        const offset = width * 0.25;
        if (count === 4) {
            return [
                { x: -offset, z: -offset },
                { x: offset, z: -offset },
                { x: -offset, z: offset },
                { x: offset, z: offset },
            ];
        }
        else if (count === 5) {
            return [
                { x: -offset, z: -offset },
                { x: offset, z: -offset },
                { x: -offset, z: offset },
                { x: offset, z: offset },
                { x: 0, z: 0 },
            ];
        }
        else {
            // 6 burners
            return [
                { x: -offset * 1.2, z: -offset },
                { x: 0, z: -offset },
                { x: offset * 1.2, z: -offset },
                { x: -offset * 1.2, z: offset },
                { x: 0, z: offset },
                { x: offset * 1.2, z: offset },
            ];
        }
    }
    createBurnerGrate() {
        const group = new Group();
        // Simple cross grate
        const barGeo = new BoxGeometry(0.15, 0.01, 0.02);
        const barMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.5 });
        const bar1 = new Mesh(barGeo, barMat);
        const bar2 = new Mesh(barGeo, barMat);
        bar2.rotation.y = Math.PI / 2;
        group.add(bar1);
        group.add(bar2);
        return group;
    }
    createDrawer(params, width, height) {
        const group = new Group();
        const drawerGeo = new BoxGeometry(width * 0.95, height * 0.95, 0.03);
        const drawerMat = this.getFinishMaterial(params.finish);
        const drawer = new Mesh(drawerGeo, drawerMat);
        group.add(drawer);
        // Handle
        const handle = this.createHandle(params.handleStyle, width * 0.6, params.finish);
        handle.position.set(0, 0, 0.03);
        group.add(handle);
        return group;
    }
    createIceDispenser() {
        const group = new Group();
        const dispenserGeo = new BoxGeometry(0.08, 0.12, 0.02);
        const dispenserMat = this.createPBRMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
        const dispenser = new Mesh(dispenserGeo, dispenserMat);
        group.add(dispenser);
        // Buttons
        const buttonGeo = new CylinderGeometry(0.015, 0.015, 0.01, 16);
        const buttonMat = this.createEmissiveMaterial(0x00ff00, 0.5);
        ['water', 'ice'].forEach((type, i) => {
            const button = new Mesh(buttonGeo, buttonMat);
            button.position.set(0, 0.03 - i * 0.05, 0.015);
            group.add(button);
        });
        return group;
    }
    createMicrowaveDoor(params, width, height) {
        const group = new Group();
        const doorGeo = new BoxGeometry(width * 0.7, height * 0.85, 0.03);
        const doorMat = this.createPBRMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 });
        const door = new Mesh(doorGeo, doorMat);
        group.add(door);
        // Window
        const windowGeo = new BoxGeometry(width * 0.5, height * 0.5, 0.02);
        const windowMat = this.createPBRMaterial({ color: 0x000000, metalness: 0.9, roughness: 0.05 });
        const window = new Mesh(windowGeo, windowMat);
        window.position.z = 0.02;
        group.add(window);
        // Handle
        const handle = this.createHandle('bar', height * 0.5, params.finish);
        handle.position.set(width * 0.3, 0, 0.03);
        group.add(handle);
        return group;
    }
    createMicrowaveControls(params) {
        const group = new Group();
        const panelGeo = new BoxGeometry(0.03, 0.2, 0.15);
        const panelMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.3 });
        const panel = new Mesh(panelGeo, panelMat);
        group.add(panel);
        // Keypad buttons
        const buttonGeo = new BoxGeometry(0.02, 0.015, 0.01);
        const buttonMat = this.createPBRMaterial({ color: 0x444444, emissive: 0x222222, emissiveIntensity: 0.3 });
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 3; col++) {
                const button = new Mesh(buttonGeo, buttonMat);
                button.position.set(0, 0.08 - row * 0.05, 0.08 - col * 0.04);
                group.add(button);
            }
        }
        return group;
    }
    createControlStrip(params, width) {
        const group = new Group();
        const stripGeo = new BoxGeometry(width * 0.9, 0.03, 0.02);
        const stripMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.3 });
        const strip = new Mesh(stripGeo, stripMat);
        group.add(strip);
        // LED indicators
        const ledGeo = new CylinderGeometry(0.005, 0.005, 0.01, 8);
        const ledMat = this.createEmissiveMaterial(0x00ff00, 0.8);
        ['power', 'start', 'rinse'].forEach((_, i) => {
            const led = new Mesh(ledGeo, ledMat);
            led.position.x = -width * 0.3 + i * 0.15;
            led.position.z = 0.015;
            group.add(led);
        });
        return group;
    }
    createKickPlate(params, width) {
        const group = new Group();
        const plateGeo = new BoxGeometry(width * 0.95, 0.08, 0.02);
        const plateMat = this.createPBRMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.6 });
        const plate = new Mesh(plateGeo, plateMat);
        group.add(plate);
        return group;
    }
    addRefrigeratorHandles(group, params, width, height, depth) {
        const handlePositions = [
            { x: -width * 0.15, y: height * 0.25 },
            { x: width * 0.15, y: height * 0.25 },
        ];
        handlePositions.forEach(pos => {
            const handle = this.createHandle(params.handleStyle, height * 0.35, params.finish);
            handle.position.set(pos.x, pos.y, depth / 2 + 0.04);
            group.add(handle);
        });
    }
    getRandomParams() {
        const types = ['refrigerator', 'stove', 'dishwasher', 'microwave'];
        const capacities = ['compact', 'standard', 'large'];
        const fuelTypes = ['electric', 'gas'];
        const applianceType = types[Math.floor(Math.random() * types.length)];
        let burnerCount = 4;
        if (applianceType === 'stove') {
            burnerCount = (this.seededRandom() > 0.7 ? 6 : this.seededRandom() > 0.4 ? 5 : 4);
        }
        return {
            ...super.getRandomParams(),
            applianceType,
            capacity: capacities[Math.floor(Math.random() * capacities.length)],
            fuelType: fuelTypes[Math.floor(Math.random() * fuelTypes.length)],
            hasIceMaker: applianceType === 'refrigerator' && Math.random() > 0.5,
            hasConvection: applianceType === 'stove' && Math.random() > 0.4,
            burnerCount,
        };
    }
}
//# sourceMappingURL=KitchenAppliances.js.map