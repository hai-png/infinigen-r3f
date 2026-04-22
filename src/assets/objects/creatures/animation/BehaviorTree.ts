export type BehaviorState = 'idle' | 'wandering' | 'fleeing' | 'hunting' | 'mating';
export class BehaviorNode {
  constructor(public name: string, public children: BehaviorNode[] = []) {}
  execute(state: any): BehaviorState { return 'idle'; }
}
export class BehaviorTree {
  private root: BehaviorNode;
  constructor() {
    this.root = new BehaviorNode('root', [
      new BehaviorNode('wander'),
      new BehaviorNode('flee'),
      new BehaviorNode('hunt')
    ]);
  }
  update(deltaTime: number): BehaviorState {
    return this.root.execute({});
  }
}
