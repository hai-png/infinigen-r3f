/**
 * Object Registry - Central registration system for all object generators
 */
export class ObjectRegistry {
    constructor() {
        this.objects = new Map();
    }
    static getInstance() {
        if (!ObjectRegistry.instance) {
            ObjectRegistry.instance = new ObjectRegistry();
        }
        return ObjectRegistry.instance;
    }
    register(name, category, generator, tags) {
        this.objects.set(name, { name, category, generator, tags });
    }
    get(name) {
        return this.objects.get(name);
    }
    getByCategory(category) {
        return Array.from(this.objects.values()).filter(obj => obj.category === category);
    }
    getAll() {
        return Array.from(this.objects.values());
    }
    has(name) {
        return this.objects.has(name);
    }
}
export const registry = ObjectRegistry.getInstance();
//# sourceMappingURL=ObjectRegistry.js.map