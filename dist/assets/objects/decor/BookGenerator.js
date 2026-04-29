/**
 * Book Generator
 *
 * Procedural book generation with configurable sizes,
 * covers, spines, and page details.
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class BookGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            size: 'medium',
            coverType: 'hardcover',
            coverColor: '#8B4513',
            hasDustJacket: false,
            spineStyle: 'flat',
            pageCount: 300,
            thickness: 0.03,
            condition: 'good',
            seed: undefined
        };
        this.sizeDimensions = {
            small: { width: 0.11, height: 0.175, thickness: 0.02 },
            medium: { width: 0.135, height: 0.205, thickness: 0.025 },
            large: { width: 0.155, height: 0.235, thickness: 0.03 },
            folio: { width: 0.19, height: 0.305, thickness: 0.04 }
        };
    }
    getDefaultConfig() {
        return this.defaultParams;
    }
    generate(params = {}) {
        const config = { ...this.defaultParams, ...params };
        const group = new THREE.Group();
        const dimensions = this.sizeDimensions[config.size];
        const thickness = params.thickness || dimensions.thickness;
        // Book block (pages)
        const pagesGeometry = new THREE.BoxGeometry(dimensions.width - 0.004, dimensions.height - 0.006, thickness - 0.004);
        const pagesMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFF8DC,
            roughness: 0.8
        });
        const pages = new THREE.Mesh(pagesGeometry, pagesMaterial);
        group.add(pages);
        // Front cover
        const frontCoverGeometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, 0.002);
        const coverMaterial = this.getCoverMaterial(config);
        const frontCover = new THREE.Mesh(frontCoverGeometry, coverMaterial);
        frontCover.position.z = thickness / 2 + 0.001;
        group.add(frontCover);
        // Back cover
        const backCover = frontCover.clone();
        backCover.position.z = -thickness / 2 - 0.001;
        group.add(backCover);
        // Spine
        const spineGeometry = new THREE.BoxGeometry(0.002, dimensions.height, thickness);
        const spine = new THREE.Mesh(spineGeometry, coverMaterial);
        spine.position.x = -dimensions.width / 2 - 0.001;
        group.add(spine);
        // Dust jacket (optional)
        if (config.hasDustJacket) {
            const jacketGeometry = new THREE.BoxGeometry(dimensions.width + 0.003, dimensions.height + 0.003, thickness + 0.002);
            const jacketMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(config.coverColor).offsetHSL(0.05, 0.1, 0.1),
                roughness: 0.6,
                transparent: true,
                opacity: 0.9
            });
            const jacket = new THREE.Mesh(jacketGeometry, jacketMaterial);
            group.add(jacket);
        }
        // Condition-based wear
        if (config.condition === 'worn' || config.condition === 'ancient') {
            this.addWearEffects(group, config.condition);
        }
        return group;
    }
    getCoverMaterial(config) {
        let roughness = 0.5;
        let metalness = 0.0;
        if (config.coverType === 'leather') {
            roughness = 0.7;
        }
        else if (config.coverType === 'paperback') {
            roughness = 0.9;
        }
        return new THREE.MeshStandardMaterial({
            color: config.coverColor,
            roughness,
            metalness
        });
    }
    addWearEffects(group, condition) {
        // Simplified wear representation
        const wearColor = condition === 'ancient' ? 0x8B7355 : 0xA0826D;
        group.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                child.material.color.offsetHSL(0, -0.05, -0.1);
            }
        });
    }
    getVariations(count, _baseConfig) {
        const configs = [
            { ...this.defaultParams, size: 'small', coverType: 'paperback', coverColor: '#4169E1' },
            { ...this.defaultParams, size: 'medium', coverType: 'hardcover', coverColor: '#8B0000' },
            { ...this.defaultParams, size: 'large', coverType: 'leather', coverColor: '#2F4F4F' },
            { ...this.defaultParams, size: 'folio', coverType: 'leather', coverColor: '#8B4513', hasDustJacket: true }
        ];
        return configs.slice(0, count).map(config => this.generate(config));
    }
}
//# sourceMappingURL=BookGenerator.js.map