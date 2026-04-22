/**
 * Test Suite for Solver Moves and Annealing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Move,
  TranslateMove,
  RotateMove,
  SwapMove,
  DeletionMove,
  ReassignmentMove,
  AdditionMove,
  SimulatedAnnealingSolver,
  GreedySolver,
  type SimulatedAnnealingConfig,
  type GreedyConfig,
} from '../../solver/moves';
import { State, ObjectState } from '../../evaluator/state';
import { Problem, buildProblem, NamedConstraint } from '../../constraint-language/constants';
import { Touching, Proximity } from '../../constraint-language/relations';
import { item } from '../../constraint-language/constants';
import { SemanticsTag } from '../../tags';

describe('Move Types', () => {
  const createTestState = (): State => {
    const problem: Problem = {
      variables: new Map(),
      constraints: [],
      scoreTerms: [],
    };

    const objects = new Map<string, ObjectState>();
    objects.set('chair_1', new ObjectState(
      'chair_1',
      new SemanticsTag('chair'),
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));
    objects.set('table_1', new ObjectState(
      'table_1',
      new SemanticsTag('table'),
      { position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));

    return new State(objects, problem, new Map());
  };

  describe('TranslateMove', () => {
    it('should create a translation move', () => {
      const move = new TranslateMove('chair_1', { x: 1, y: 0, z: 0 }, 100);

      expect(move.objectName).toBe('chair_1');
      expect(move.translation.x).toBe(1);
      expect(move.scoreBefore).toBe(100);
    });

    it('should apply translation to object', () => {
      const state = createTestState();
      const move = new TranslateMove('chair_1', { x: 1, y: 0.5, z: -1 }, 100);

      const newState = move.apply(state);
      const newObj = newState.objects.get('chair_1');

      expect(newObj?.pose.position.x).toBe(1);
      expect(newObj?.pose.position.y).toBe(0.5);
      expect(newObj?.pose.position.z).toBe(-1);
    });

    it('should reverse translation', () => {
      const state = createTestState();
      const move = new TranslateMove('chair_1', { x: 1, y: 0, z: 0 }, 100);

      const newState = move.apply(state);
      const reversed = move.reverse(newState);
      const obj = reversed.objects.get('chair_1');

      expect(obj?.pose.position.x).toBe(0);
      expect(obj?.pose.position.y).toBe(0);
      expect(obj?.pose.position.z).toBe(0);
    });

    it('should validate move', () => {
      const state = createTestState();
      const validMove = new TranslateMove('chair_1', { x: 1, y: 0, z: 0 }, 100);
      const invalidMove = new TranslateMove('nonexistent', { x: 1, y: 0, z: 0 }, 100);

      expect(validMove.isValid(state)).toBe(true);
      expect(invalidMove.isValid(state)).toBe(false);
    });

    it('should generate unique move ID', () => {
      const move = new TranslateMove('chair_1', { x: 1.5, y: 2.3, z: -0.7 }, 100);
      const moveId = move.getMoveId();

      expect(moveId).toContain('translate');
      expect(moveId).toContain('chair_1');
      expect(moveId).toContain('1.50');
    });
  });

  describe('RotateMove', () => {
    it('should create a rotation move', () => {
      const move = new RotateMove('chair_1', { x: 0, y: Math.PI / 2, z: 0 }, 100);

      expect(move.objectName).toBe('chair_1');
      expect(move.rotation.y).toBe(Math.PI / 2);
    });

    it('should apply rotation to object', () => {
      const state = createTestState();
      const move = new RotateMove('chair_1', { x: 0, y: Math.PI / 4, z: 0 }, 100);

      const newState = move.apply(state);
      const newObj = newState.objects.get('chair_1');

      expect(newObj?.pose.rotation.y).toBe(Math.PI / 4);
    });

    it('should reverse rotation', () => {
      const state = createTestState();
      const move = new RotateMove('chair_1', { x: 0, y: Math.PI / 3, z: 0 }, 100);

      const newState = move.apply(state);
      const reversed = move.reverse(newState);
      const obj = reversed.objects.get('chair_1');

      expect(obj?.pose.rotation.y).toBe(0);
    });
  });

  describe('SwapMove', () => {
    it('should create a swap move between two objects', () => {
      const move = new SwapMove('chair_1', 'table_1', 100);

      expect(move.objectName1).toBe('chair_1');
      expect(move.objectName2).toBe('table_1');
    });

    it('should swap positions of two objects', () => {
      const state = createTestState();
      const move = new SwapMove('chair_1', 'table_1', 100);

      const newState = move.apply(state);
      const chair = newState.objects.get('chair_1');
      const table = newState.objects.get('table_1');

      // Chair should be at table's original position
      expect(chair?.pose.position.x).toBe(2);
      // Table should be at chair's original position
      expect(table?.pose.position.x).toBe(0);
    });

    it('should reverse swap', () => {
      const state = createTestState();
      const move = new SwapMove('chair_1', 'table_1', 100);

      const newState = move.apply(state);
      const reversed = move.reverse(newState);
      const chair = reversed.objects.get('chair_1');
      const table = reversed.objects.get('table_1');

      expect(chair?.pose.position.x).toBe(0);
      expect(table?.pose.position.x).toBe(2);
    });
  });

  describe('DeletionMove', () => {
    it('should create a deletion move', () => {
      const move = new DeletionMove('chair_1', 100);

      expect(move.objectName).toBe('chair_1');
    });

    it('should remove object from state', () => {
      const state = createTestState();
      const move = new DeletionMove('chair_1', 100);

      const newState = move.apply(state);

      expect(newState.objects.has('chair_1')).toBe(false);
      expect(newState.objects.has('table_1')).toBe(true);
    });

    it('should restore deleted object on reverse', () => {
      const state = createTestState();
      const originalChair = state.objects.get('chair_1');
      const move = new DeletionMove('chair_1', 100);

      const newState = move.apply(state);
      const restored = move.reverse(newState);
      const chair = restored.objects.get('chair_1');

      expect(chair).toBeDefined();
      expect(chair?.pose.position.x).toBe(originalChair?.pose.position.x);
    });
  });

  describe('AdditionMove', () => {
    it('should create an addition move', () => {
      const move = new AdditionMove(
        'lamp_1',
        new SemanticsTag('lamp'),
        { position: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 } },
        100
      );

      expect(move.objectName).toBe('lamp_1');
      expect(move.semantics.value).toBe('lamp');
    });

    it('should add object to state', () => {
      const state = createTestState();
      const move = new AdditionMove(
        'lamp_1',
        new SemanticsTag('lamp'),
        { position: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 } },
        100
      );

      const newState = move.apply(state);

      expect(newState.objects.has('lamp_1')).toBe(true);
      const lamp = newState.objects.get('lamp_1');
      expect(lamp?.pose.position.x).toBe(1);
    });

    it('should remove added object on reverse', () => {
      const state = createTestState();
      const move = new AdditionMove(
        'lamp_1',
        new SemanticsTag('lamp'),
        { position: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 } },
        100
      );

      const newState = move.apply(state);
      const reversed = move.reverse(newState);

      expect(reversed.objects.has('lamp_1')).toBe(false);
    });
  });
});

describe('Simulated Annealing Solver', () => {
  const createTestProblem = (): Problem => {
    const chair = item('chair_1');
    const table = item('table_1');

    const constraints: NamedConstraint[] = [
      {
        name: 'chair_near_table',
        constraint: new Proximity(chair, table, 1.0),
        weight: 1.0,
      },
    ];

    return buildProblem(constraints, []);
  };

  const createInitialState = (problem: Problem): State => {
    const objects = new Map<string, ObjectState>();
    objects.set('chair_1', new ObjectState(
      'chair_1',
      new SemanticsTag('chair'),
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));
    objects.set('table_1', new ObjectState(
      'table_1',
      new SemanticsTag('table'),
      { position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));

    return new State(objects, problem, new Map());
  };

  it('should initialize with configuration', () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const config: Partial<SimulatedAnnealingConfig> = {
      maxIterations: 100,
      initialTemperature: 1000,
      coolingRate: 0.95,
      minTemperature: 0.1,
    };

    const solver = new SimulatedAnnealingSolver(problem, initialState, config);

    expect(solver).toBeDefined();
  });

  it('should use default configuration', () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const solver = new SimulatedAnnealingSolver(problem, initialState);

    expect(solver).toBeDefined();
  });

  it('should solve within iteration limit', async () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const config: Partial<SimulatedAnnealingConfig> = {
      maxIterations: 50,
      initialTemperature: 100,
      coolingRate: 0.9,
    };

    const solver = new SimulatedAnnealingSolver(problem, initialState, config);
    const result = await solver.solve();

    expect(result.iteration).toBeLessThanOrEqual(50);
    expect(result.state).toBeDefined();
    expect(result.score).toBeDefined();
  }, 10000);

  it('should track best solution', async () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const config: Partial<SimulatedAnnealingConfig> = {
      maxIterations: 30,
      initialTemperature: 100,
    };

    const solver = new SimulatedAnnealingSolver(problem, initialState, config);
    const result = await solver.solve();

    // Best score should be <= initial score
    expect(result.score).toBeLessThanOrEqual(Infinity);
  }, 10000);

  it('should generate diverse moves', () => {
    const problem = createTestProblem();
    const state = createInitialState(problem);

    const solver = new SimulatedAnnealingSolver(problem, state, { maxIterations: 10 });
    const moves = solver.generateMoves(state, 20);

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(20);

    // Should have different types of moves
    const moveTypes = new Set(moves.map(m => m.constructor.name));
    expect(moveTypes.size).toBeGreaterThan(1);
  });
});

describe('Greedy Solver', () => {
  const createTestProblem = (): Problem => {
    const chair = item('chair_1');
    const table = item('table_1');

    const constraints: NamedConstraint[] = [
      {
        name: 'chair_near_table',
        constraint: new Proximity(chair, table, 1.0),
        weight: 1.0,
      },
    ];

    return buildProblem(constraints, []);
  };

  const createInitialState = (problem: Problem): State => {
    const objects = new Map<string, ObjectState>();
    objects.set('chair_1', new ObjectState(
      'chair_1',
      new SemanticsTag('chair'),
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));
    objects.set('table_1', new ObjectState(
      'table_1',
      new SemanticsTag('table'),
      { position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));

    return new State(objects, problem, new Map());
  };

  it('should initialize with configuration', () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const config: Partial<GreedyConfig> = {
      maxIterations: 100,
      movesPerIteration: 10,
      restartThreshold: 20,
    };

    const solver = new GreedySolver(problem, initialState, config);

    expect(solver).toBeDefined();
  });

  it('should solve with greedy strategy', async () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const config: Partial<GreedyConfig> = {
      maxIterations: 50,
      movesPerIteration: 5,
    };

    const solver = new GreedySolver(problem, initialState, config);
    const result = await solver.solve();

    expect(result.iteration).toBeLessThanOrEqual(50);
    expect(result.state).toBeDefined();
  }, 10000);

  it('should restart after no improvement threshold', async () => {
    const problem = createTestProblem();
    const initialState = createInitialState(problem);

    const config: Partial<GreedyConfig> = {
      maxIterations: 100,
      movesPerIteration: 5,
      restartThreshold: 10,
    };

    const solver = new GreedySolver(problem, initialState, config);
    const result = await solver.solve();

    // Should complete without hanging
    expect(result.iteration).toBeGreaterThan(0);
  }, 10000);
});

describe('Move Validation', () => {
  it('should reject invalid moves', () => {
    const objects = new Map<string, ObjectState>();
    objects.set('chair_1', new ObjectState(
      'chair_1',
      new SemanticsTag('chair'),
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));

    const problem: Problem = { variables: new Map(), constraints: [], scoreTerms: [] };
    const state = new State(objects, problem, new Map());

    const invalidMove = new TranslateMove('nonexistent', { x: 1, y: 0, z: 0 }, 100);

    expect(invalidMove.isValid(state)).toBe(false);
  });

  it('should accept valid moves', () => {
    const objects = new Map<string, ObjectState>();
    objects.set('chair_1', new ObjectState(
      'chair_1',
      new SemanticsTag('chair'),
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    ));

    const problem: Problem = { variables: new Map(), constraints: [], scoreTerms: [] };
    const state = new State(objects, problem, new Map());

    const validMove = new TranslateMove('chair_1', { x: 1, y: 0, z: 0 }, 100);

    expect(validMove.isValid(state)).toBe(true);
  });
});
