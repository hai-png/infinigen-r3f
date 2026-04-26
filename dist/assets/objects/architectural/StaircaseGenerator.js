/**
 * StaircaseGenerator - Procedural staircase generation
 *
 * Generates various staircase types: straight, L-shaped, U-shaped, spiral, curved
 * with configurable treads, risers, stringers, and landing platforms.
 *
 * @category Architectural
 * @subcategory Vertical Circulation
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, ExtrudeGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
const DEFAULT_PARAMS = {
    totalHeight: 3.0,
    totalRun: 4.0,
    width: 1.2,
    numSteps: 14,
    stairType: 'straight',
    hasLanding: false,
    hasStringers: true,
    stringerType: 'closed',
    hasRisers: true,
    treadThickness: 0.04,
    riserThickness: 0.02,
    style: 'modern',
    treadMaterial: 'wood',
    riserMaterial: 'wood',
    stringerMaterial: 'wood',
    railingAttachment: true,
};
export class StaircaseGenerator extends BaseObjectGenerator {
    constructor(seed) {
        super('Staircase', seed);
    }
    getDefaultParams() {
        return { ...DEFAULT_PARAMS };
    }
    generate(params = {}) {
        const finalParams = this.validateAndMerge(params);
        const group = new Group();
        const { totalHeight, totalRun, width, numSteps, stairType, hasLanding, landingPosition = 0.5, hasStringers, stringerType, hasRisers, treadThickness, riserThickness, style, treadMaterial, riserMaterial, stringerMaterial, railingAttachment, } = finalParams;
        const rise = totalHeight / numSteps;
        const run = totalRun / numSteps;
        // Generate based on type
        switch (stairType) {
            case 'straight':
                this.generateStraightStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType);
                break;
            case 'L':
                this.generateLStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, landingPosition);
                break;
            case 'U':
                this.generateUStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, landingPosition);
                break;
            case 'spiral':
                this.generateSpiralStairs(group, numSteps, rise, width, treadThickness, stringerType);
                break;
            case 'curved':
                this.generateCurvedStairs(group, numSteps, rise, run, width, treadThickness, riserThickness);
                break;
        }
        // Add railing attachment points
        if (railingAttachment) {
            this.addRailingAttachments(group, stairType, totalRun, width, totalHeight);
        }
        return group;
    }
    generateStraightStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType) {
        for (let i = 0; i < numSteps; i++) {
            const y = i * rise;
            const x = i * run;
            // Tread
            const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
            const tread = new Mesh(treadGeom);
            tread.position.set(x + run / 2, y + treadThickness / 2, 0);
            tread.castShadow = true;
            tread.receiveShadow = true;
            group.add(tread);
            // Riser
            if (hasRisers && i < numSteps - 1) {
                const riserGeom = new BoxGeometry(run, riserThickness, width);
                const riser = new Mesh(riserGeom);
                riser.position.set(x + run / 2, y + treadThickness + riserThickness / 2, 0);
                riser.castShadow = true;
                riser.receiveShadow = true;
                group.add(riser);
            }
        }
        // Stringers
        if (hasStringers) {
            this.addStraightStringers(group, numSteps, rise, run, width, stringerType);
        }
    }
    addStraightStringers(group, numSteps, rise, run, width, stringerType) {
        const totalRise = numSteps * rise;
        const totalRun = numSteps * run;
        const stringerLength = Math.sqrt(totalRise * totalRise + totalRun * totalRun);
        const angle = Math.atan2(totalRise, totalRun);
        if (stringerType === 'closed') {
            // Solid side panels
            const stringerGeom = new BoxGeometry(totalRun, 0.03, width + 0.1);
            const leftStringer = new Mesh(stringerGeom);
            leftStringer.position.set(totalRun / 2, totalRise / 2, -width / 2 - 0.05);
            leftStringer.rotation.z = -angle;
            group.add(leftStringer);
            const rightStringer = new Mesh(stringerGeom);
            rightStringer.position.set(totalRun / 2, totalRise / 2, width / 2 + 0.05);
            rightStringer.rotation.z = -angle;
            group.add(rightStringer);
        }
        else if (stringerType === 'open') {
            // Cut stringers following step profile
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            for (let i = 0; i < numSteps; i++) {
                shape.lineTo((i + 1) * run, i * rise);
                shape.lineTo((i + 1) * run, (i + 1) * rise);
            }
            shape.lineTo(0, totalRise);
            shape.lineTo(0, 0);
            const extrudeSettings = { depth: 0.03, bevelEnabled: false };
            const geom = new ExtrudeGeometry(shape, extrudeSettings);
            const leftStringer = new Mesh(geom);
            leftStringer.position.set(0, 0, -width / 2 - 0.05);
            group.add(leftStringer);
            const rightStringer = new Mesh(geom);
            rightStringer.position.set(0, 0, width / 2 + 0.05);
            group.add(rightStringer);
        }
        else if (stringerType === 'mono') {
            // Central mono stringer
            const stringerGeom = new BoxGeometry(totalRun, 0.15, 0.1);
            const stringer = new Mesh(stringerGeom);
            stringer.position.set(totalRun / 2, totalRise / 2, 0);
            stringer.rotation.z = -angle;
            group.add(stringer);
        }
    }
    generateLStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, landingPosition) {
        const firstFlightSteps = Math.floor(numSteps * landingPosition);
        const secondFlightSteps = numSteps - firstFlightSteps;
        const landingSize = width;
        // First flight
        for (let i = 0; i < firstFlightSteps; i++) {
            const y = i * rise;
            const x = i * run;
            const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
            const tread = new Mesh(treadGeom);
            tread.position.set(x + run / 2, y + treadThickness / 2, 0);
            tread.castShadow = true;
            group.add(tread);
            if (hasRisers && i < firstFlightSteps - 1) {
                const riserGeom = new BoxGeometry(run, riserThickness, width);
                const riser = new Mesh(riserGeom);
                riser.position.set(x + run / 2, y + treadThickness + riserThickness / 2, 0);
                group.add(riser);
            }
        }
        // Landing
        const landingY = firstFlightSteps * rise;
        const landingX = firstFlightSteps * run;
        const landingGeom = new BoxGeometry(landingSize, treadThickness, landingSize);
        const landing = new Mesh(landingGeom);
        landing.position.set(landingX + landingSize / 2, landingY + treadThickness / 2, 0);
        landing.castShadow = true;
        group.add(landing);
        // Second flight (90 degree turn)
        for (let i = 0; i < secondFlightSteps; i++) {
            const y = landingY + (i + 1) * rise;
            const x = landingX + landingSize + i * run;
            const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
            const tread = new Mesh(treadGeom);
            tread.position.set(x + run / 2, y + treadThickness / 2, landingSize / 2 - width / 2);
            tread.rotation.y = -Math.PI / 2;
            tread.castShadow = true;
            group.add(tread);
            if (hasRisers && i < secondFlightSteps - 1) {
                const riserGeom = new BoxGeometry(run, riserThickness, width);
                const riser = new Mesh(riserGeom);
                riser.position.set(x + run / 2, y + treadThickness + riserThickness / 2, landingSize / 2 - width / 2);
                riser.rotation.y = -Math.PI / 2;
                group.add(riser);
            }
        }
    }
    generateUStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, landingPosition) {
        const firstFlightSteps = Math.floor(numSteps / 2);
        const secondFlightSteps = numSteps - firstFlightSteps;
        const landingWidth = width * 2;
        // First flight
        for (let i = 0; i < firstFlightSteps; i++) {
            const y = i * rise;
            const x = i * run;
            const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
            const tread = new Mesh(treadGeom);
            tread.position.set(x + run / 2, y + treadThickness / 2, -width / 2);
            tread.castShadow = true;
            group.add(tread);
        }
        // Landing
        const landingY = firstFlightSteps * rise;
        const landingX = firstFlightSteps * run;
        const landingGeom = new BoxGeometry(landingWidth, treadThickness, width);
        const landing = new Mesh(landingGeom);
        landing.position.set(landingX + landingWidth / 2, landingY + treadThickness / 2, 0);
        landing.castShadow = true;
        group.add(landing);
        // Second flight (return direction)
        for (let i = 0; i < secondFlightSteps; i++) {
            const y = landingY + (i + 1) * rise;
            const x = landingX + landingWidth - i * run;
            const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
            const tread = new Mesh(treadGeom);
            tread.position.set(x - run / 2, y + treadThickness / 2, width / 2);
            tread.castShadow = true;
            group.add(tread);
        }
    }
    generateSpiralStairs(group, numSteps, rise, diameter, treadThickness, stringerType) {
        const radius = diameter / 2;
        const totalAngle = Math.PI * 1.5; // 270 degrees
        const angleStep = totalAngle / numSteps;
        // Central pole
        if (stringerType !== 'mono') {
            const poleGeom = new CylinderGeometry(0.05, 0.05, numSteps * rise, 16);
            const pole = new Mesh(poleGeom);
            pole.position.set(0, numSteps * rise / 2, 0);
            group.add(pole);
        }
        // Treads
        for (let i = 0; i < numSteps; i++) {
            const angle = i * angleStep;
            const y = i * rise;
            const shape = new THREE.Shape();
            shape.moveTo(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1);
            shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
            shape.lineTo(Math.cos(angle + angleStep * 0.8) * radius, Math.sin(angle + angleStep * 0.8) * radius);
            shape.lineTo(Math.cos(angle + angleStep * 0.8) * 0.1, Math.sin(angle + angleStep * 0.8) * 0.1);
            shape.closePath();
            const extrudeSettings = { depth: treadThickness, bevelEnabled: false };
            const geom = new ExtrudeGeometry(shape, extrudeSettings);
            const tread = new Mesh(geom);
            tread.position.set(0, y, 0);
            tread.rotation.x = -Math.PI / 2;
            tread.castShadow = true;
            group.add(tread);
        }
    }
    generateCurvedStairs(group, numSteps, rise, run, width, treadThickness, riserThickness) {
        const totalAngle = Math.PI / 2; // 90 degree curve
        const angleStep = totalAngle / numSteps;
        const radius = (run * numSteps) / totalAngle;
        for (let i = 0; i < numSteps; i++) {
            const angle = i * angleStep;
            const y = i * rise;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const shape = new THREE.Shape();
            const innerRadius = radius - width;
            shape.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
            shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
            shape.lineTo(Math.cos(angle + angleStep) * radius, Math.sin(angle + angleStep) * radius);
            shape.lineTo(Math.cos(angle + angleStep) * innerRadius, Math.sin(angle + angleStep) * innerRadius);
            shape.closePath();
            const extrudeSettings = { depth: treadThickness, bevelEnabled: false };
            const geom = new ExtrudeGeometry(shape, extrudeSettings);
            const tread = new Mesh(geom);
            tread.position.set(0, y, 0);
            tread.rotation.x = -Math.PI / 2;
            tread.castShadow = true;
            group.add(tread);
        }
    }
    addRailingAttachments(group, stairType, totalRun, width, totalHeight) {
        // Add marker objects for railing attachment points
        const markerGeom = new THREE.SphereGeometry(0.02);
        // Start point
        const startMarker = new Mesh(markerGeom);
        startMarker.position.set(0.05, 0.05, -width / 2);
        startMarker.userData = { type: 'railing_start' };
        group.add(startMarker);
        // End point
        let endX, endY, endZ;
        if (stairType === 'straight') {
            endX = totalRun - 0.05;
            endY = totalHeight - 0.05;
            endZ = -width / 2;
        }
        else {
            endX = totalRun;
            endY = totalHeight;
            endZ = 0;
        }
        const endMarker = new Mesh(markerGeom);
        endMarker.position.set(endX, endY, endZ);
        endMarker.userData = { type: 'railing_end' };
        group.add(endMarker);
    }
    getStylePresets() {
        return {
            modern: {
                style: 'modern',
                stringerType: 'mono',
                hasRisers: false,
                treadMaterial: 'glass',
                stringerMaterial: 'steel',
            },
            traditional: {
                style: 'traditional',
                stringerType: 'closed',
                hasRisers: true,
                treadMaterial: 'oak',
                riserMaterial: 'oak',
                stringerMaterial: 'oak',
            },
            industrial: {
                style: 'industrial',
                stringerType: 'open',
                hasRisers: false,
                treadMaterial: 'metal',
                stringerMaterial: 'steel',
            },
            rustic: {
                style: 'rustic',
                stringerType: 'closed',
                hasRisers: true,
                treadMaterial: 'reclaimed_wood',
                stringerMaterial: 'reclaimed_wood',
            },
            minimalist: {
                style: 'minimalist',
                stringerType: 'mono',
                hasRisers: false,
                treadThickness: 0.03,
                treadMaterial: 'concrete',
            },
        };
    }
}
//# sourceMappingURL=StaircaseGenerator.js.map