/**
 * GlasswareGenerator - Procedural glassware generation (glasses, bottles)
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
import { Group, Mesh, CylinderGeometry, TorusGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../core/util/math/index';
import * as THREE from 'three';
export class GlasswareGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            type: 'wine',
            style: 'elegant',
            size: 'medium',
            seed: undefined
        };
    }
    getDefaultConfig() {
        return { ...this.defaultParams };
    }
    generate(params = {}) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const finalParams = { ...this.defaultParams, ...params };
            const seed = finalParams.seed ?? Math.floor(Math.random() * 1000000);
            const ctx = __addDisposableResource(env_1, new SeededRandom(seed), false);
            const group = new Group();
            const mat = this.getMaterial(finalParams.material || 'clear_glass');
            let mesh;
            if (finalParams.type.startsWith('bottle_')) {
                mesh = this.createBottle(finalParams);
            }
            else {
                mesh = this.createGlass(finalParams);
            }
            if (mesh) {
                group.add(mesh);
                const collision = this.createCollisionMesh(group);
                if (collision) {
                    collision.name = 'collision';
                    collision.userData.isCollision = true;
                    group.add(collision);
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
    createGlass(params) {
        const group = new Group();
        const mat = this.getMaterial(params.material || 'clear_glass');
        // Dimensions based on type and size
        const height = params.size === 'small' ? 0.08 : params.size === 'large' ? 0.15 : 0.12;
        const bowlHeight = height * 0.6;
        const stemHeight = height * 0.25;
        const baseHeight = height * 0.15;
        // Bowl
        const bowlTopRadius = params.type === 'champagne' ? 0.03 : params.type === 'cocktail' ? 0.06 : 0.04;
        const bowlBottomRadius = params.type === 'wine' ? 0.035 : 0.025;
        const bowlGeom = new CylinderGeometry(bowlBottomRadius, bowlTopRadius, bowlHeight, 16);
        const bowl = new Mesh(bowlGeom, mat);
        bowl.position.y = stemHeight + baseHeight + bowlHeight / 2;
        group.add(bowl);
        // Stem
        if (params.type !== 'beer' && params.type !== 'water') {
            const stemRadius = 0.005;
            const stemGeom = new CylinderGeometry(stemRadius, stemRadius, stemHeight, 8);
            const stem = new Mesh(stemGeom, mat);
            stem.position.y = baseHeight + stemHeight / 2;
            group.add(stem);
        }
        // Base
        const baseRadius = params.type === 'cocktail' ? 0.04 : 0.035;
        const baseGeom = new CylinderGeometry(baseRadius, baseRadius * 0.9, baseHeight, 16);
        const base = new Mesh(baseGeom, mat);
        base.position.y = baseHeight / 2;
        group.add(base);
        return this.mergeGroupToMesh(group, mat);
    }
    createBottle(params) {
        const group = new Group();
        const mat = this.getMaterial(params.material || 'green_glass');
        const isWine = params.type === 'bottle_wine';
        const isBeer = params.type === 'bottle_beer';
        // Body
        const bodyHeight = isWine ? 0.25 : isBeer ? 0.2 : 0.22;
        const bodyRadius = isWine ? 0.04 : isBeer ? 0.035 : 0.038;
        const bodyGeom = new CylinderGeometry(bodyRadius * 0.95, bodyRadius, bodyHeight, 16);
        const body = new Mesh(bodyGeom, mat);
        body.position.y = bodyHeight / 2;
        group.add(body);
        // Shoulder
        const shoulderHeight = 0.04;
        const shoulderGeom = new CylinderGeometry(bodyRadius * 0.4, bodyRadius * 0.95, shoulderHeight, 16);
        const shoulder = new Mesh(shoulderGeom, mat);
        shoulder.position.y = bodyHeight + shoulderHeight / 2;
        group.add(shoulder);
        // Neck
        const neckHeight = isWine ? 0.06 : 0.05;
        const neckRadius = bodyRadius * 0.35;
        const neckGeom = new CylinderGeometry(neckRadius, neckRadius * 1.1, neckHeight, 12);
        const neck = new Mesh(neckGeom, mat);
        neck.position.y = bodyHeight + shoulderHeight + neckHeight / 2;
        group.add(neck);
        // Lip
        const lipGeom = new TorusGeometry(neckRadius * 1.1, 0.003, 8, 16);
        const lip = new Mesh(lipGeom, mat);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = bodyHeight + shoulderHeight + neckHeight;
        group.add(lip);
        return this.mergeGroupToMesh(group, mat);
    }
    mergeGroupToMesh(group, mat) {
        const bbox = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
        return new Mesh(geom, mat);
    }
    getVariations() {
        const types = ['wine', 'beer', 'water', 'champagne', 'whiskey', 'cocktail', 'bottle_wine', 'bottle_beer'];
        const styles = ['elegant', 'casual', 'modern', 'vintage'];
        const sizes = ['small', 'medium', 'large'];
        return types.map((type, i) => ({
            type,
            style: styles[i % 4],
            size: sizes[i % 3],
            seed: i * 1000
        }));
    }
}
//# sourceMappingURL=GlasswareGenerator.js.map