export type BehaviorState = 'idle' | 'wandering' | 'fleeing' | 'hunting' | 'mating';
export declare class BehaviorNode {
    name: string;
    children: BehaviorNode[];
    constructor(name: string, children?: BehaviorNode[]);
    execute(state: any): BehaviorState;
}
export declare class BehaviorTree {
    private root;
    constructor();
    update(deltaTime: number): BehaviorState;
}
//# sourceMappingURL=BehaviorTree.d.ts.map