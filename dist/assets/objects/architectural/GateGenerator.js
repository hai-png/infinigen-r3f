import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../core/util/math/index';
export class GateGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            type: 'swing',
            width: 3.0,
            height: 1.8,
            material: 'wood',
            style: 'traditional',
            hasPosts: true,
            postHeight: 2.2,
            hasLatch: true,
            latchType: 'ring',
            hingeStyle: 'visible',
            color: '#4a3728',
            decorativeElements: false,
        };
    }
    getDefaultConfig() {
        return this.defaultParams;
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        this.validateParams(finalParams);
        const group = new THREE.Group();
        const seed = new SeededRandom(this.seed);
        // Generate gate structure based on type
        switch (finalParams.type) {
            case 'swing':
                this.createSwingGate(group, finalParams, seed);
                break;
            case 'slide':
                this.createSlidingGate(group, finalParams, seed);
                break;
            case 'double':
                this.createDoubleGate(group, finalParams, seed);
                break;
            case 'ornate':
                this.createOrnateGate(group, finalParams, seed);
                break;
            case 'farm':
                this.createFarmGate(group, finalParams, seed);
                break;
            case 'picket':
                this.createPicketGate(group, finalParams, seed);
                break;
        }
        // Add posts if requested
        if (finalParams.hasPosts) {
            this.addPosts(group, finalParams, seed);
        }
        // Add latch if requested
        if (finalParams.hasLatch) {
            this.addLatch(group, finalParams, seed);
        }
        // Add hinges
        this.addHinges(group, finalParams, seed);
        // Add decorative elements
        if (finalParams.decorativeElements) {
            this.addDecorativeElements(group, finalParams, seed);
        }
        return group;
    }
    createSwingGate(group, params, seed) {
        const geometry = new THREE.BoxGeometry(params.width, params.height, 0.1);
        const material = this.getMaterial(params);
        const gate = new THREE.Mesh(geometry, material);
        gate.position.set(params.width / 2, params.height / 2, 0);
        group.add(gate);
        // Add horizontal rails
        const railCount = 3;
        for (let i = 0; i < railCount; i++) {
            const y = (params.height / (railCount + 1)) * (i + 1);
            const railGeo = new THREE.BoxGeometry(params.width, 0.08, 0.05);
            const rail = new THREE.Mesh(railGeo, material);
            rail.position.set(params.width / 2, y, 0);
            group.add(rail);
        }
    }
    createSlidingGate(group, params, seed) {
        const panelWidth = params.width * 0.6;
        const geometry = new THREE.BoxGeometry(panelWidth, params.height, 0.1);
        const material = this.getMaterial(params);
        const gate = new THREE.Mesh(geometry, material);
        gate.position.set(panelWidth / 2, params.height / 2, 0);
        group.add(gate);
        // Add track/rail on top
        const trackGeo = new THREE.BoxGeometry(params.width * 1.5, 0.1, 0.15);
        const track = new THREE.Mesh(trackGeo, material);
        track.position.set(params.width * 0.75, params.height + 0.1, 0);
        group.add(track);
    }
    createDoubleGate(group, params, seed) {
        const halfWidth = params.width / 2;
        const material = this.getMaterial(params);
        // Left panel
        const leftGeo = new THREE.BoxGeometry(halfWidth - 0.05, params.height, 0.1);
        const leftPanel = new THREE.Mesh(leftGeo, material);
        leftPanel.position.set(halfWidth / 2 - 0.025, params.height / 2, 0);
        group.add(leftPanel);
        // Right panel
        const rightGeo = new THREE.BoxGeometry(halfWidth - 0.05, params.height, 0.1);
        const rightPanel = new THREE.Mesh(rightGeo, material);
        rightPanel.position.set(params.width - halfWidth / 2 + 0.025, params.height / 2, 0);
        group.add(rightPanel);
    }
    createOrnateGate(group, params, seed) {
        const material = this.getMaterial(params);
        // Create ornate pattern with vertical bars
        const barCount = Math.floor(params.width / 0.15);
        for (let i = 0; i < barCount; i++) {
            const x = (params.width / barCount) * i + 0.075;
            const barGeo = new THREE.CylinderGeometry(0.02, 0.02, params.height, 8);
            const bar = new THREE.Mesh(barGeo, material);
            bar.position.set(x, params.height / 2, 0);
            // Add decorative top
            if (params.style === 'victorian') {
                const topGeo = new THREE.SphereGeometry(0.04, 8, 8);
                const top = new THREE.Mesh(topGeo, material);
                top.position.set(x, params.height + 0.02, 0);
                group.add(top);
            }
            group.add(bar);
        }
        // Add horizontal supports
        const supportCount = 4;
        for (let i = 0; i < supportCount; i++) {
            const y = (params.height / (supportCount + 1)) * (i + 1);
            const supportGeo = new THREE.BoxGeometry(params.width, 0.05, 0.05);
            const support = new THREE.Mesh(supportGeo, material);
            support.position.set(params.width / 2, y, 0);
            group.add(support);
        }
    }
    createFarmGate(group, params, seed) {
        const material = this.getMaterial(params);
        // Diagonal brace pattern typical of farm gates
        const frameGeo = new THREE.BoxGeometry(params.width, params.height, 0.1);
        const frame = new THREE.Mesh(frameGeo, material);
        frame.position.set(params.width / 2, params.height / 2, 0);
        group.add(frame);
        // Add diagonal brace
        const braceLength = Math.sqrt(params.width ** 2 + params.height ** 2);
        const angle = Math.atan2(params.height, params.width);
        const braceGeo = new THREE.BoxGeometry(braceLength, 0.08, 0.05);
        const brace = new THREE.Mesh(braceGeo, material);
        brace.position.set(params.width / 2, params.height / 2, 0);
        brace.rotation.z = -angle;
        group.add(brace);
    }
    createPicketGate(group, params, seed) {
        const material = this.getMaterial(params);
        const picketCount = Math.floor(params.width / 0.12);
        for (let i = 0; i < picketCount; i++) {
            const x = (params.width / picketCount) * i + 0.06;
            const picketHeight = params.height - (i % 2 === 0 ? 0 : 0.1);
            const picketGeo = new THREE.BoxGeometry(0.08, picketHeight, 0.05);
            const picket = new THREE.Mesh(picketGeo, material);
            picket.position.set(x, picketHeight / 2, 0);
            group.add(picket);
        }
        // Add horizontal rails
        const railPositions = [params.height * 0.25, params.height * 0.75];
        railPositions.forEach(y => {
            const railGeo = new THREE.BoxGeometry(params.width, 0.06, 0.05);
            const rail = new THREE.Mesh(railGeo, material);
            rail.position.set(params.width / 2, y, 0);
            group.add(rail);
        });
    }
    addPosts(group, params, seed) {
        const material = this.getMaterial(params);
        const postGeo = new THREE.CylinderGeometry(0.1, 0.12, params.postHeight, 8);
        // Left post
        const leftPost = new THREE.Mesh(postGeo, material);
        leftPost.position.set(0, params.postHeight / 2, 0);
        group.add(leftPost);
        // Right post
        const rightPost = new THREE.Mesh(postGeo, material);
        rightPost.position.set(params.width, params.postHeight / 2, 0);
        group.add(rightPost);
        // Add post caps
        if (params.style !== 'modern') {
            const capGeo = new THREE.SphereGeometry(0.13, 8, 8);
            const leftCap = new THREE.Mesh(capGeo, material);
            leftCap.position.set(0, params.postHeight + 0.05, 0);
            group.add(leftCap);
            const rightCap = new THREE.Mesh(capGeo, material);
            rightCap.position.set(params.width, params.postHeight + 0.05, 0);
            group.add(rightCap);
        }
    }
    addLatch(group, params, seed) {
        const material = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
        const latchY = params.height * 0.6;
        switch (params.latchType) {
            case 'ring':
                const ringGeo = new THREE.TorusGeometry(0.05, 0.008, 8, 16);
                const ring = new THREE.Mesh(ringGeo, material);
                ring.position.set(params.width - 0.1, latchY, 0.06);
                ring.rotation.y = Math.PI / 2;
                group.add(ring);
                break;
            case 'bar':
                const barGeo = new THREE.BoxGeometry(0.15, 0.02, 0.02);
                const bar = new THREE.Mesh(barGeo, material);
                bar.position.set(params.width - 0.1, latchY, 0.06);
                group.add(bar);
                break;
            case 'lock':
                const lockGeo = new THREE.BoxGeometry(0.08, 0.1, 0.05);
                const lock = new THREE.Mesh(lockGeo, material);
                lock.position.set(params.width - 0.1, latchY, 0.06);
                group.add(lock);
                break;
            case 'chain':
                const chainGeo = new THREE.TorusGeometry(0.03, 0.005, 8, 12);
                for (let i = 0; i < 5; i++) {
                    const link = new THREE.Mesh(chainGeo, material);
                    link.position.set(params.width - 0.1 - i * 0.02, latchY - i * 0.03, 0.06);
                    group.add(link);
                }
                break;
        }
    }
    addHinges(group, params, seed) {
        const material = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.3 });
        const hingePositions = [params.height * 0.2, params.height * 0.8];
        hingePositions.forEach(y => {
            const hingeGeo = new THREE.BoxGeometry(0.08, 0.12, 0.03);
            const hinge = new THREE.Mesh(hingeGeo, material);
            hinge.position.set(0.05, y, 0.06);
            group.add(hinge);
        });
    }
    addDecorativeElements(group, params, seed) {
        const material = this.getMaterial(params);
        if (params.style === 'victorian' || params.style === 'traditional') {
            // Add scrollwork
            const scrollGeo = new THREE.TorusGeometry(0.15, 0.02, 8, 16);
            const scroll = new THREE.Mesh(scrollGeo, material);
            scroll.position.set(params.width / 2, params.height * 0.5, 0.06);
            group.add(scroll);
        }
        if (params.material === 'wrought_iron') {
            // Add finials
            const finialGeo = new THREE.ConeGeometry(0.03, 0.1, 8);
            const finial = new THREE.Mesh(finialGeo, material);
            finial.position.set(params.width / 2, params.height + 0.05, 0);
            group.add(finial);
        }
    }
    getMaterial(params) {
        let color = new THREE.Color(params.color);
        if (params.material === 'metal' || params.material === 'wrought_iron') {
            return new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.9,
                roughness: 0.3,
            });
        }
        else if (params.material === 'vinyl') {
            return new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.0,
                roughness: 0.7,
            });
        }
        else {
            // Wood
            return new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.0,
                roughness: 0.8,
            });
        }
    }
    validateParams(params) {
        if (params.width < 1.0 || params.width > 10.0) {
            throw new Error('Gate width must be between 1.0 and 10.0 meters');
        }
        if (params.height < 1.0 || params.height > 4.0) {
            throw new Error('Gate height must be between 1.0 and 4.0 meters');
        }
    }
}
//# sourceMappingURL=GateGenerator.js.map