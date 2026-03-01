import { Solver } from '../core/solver';

export class TransientAnalysis {
  private solver: Solver;
  private time: number = 0;
  private dt: number = 1e-6;
  private maxTime: number = 1e-3;

  constructor(solver: Solver, maxTime: number, dt: number) {
    this.solver = solver;
    this.maxTime = maxTime;
    this.dt = dt;
  }

  public run(): void {
    while (this.time < this.maxTime) {
      this.solver.setTimeStep(this.dt);
      const converged = this.solver.solveNewton();

      if (!converged) {
        // Reduce timestep and retry
        this.dt /= 2;
        continue;
      }

      // Advance time
      this.time += this.dt;
      // Optionally increase dt if convergence was fast
    }
  }
}
