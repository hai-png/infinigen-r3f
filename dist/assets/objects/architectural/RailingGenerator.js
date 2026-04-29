/**
 * RailingGenerator - Procedural railing generation
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
const DEFAULT_PARAMS = {
    length: 3.0,
    height: 1.0,
    width: 0.1,
    railingType: 'vertical',
    postSpacing: 1.0,
    postWidth: 0.1,
    railCount: 3,
    balusterType: 'round',
    style: 'modern',
    material: 'metal',
    hasHandrail: true,
    handrailShape: 'round',
};
export class RailingGenerator extends BaseObjectGenerator {
    constructor(seed) {
        super(seed);
    }
    getDefaultConfig() {
        return { ...DEFAULT_PARAMS };
    }
    generate(params = {}) {
        const finalParams = this.validateAndMerge(params);
        const group = new Group();
        const { length, height, width, railingType, postSpacing, postWidth, railCount, balusterType, hasHandrail, handrailShape } = finalParams;
        // Posts
        const numPosts = Math.floor(length / postSpacing) + 1;
        for (let i = 0; i < numPosts; i++) {
            const x = i * postSpacing;
            const postGeom = new BoxGeometry(postWidth, height, postWidth);
            const post = new Mesh(postGeom);
            post.position.set(x, height / 2, 0);
            post.castShadow = true;
            group.add(post);
        }
        // Handrail
        if (hasHandrail) {
            const railY = height - 0.05;
            if (handrailShape === 'round') {
                const railGeom = new CylinderGeometry(0.03, 0.03, length, 16);
                const rail = new Mesh(railGeom);
                rail.rotation.z = Math.PI / 2;
                rail.position.set(length / 2, railY, 0);
                group.add(rail);
            }
            else {
                const railGeom = new BoxGeometry(length, 0.05, 0.08);
                const rail = new Mesh(railGeom);
                rail.position.set(length / 2, railY, 0);
                group.add(rail);
            }
        }
        // Balusters or infill based on type
        if (railingType === 'vertical') {
            const numBalusters = Math.floor(length / 0.15);
            for (let i = 0; i < numBalusters; i++) {
                const x = (i + 0.5) * (length / numBalusters);
                const balusterHeight = height - 0.1;
                if (balusterType === 'round') {
                    const geom = new CylinderGeometry(0.015, 0.015, balusterHeight, 8);
                    const baluster = new Mesh(geom);
                    baluster.position.set(x, balusterHeight / 2 + 0.05, 0);
                    group.add(baluster);
                }
                else if (balusterType === 'square') {
                    const geom = new BoxGeometry(0.03, balusterHeight, 0.03);
                    const baluster = new Mesh(geom);
                    baluster.position.set(x, balusterHeight / 2 + 0.05, 0);
                    group.add(baluster);
                }
            }
        }
        else if (railingType === 'horizontal') {
            for (let i = 0; i < railCount; i++) {
                const y = 0.1 + (i / (railCount - 1)) * (height - 0.2);
                const railGeom = new CylinderGeometry(0.01, 0.01, length, 16);
                const rail = new Mesh(railGeom);
                rail.rotation.z = Math.PI / 2;
                rail.position.set(length / 2, y, 0);
                group.add(rail);
            }
        }
        return group;
    }
    getStylePresets() {
        return {
            modern: { railingType: 'glass', material: 'steel', hasHandrail: true },
            traditional: { railingType: 'vertical', balusterType: 'twisted', material: 'wood' },
            industrial: { railingType: 'horizontal', material: 'steel', railCount: 4 },
            classic: { railingType: 'ornate', material: 'wrought_iron' },
        };
    }
}
//# sourceMappingURL=RailingGenerator.js.map