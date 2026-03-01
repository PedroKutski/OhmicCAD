import { SparseMatrix } from '../../core/matrixSparse';
import { Device } from '../Device';

export class Capacitor extends Device {
  public capacitance: number;
  private storedVoltage: number = 0;

  constructor(id: string, node1: number, node2: number, capacitance: number) {
    super(id, node1, node2);
    this.capacitance = capacitance;
  }

  public stampLinear(matrix: SparseMatrix, rhs: number[], dt: number): void {
    const G = this.capacitance / dt;
    const n1 = this.node1;
    const n2 = this.node2;

    // Conductance part
    matrix.add(n1, n1, G);
    matrix.add(n2, n2, G);
    matrix.add(n1, n2, -G);
    matrix.add(n2, n1, -G);

    // Current source part (Ieq = G * Vprev)
    const Ieq = G * this.storedVoltage;
    rhs[n1] += Ieq;
    rhs[n2] -= Ieq;
  }

  public stampNonLinear(matrix: SparseMatrix, rhs: number[], solution: number[], dt: number): void {
    // Capacitor is linear in MNA
  }

  public getExtraVariables(): number {
    return 0;
  }

  public getCurrent(solution: number[], dt: number): number {
    const v1 = solution[this.node1];
    const v2 = solution[this.node2];
    const vNew = v1 - v2;
    return (this.capacitance / dt) * (vNew - this.storedVoltage);
  }
}
