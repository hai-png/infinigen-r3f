/**
 * CutleryGenerator - Procedural cutlery generation (forks, knives, spoons)
 *
 * Features:
 * - Forks: dinner, salad, dessert, serving with tine variations
 * - Knives: dinner, steak, butter, chef with blade profiles
 * - Spoons: tablespoon, teaspoon, soup, serving with bowl depths
 * - Handle patterns: smooth, fluted, ornate, modern
 * - Material slots for silver, stainless steel, gold plating
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
import { FixedSeed } from '../../../core/util/math/utils';
export class CutleryGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            type: 'fork',
            style: 'dinner',
            handlePattern: 'smooth',
            scale: 1.0,
            seed: undefined
        };
    }
    generate(params = {}) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const finalParams = this.validateParams({ ...this.defaultParams, ...params });
            const seed = finalParams.seed ?? Math.floor(Math.random() * 1000000);
            const ctx = __addDisposableResource(env_1, new FixedSeed(seed), false);
            const group = new Group();
            let mesh;
            switch (finalParams.type) {
                case 'fork':
                    mesh = this.createFork(finalParams);
                    break;
                case 'knife':
                    mesh = this.createKnife(finalParams);
                    break;
                case 'spoon':
                    mesh = this.createSpoon(finalParams);
                    break;
            }
            if (mesh) {
                mesh.scale.setScalar(finalParams.scale ?? 1.0);
                group.add(mesh);
                // Add collision mesh
                const collisionMesh = this.createCollisionMesh(group);
                if (collisionMesh) {
                    collisionMesh.name = 'collision';
                    collisionMesh.userData.isCollision = true;
                    group.add(collisionMesh);
                }
            }
            return group;
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    createFork(params) {
        const group = new Group();
        // Handle
        const handleLength = params.style === 'serving' ? 0.18 : 0.12;
        const handleGeom = new BoxGeometry(0.015, handleLength, 0.025);
        const handleMat = this.getMaterial(params.material || 'silver');
        const handle = new Mesh(handleGeom, handleMat);
        handle.position.y = -handleLength / 2 + 0.02;
        group.add(handle);
        // Neck
        const neckGeom = new CylinderGeometry(0.008, 0.012, 0.03, 8);
        const neck = new Mesh(neckGeom, handleMat);
        neck.position.y = 0.025;
        group.add(neck);
        // Tines
        const tineCount = params.style === 'serving' ? 4 : params.style === 'dessert' ? 3 : 4;
        const tineLength = params.style === 'serving' ? 0.035 : params.style === 'dessert' ? 0.02 : 0.028;
        const tineSpacing = 0.006;
        for (let i = 0; i < tineCount; i++) {
            const x = (i - (tineCount - 1) / 2) * tineSpacing;
            const tineGeom = new CylinderGeometry(0.002, 0.003, tineLength, 6);
            const tine = new Mesh(tineGeom, handleMat);
            tine.position.set(x, 0.04 + tineLength / 2, 0);
            // Taper the tines
            tine.scale.y = 1;
            tine.rotation.z = i === 0 ? 0.05 : i === tineCount - 1 ? -0.05 : 0;
            group.add(tine);
        }
        // Handle pattern details
        if (params.handlePattern === 'fluted') {
            for (let i = 0; i < 5; i++) {
                const grooveGeom = new BoxGeometry(0.017, 0.002, 0.027);
                const groove = new Mesh(grooveGeom, handleMat);
                groove.position.y = -handleLength / 2 + 0.03 + i * 0.02;
                group.add(groove);
            }
        }
        else if (params.handlePattern === 'ornate') {
            const ornamentGeom = new TorusGeometry(0.008, 0.002, 8, 16);
            const ornament = new Mesh(ornamentGeom, handleMat);
            ornament.rotation.x = Math.PI / 2;
            ornament.position.y = -handleLength / 2 + 0.02;
            group.add(ornament);
        }
        // Merge into single mesh
        return this.mergeGroupToMesh(group, params.material || 'silver');
    }
    createKnife(params) {
        const group = new Group();
        // Handle
        const handleLength = params.style === 'chef' ? 0.15 : params.style === 'serving' ? 0.18 : 0.12;
        const handleGeom = new BoxGeometry(0.018, handleLength, 0.028);
        const handleMat = this.getMaterial(params.material || 'silver');
        const handle = new Mesh(handleGeom, handleMat);
        handle.position.y = -handleLength / 2 + 0.02;
        group.add(handle);
        // Blade
        const bladeLength = params.style === 'chef' ? 0.2 : params.style === 'steak' ? 0.12 : 0.1;
        const bladeWidth = params.style === 'chef' ? 0.04 : 0.025;
        const bladeGeom = new BoxGeometry(0.002, bladeLength, bladeWidth);
        const bladeMat = this.getMaterial(params.material || 'steel');
        const blade = new Mesh(bladeGeom, bladeMat);
        blade.position.y = bladeLength / 2 + 0.02;
        // Taper blade to edge
        blade.scale.z = 1;
        group.add(blade);
        // Blade tip
        if (params.style === 'steak' || params.style === 'chef') {
            const tipGeom = new ConeGeometry(0.012, 0.02, 4);
            const tip = new Mesh(tipGeom, bladeMat);
            tip.position.y = bladeLength + 0.02;
            tip.rotation.x = Math.PI;
            group.add(tip);
        }
        // Handle pattern
        if (params.handlePattern === 'modern') {
            const insetGeom = new BoxGeometry(0.016, handleLength * 0.6, 0.026);
            const insetMat = this.getMaterial('black_plastic');
            const inset = new Mesh(insetGeom, insetMat);
            inset.position.y = -handleLength / 2 + 0.02;
            group.add(inset);
        }
        return this.mergeGroupToMesh(group, params.material || 'silver');
    }
    createSpoon(params) {
        const group = new Group();
        // Handle
        const handleLength = params.style === 'serving' ? 0.2 : params.style === 'teaspoon' ? 0.1 : 0.12;
        const handleGeom = new BoxGeometry(0.014, handleLength, 0.022);
        const handleMat = this.getMaterial(params.material || 'silver');
        const handle = new Mesh(handleGeom, handleMat);
        handle.position.y = -handleLength / 2 + 0.02;
        group.add(handle);
        // Bowl
        const bowlSize = params.style === 'serving' ? 0.045 : params.style === 'teaspoon' ? 0.025 : 0.032;
        const bowlDepth = params.style === 'soup' ? 0.02 : 0.012;
        // Create bowl using scaled sphere
        const bowlGeom = new SphereGeometry(bowlSize, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const bowl = new Mesh(bowlGeom, handleMat);
        bowl.position.y = 0.02;
        bowl.scale.z = bowlDepth / bowlSize;
        group.add(bowl);
        // Neck connection
        const neckGeom = new CylinderGeometry(0.006, 0.01, 0.025, 8);
        const neck = new Mesh(neckGeom, handleMat);
        neck.position.y = 0.025;
        neck.rotation.x = Math.PI / 2;
        group.add(neck);
        return this.mergeGroupToMesh(group, params.material || 'silver');
    }
    mergeGroupToMesh(group, materialName) {
        // For simplicity, return the group's first mesh or create a representative mesh
        const mat = this.getMaterial(materialName);
        const bbox = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const geom = new BoxGeometry(size.x, size.y, size.z);
        return new Mesh(geom, mat);
    }
    getVariations() {
        const types = ['fork', 'knife', 'spoon'];
        const styles = ['dinner', 'salad', 'dessert', 'serving', 'steak', 'butter', 'chef', 'tablespoon', 'teaspoon', 'soup'];
        const patterns = ['smooth', 'fluted', 'ornate', 'modern'];
        const variations = [];
        for (let i = 0; i < 8; i++) {
            variations.push({
                type: types[i % 3],
                style: styles[i % styles.length],
                handlePattern: patterns[i % 4],
                scale: 0.9 + (i % 3) * 0.1,
                seed: i * 1000
            });
        }
        return variations;
    }
}
// Import THREE for types
import * as THREE from 'three';
//# sourceMappingURL=CutleryGenerator.js.map