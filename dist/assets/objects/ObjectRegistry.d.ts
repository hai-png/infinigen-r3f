/**
 * Object Registry - Central registration system for all object generators
 */
export interface RegisteredObject {
    name: string;
    category: string;
    generator: any;
    tags?: string[];
}
export declare class ObjectRegistry {
    private static instance;
    private objects;
    private constructor();
    static getInstance(): ObjectRegistry;
    register(name: string, category: string, generator: any, tags?: string[]): void;
    get(name: string): RegisteredObject | undefined;
    getByCategory(category: string): RegisteredObject[];
    getAll(): RegisteredObject[];
    has(name: string): boolean;
}
export declare const registry: ObjectRegistry;
//# sourceMappingURL=ObjectRegistry.d.ts.map