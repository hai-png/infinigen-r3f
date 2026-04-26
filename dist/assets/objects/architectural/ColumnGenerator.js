/**
 * ColumnGenerator - Procedural column generation
 */
import { Group, Mesh, CylinderGeometry, BoxGeometry, TorusGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
const DEFAULT_PARAMS = {
    height: 3.0,
    bottomRadius: 0.3,
    topRadius: 0.25,
    columnOrder: 'doric',
    hasBase: true,
    hasCapital: true,
    shaftFluting: true,
    numFlutes: 20,
    material: 'marble',
    style: 'classical',
};
export class ColumnGenerator extends BaseObjectGenerator {
    constructor(seed) {
        super('Column', seed);
    }
    getDefaultParams() {
        return { ...DEFAULT_PARAMS };
    }
    generate(params = {}) {
        const finalParams = this.validateAndMerge(params);
        const group = new Group();
        const { height, bottomRadius, topRadius, columnOrder, hasBase, hasCapital, shaftFluting, numFlutes, material } = finalParams;
        const shaftHeight = height - (hasBase ? 0.3 : 0) - (hasCapital ? 0.4 : 0);
        // Base
        if (hasBase) {
            const baseGeom = new CylinderGeometry(bottomRadius * 1.2, bottomRadius, 0.15, 16);
            const base = new Mesh(baseGeom);
            base.position.set(0, 0.075, 0);
            base.castShadow = true;
            group.add(base);
            const plinthGeom = new CylinderGeometry(bottomRadius * 1.3, bottomRadius * 1.2, 0.15, 16);
            const plinth = new Mesh(plinthGeom);
            plinth.position.set(0, 0.225, 0);
            plinth.castShadow = true;
            group.add(plinth);
        }
        // Shaft
        const shaftY = (hasBase ? 0.3 : 0) + shaftHeight / 2;
        const shaftGeom = new CylinderGeometry(topRadius, bottomRadius, shaftHeight, shaftFluting ? numFlutes : 16);
        const shaft = new Mesh(shaftGeom);
        shaft.position.set(0, shaftY, 0);
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        group.add(shaft);
        // Capital
        if (hasCapital) {
            const capitalY = (hasBase ? 0.3 : 0) + shaftHeight;
            if (columnOrder === 'doric') {
                const echinusGeom = new CylinderGeometry(topRadius * 1.3, topRadius, 0.15, 16);
                const echinus = new Mesh(echinusGeom);
                echinus.position.set(0, capitalY + 0.075, 0);
                group.add(echinus);
                const abacusGeom = new BoxGeometry(topRadius * 2.6, 0.1, topRadius * 2.6);
                const abacus = new Mesh(abacusGeom);
                abacus.position.set(0, capitalY + 0.2, 0);
                group.add(abacus);
            }
            else if (columnOrder === 'ionic') {
                const voluteGeom = new TorusGeometry(topRadius * 0.8, 0.05, 8, 24, Math.PI);
                const leftVolute = new Mesh(voluteGeom);
                leftVolute.position.set(-topRadius * 0.8, capitalY + 0.25, 0);
                leftVolute.rotation.y = Math.PI / 2;
                group.add(leftVolute);
                const rightVolute = new Mesh(voluteGeom);
                rightVolute.position.set(topRadius * 0.8, capitalY + 0.25, 0);
                rightVolute.rotation.y = -Math.PI / 2;
                group.add(rightVolute);
                const abacusGeom = new BoxGeometry(topRadius * 2.4, 0.1, topRadius * 1.5);
                const abacus = new Mesh(abacusGeom);
                abacus.position.set(0, capitalY + 0.35, 0);
                group.add(abacus);
            }
            else if (columnOrder === 'corinthian') {
                const basketGeom = new CylinderGeometry(topRadius * 1.2, topRadius, 0.3, 16);
                const basket = new Mesh(basketGeom);
                basket.position.set(0, capitalY + 0.15, 0);
                group.add(basket);
                const abacusGeom = new BoxGeometry(topRadius * 2.4, 0.1, topRadius * 2.4);
                const abacus = new Mesh(abacusGeom);
                abacus.position.set(0, capitalY + 0.35, 0);
                group.add(abacus);
            }
            else {
                const capitalGeom = new CylinderGeometry(topRadius * 1.2, topRadius, 0.3, 16);
                const capital = new Mesh(capitalGeom);
                capital.position.set(0, capitalY + 0.15, 0);
                group.add(capital);
            }
        }
        return group;
    }
    getStylePresets() {
        return {
            doric: { columnOrder: 'doric', shaftFluting: true, numFlutes: 20 },
            ionic: { columnOrder: 'ionic', shaftFluting: true, numFlutes: 24 },
            corinthian: { columnOrder: 'corinthian', shaftFluting: true, numFlutes: 24 },
            tuscan: { columnOrder: 'tuscan', shaftFluting: false, hasBase: true },
            modern: { columnOrder: 'modern', shaftFluting: false, hasBase: false, hasCapital: false, material: 'concrete' },
        };
    }
}
//# sourceMappingURL=ColumnGenerator.js.map