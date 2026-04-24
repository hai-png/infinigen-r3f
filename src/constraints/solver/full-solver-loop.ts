/**
 * Full Solver Loop: End-to-End MCMC with All Proposal Strategies
 * 
 * Integrates constraint evaluation, domain reasoning, and proposal strategies
 * into a complete solving pipeline.
 */

import { ConstraintSystem } from '../language/constraint-system';
import { Variable, Domain } from '../language/types';
import { Evaluator } from '../constraints/evaluator/evaluator';
import { 
  ContinuousProposalGenerator as ContinuousProposer, 
  DiscreteProposalGenerator as DiscreteProposer,
  HybridProposalGenerator as HybridProposer
} from './proposals/ProposalStrategies';
import { SimulatedAnnealingSolver } from './sa-solver';
import { bridge } from '../bridge/hybrid-bridge';
import { SolverState, Proposal } from '../types';

export interface SolverConfig {
  maxIterations: number;
  initialTemperature: number;
  coolingRate: number;
  minTemperature: number;
  useHybridBridge: boolean;
  enableDomainReasoning: boolean;
}

export class FullSolverLoop {
  private constraintSystem: ConstraintSystem;
  private evaluator: Evaluator;
  private continuousProposer: ContinuousProposer;
  private discreteProposer: DiscreteProposer;
  private hybridProposer: HybridProposer;
  private saSolver: SimulatedAnnealingSolver;
  private config: SolverConfig;
  private state: SolverState | null = null;

  constructor(config: Partial<SolverConfig> = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 10000,
      initialTemperature: config.initialTemperature ?? 1000,
      coolingRate: config.coolingRate ?? 0.995,
      minTemperature: config.minTemperature ?? 0.1,
      useHybridBridge: config.useHybridBridge ?? false,
      enableDomainReasoning: config.enableDomainReasoning ?? true,
    };

