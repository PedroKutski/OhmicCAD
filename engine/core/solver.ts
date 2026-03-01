import { SparseMatrix } from './matrixSparse';
import { Device } from '../devices/Device';

export class Solver {
  private matrix: SparseMatrix;
  private rhs: number[];
  private solution: number[];
  private devices: Device[] = [];
  private numNodes: number = 0;
  private extraVars: number = 0;
  private timeStep: number = 1e-6;
  private maxIterations: number = 50;
  private relTol: number = 1e-3;
  private absTol: number = 1e-9;

  constructor(numNodes: number) {
    this.numNodes = numNodes;
    this.matrix = new SparseMatrix(numNodes);
    this.rhs = new Array(numNodes).fill(0);
    this.solution = new Array(numNodes).fill(0);
  }

  public addDevice(device: Device): void {
    this.devices.push(device);
    const extra = device.getExtraVariables();
    if (extra > 0) {
      device.extraVarIndex = this.numNodes + this.extraVars;
      this.extraVars += extra;
    }
  }

  public setTimeStep(dt: number): void {
    this.timeStep = dt;
  }

  public solveNewton(): boolean {
    let converged = false;
    let iteration = 0;

    while (iteration < this.maxIterations) {
      this.matrix.clear();
      this.rhs.fill(0);

      // Stamp Linear Components
      for (const device of this.devices) {
        device.stampLinear(this.matrix, this.rhs, this.timeStep);
      }

      // Stamp Non-Linear Components
      for (const device of this.devices) {
        device.stampNonLinear(this.matrix, this.rhs, this.solution, this.timeStep);
      }

      // Solve Linear System
      const newSolution = this.matrix.solve(this.rhs);

      // Check Convergence
      converged = this.checkConvergence(this.solution, newSolution);
      this.solution = newSolution;

      if (converged) break;
      iteration++;
    }

    return converged;
  }

  private checkConvergence(oldSol: number[], newSol: number[]): boolean {
    for (let i = 0; i < oldSol.length; i++) {
      const diff = Math.abs(newSol[i] - oldSol[i]);
      const tol = this.relTol * Math.abs(newSol[i]) + this.absTol;
      if (diff > tol) return false;
    }
    return true;
  }

  public getSolution(): number[] {
    return this.solution;
  }
}
