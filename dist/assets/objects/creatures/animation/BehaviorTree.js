export class BehaviorNode {
    constructor(name, children = []) {
        this.name = name;
        this.children = children;
    }
    execute(state) { return 'idle'; }
}
export class BehaviorTree {
    constructor() {
        this.root = new BehaviorNode('root', [
            new BehaviorNode('wander'),
            new BehaviorNode('flee'),
            new BehaviorNode('hunt')
        ]);
    }
    update(deltaTime) {
        return this.root.execute({});
    }
}
//# sourceMappingURL=BehaviorTree.js.map