    this.constraintSystem = new ConstraintSystem();
    this.evaluator = new Evaluator();
    this.continuousProposer = new ContinuousProposer();
    this.discreteProposer = new DiscreteProposer();
    this.hybridProposer = new HybridProposer(
      this.continuousProposer,
      this.discreteProposer
    );
    this.saSolver = new SimulatedAnnealingSolver(this.config);
  }

  /**
   * Add a constraint to the system
   */
  addConstraint(constraint: any): void {
    this.constraintSystem.addConstraint(constraint);
  }

  /**
   * Add a variable with its domain
   */
  addVariable(variable: Variable, domain: Domain): void {
    this.constraintSystem.addVariable(variable, domain);
  }

  /**
   * Run the full MCMC solving loop
   */
  async solve(): Promise<SolverState> {
    console.log('[FullSolverLoop] Starting solve...');
    
    // Initialize bridge if enabled
    if (this.config.useHybridBridge) {
      try {
        await bridge.connect();
        console.log('[FullSolverLoop] Hybrid bridge connected');
      } catch (e) {
        console.warn('[FullSolverLoop] Failed to connect hybrid bridge, running in browser-only mode');
        this.config.useHybridBridge = false;
      }
    }

    // Apply domain reasoning/substitution if enabled
    if (this.config.enableDomainReasoning) {
      console.log('[FullSolverLoop] Applying domain substitution...');
      this.applyDomainReasoning();
    }

    // Initialize state
    this.state = this.saSolver.initialize(this.constraintSystem);

    let iteration = 0;
    let temperature = this.config.initialTemperature;

    while (iteration < this.config.maxIterations && temperature > this.config.minTemperature) {
      iteration++;
      
      // Generate proposal using hybrid strategy
      const proposal = this.generateProposal(temperature);
      
      if (!proposal) {
        continue;
      }

      // Evaluate energy change
      const energyDelta = this.evaluateProposal(proposal);

      // Accept/reject based on Metropolis criterion
      const accepted = this.saSolver.acceptProposal(energyDelta, temperature);
      
      if (accepted) {
        this.applyProposal(proposal);
        this.state!.energy += energyDelta;
      }

      // Cool down
      temperature *= this.config.coolingRate;

      // Progress logging
      if (iteration % 1000 === 0) {
        console.log(`[FullSolverLoop] Iteration ${iteration}, Energy: ${this.state!.energy.toFixed(4)}, Temp: ${temperature.toFixed(4)}`);
      }

      // Early exit if energy is near zero (all constraints satisfied)
      if (Math.abs(this.state!.energy) < 1e-6) {
        console.log('[FullSolverLoop] Converged!');
        break;
      }
    }

    // Cleanup
    if (this.config.useHybridBridge) {
      bridge.disconnect();
    }

    this.state!.iteration = iteration;
    console.log(`[FullSolverLoop] Solve complete after ${iteration} iterations, final energy: ${this.state!.energy.toFixed(4)}`);

    return this.state!;
  }

  /**
   * Apply domain reasoning to simplify constraints
   */
  private applyDomainReasoning(): void {
    // Substitute domains where possible
    // This is a simplified version - full implementation would use domain-substitute.ts
    const variables = this.constraintSystem.getVariables();
    
    for (const [id, variable] of variables) {
      const domain = this.constraintSystem.getDomain(id);
      if (domain && domain.type === 'object_set' && domain.values.length === 1) {
        // Variable has single value in domain, substitute directly
        variable.value = domain.values[0];
        console.log(`[DomainReasoning] Substituted ${id} = ${domain.values[0]}`);
      }
    }

    // Remove satisfied constraints
    this.constraintSystem.simplify();
  }

  /**
   * Generate a proposal using appropriate strategy
   */
  private generateProposal(temperature: number): Proposal | null {
    // Choose proposer based on variable type and temperature
    const variables = this.constraintSystem.getVariables();
    const unassignedVars = Array.from(variables.entries())
      .filter(([_, v]) => v.value === undefined)
      .map(([id, v]) => ({ id, variable: v }));

    if (unassignedVars.length === 0) {
      return null;
    }

    // Select random variable
    const selected = unassignedVars[Math.floor(Math.random() * unassignedVars.length)];
    const domain = this.constraintSystem.getDomain(selected.id);

    if (!domain) {
      return null;
    }

    // Use hybrid proposer to decide continuous vs discrete
    if (domain.type === 'pose' || domain.type === 'numeric') {
      return this.continuousProposer.propose(selected.id, selected.variable.value, domain, temperature);
    } else {
      return this.discreteProposer.propose(selected.id, selected.variable.value, domain, temperature);
    }
  }

  /**
   * Evaluate energy change from proposal
   */
  private evaluateProposal(proposal: Proposal): number {
    // Temporarily apply proposal
    const variable = this.constraintSystem.getVariable(proposal.variableId);
    const oldValue = variable?.value;

    if (variable) {
      variable.value = proposal.newValue;
    }

    // Calculate total constraint violation (energy)
    const newEnergy = this.evaluator.evaluateAll(this.constraintSystem);
    
    // Restore old value
    if (variable && oldValue !== undefined) {
      variable.value = oldValue;
    }

    // Calculate old energy (cached or recalculated)
    const oldEnergy = this.state?.energy ?? 0;

    return newEnergy - oldEnergy;
  }

  /**
   * Apply accepted proposal to state
   */
  private applyProposal(proposal: Proposal): void {
    const variable = this.constraintSystem.getVariable(proposal.variableId);
    if (variable) {
      variable.value = proposal.newValue;
      
      // Update state assignments
      if (this.state) {
        this.state.assignments.set(proposal.variableId, proposal.newValue);
      }
    }
  }

  /**
   * Get current solver state
   */
  getState(): SolverState | null {
    return this.state;
  }

  /**
   * Export solution to MJCF (requires hybrid bridge)
   */
  async exportToMjcf(sceneId: string): Promise<string> {
    if (!this.config.useHybridBridge) {
      throw new Error('Hybrid bridge not enabled');
    }

    const config = this.buildPhysicsConfig(sceneId);
    return await bridge.exportMjcf(config);
  }

  /**
   * Build physics config from current state
   */
  private buildPhysicsConfig(sceneId: string): any {
    // Convert solver state to physics configuration
    // This would integrate with the SIM module for full physics setup
    return {
      sceneId,
      objects: [],
      gravity: [0, -9.81, 0],
      timestep: 0.002,
    };
  }
}

export { FullSolverLoop as MCMCSolver };
