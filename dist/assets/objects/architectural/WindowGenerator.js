/**
 * Procedural Window Generator for Infinigen R3F
 * Generates various window types: casement, double-hung, bay, skylights
 */
import { Group, BoxGeometry, MeshStandardMaterial, Color } from 'three';
import { FixedSeed } from '../../../../core/util/math/utils';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class WindowGenerator extends BaseObjectGenerator {
    getDefaultParams() {
        return {
            width: 1.2 + this.random.range(-0.3, 0.6),
            height: 1.5 + this.random.range(-0.3, 0.8),
            depth: 0.15 + this.random.range(0, 0.1),
            type: this.random.choice(['casement', 'double-hung', 'sliding', 'bay', 'skylight', 'arched']),
            style: this.random.choice(['modern', 'traditional', 'industrial', 'rustic', 'victorian']),
            paneCount: this.random.int(2, 12),
            hasShutters: this.random.boolean(0.4),
            frameMaterial: this.random.choice(['wood', 'metal', 'vinyl', 'aluminum']),
            glassType: this.random.choice(['clear', 'frosted', 'tinted', 'stained']),
            sillDepth: 0.1 + this.random.range(0, 0.15),
        };
    }
    generate(params) {
        const finalParams = { ...this.getDefaultParams(), ...params };
        const seed = params?.seed ?? Math.floor(Math.random() * 1000000);
        const fixedSeed = new FixedSeed(seed);
        try {
            this.random.seed = seed;
            return this.createWindow(finalParams);
        }
        finally {
            fixedSeed[Symbol.dispose]?.();
        }
    }
    createWindow(params) {
        const group = new Group();
        // Create frame
        const frame = this.createFrame(params);
        group.add(frame);
        // Create glass panes
        const panes = this.createPanes(params);
        panes.forEach(pane => group.add(pane));
        // Add mullions/muntins
        const mullions = this.createMullions(params);
        mullions.forEach(m => group.add(m));
        // Add shutters if specified
        if (params.hasShutters) {
            const shutters = this.createShutters(params);
            shutters.forEach(s => group.add(s));
        }
        // Add window sill
        const sill = this.createSill(params);
        group.add(sill);
        // Generate collision mesh
        this.generateCollisionMesh(group, params);
        return group;
    }
    createFrame(params) {
        const frameGroup = new Group();
        const frameColor = this.getFrameColor(params);
        const frameMaterial = new MeshStandardMaterial({
            color: frameColor,
            roughness: params.frameMaterial === 'metal' ? 0.3 : 0.7
        });
        // Frame dimensions
        const frameThickness = 0.08;
        // Top frame
        const topFrame = new BoxGeometry(params.width, frameThickness, params.depth);
        frameGroup.add(new Group());
        // Bottom frame
        const bottomFrame = new BoxGeometry(params.width, frameThickness, params.depth);
        frameGroup.add(new Group());
        // Left frame
        const leftFrame = new BoxGeometry(frameThickness, params.height, params.depth);
        frameGroup.add(new Group());
        // Right frame
        const rightFrame = new BoxGeometry(frameThickness, params.height, params.depth);
        frameGroup.add(new Group());
        return frameGroup;
    }
    createPanes(params) {
        const panes = [];
        const glassMaterial = this.getGlassMaterial(params);
        const paneWidth = params.width / Math.sqrt(params.paneCount);
        const paneHeight = params.height / Math.sqrt(params.paneCount);
        const rows = Math.ceil(Math.sqrt(params.paneCount));
        const cols = Math.ceil(params.paneCount / rows);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols && panes.length < params.paneCount; col++) {
                const pane = new Group();
                const x = (col - (cols - 1) / 2) * paneWidth;
                const y = (row - (rows - 1) / 2) * paneHeight;
                const paneGeo = new BoxGeometry(paneWidth * 0.9, paneHeight * 0.9, 0.01);
                pane.add(new Group());
                panes.push(pane);
            }
        }
        return panes;
    }
    createMullions(params) {
        const mullions = [];
        const mullionMaterial = new MeshStandardMaterial({
            color: this.getFrameColor(params),
            roughness: 0.5
        });
        // Vertical mullions
        const vCount = Math.floor(Math.sqrt(params.paneCount)) - 1;
        for (let i = 0; i < vCount; i++) {
            const mullion = new Group();
            const x = ((i + 1) / (vCount + 1)) * params.width - params.width / 2;
            const mullionGeo = new BoxGeometry(0.03, params.height, 0.02);
            mullions.push(mullion);
        }
        // Horizontal mullions
        const hCount = Math.floor(params.paneCount / (vCount + 1)) - 1;
        for (let i = 0; i < hCount; i++) {
            const mullion = new Group();
            const y = ((i + 1) / (hCount + 1)) * params.height - params.height / 2;
            const mullionGeo = new BoxGeometry(params.width, 0.03, 0.02);
            mullions.push(mullion);
        }
        return mullions;
    }
    createShutters(params) {
        const shutters = [];
        const shutterColor = this.getShutterColor(params);
        const shutterMaterial = new MeshStandardMaterial({
            color: shutterColor,
            roughness: 0.6
        });
        // Left shutter
        const leftShutter = new Group();
        const leftSlats = 5;
        for (let i = 0; i < leftSlats; i++) {
            const slatGeo = new BoxGeometry(params.height * 0.4, 0.03, 0.05);
            leftShutter.add(new Group());
        }
        shutters.push(leftShutter);
        // Right shutter
        const rightShutter = new Group();
        for (let i = 0; i < leftSlats; i++) {
            const slatGeo = new BoxGeometry(params.height * 0.4, 0.03, 0.05);
            rightShutter.add(new Group());
        }
        shutters.push(rightShutter);
        return shutters;
    }
    createSill(params) {
        const sillGroup = new Group();
        const sillMaterial = new MeshStandardMaterial({
            color: this.getFrameColor(params),
            roughness: 0.7
        });
        const sillGeo = new BoxGeometry(params.width + 0.2, 0.05, params.sillDepth);
        sillGroup.add(new Group());
        return sillGroup;
    }
    getGlassMaterial(params) {
        let color = 0x88ccff;
        let opacity = 0.3;
        let roughness = 0.1;
        switch (params.glassType) {
            case 'frosted':
                color = 0xcccccc;
                opacity = 0.5;
                roughness = 0.4;
                break;
            case 'tinted':
                color = 0x6688aa;
                opacity = 0.4;
                break;
            case 'stained':
                color = 0xaa6688;
                opacity = 0.6;
                break;
        }
        return new MeshStandardMaterial({
            color,
            transparent: true,
            opacity,
            roughness,
            metalness: 0.1
        });
    }
    getFrameColor(params) {
        switch (params.frameMaterial) {
            case 'wood':
                return new Color(0x4a3728);
            case 'metal':
                return new Color(0x333333);
            case 'vinyl':
                return new Color(0xffffff);
            case 'aluminum':
                return new Color(0xaaaaaa);
            default:
                return new Color(0x4a3728);
        }
    }
    getShutterColor(params) {
        const colors = [0x2d5016, 0x1a1a1a, 0x4a3728, 0x8b0000, 0x003366];
        return new Color(this.random.choice(colors));
    }
    validateParams(params) {
        return (params.width > 0.5 && params.width < 4.0 &&
            params.height > 0.5 && params.height < 3.5 &&
            params.paneCount >= 1 && params.paneCount <= 24);
    }
}
//# sourceMappingURL=WindowGenerator.js.map