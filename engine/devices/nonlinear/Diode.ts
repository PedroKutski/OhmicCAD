import { SparseMatrix } from '../../core/matrixSparse';
import { Device } from '../Device';

export class Diode extends Device {
  private Is: number = 1e-12;
  private Vt: number = 0.026;

  constructor(id: string, node1: number, node2: number, Is: number = 1e-12) {
    super(id, node1, node2);
    this.Is = Is;
  }

  public stampLinear(matrix: SparseMatrix, rhs: number[], dt: number): void {
    // Diode is non-linear
  }

  public stampNonLinear(matrix: SparseMatrix, rhs: number[], solution: number[], dt: number): void {
    const v1 = solution[this.node1];
    const v2 = solution[this.node2];
    const vd = v1 - v2;

    // Linearization: I = Is * (exp(Vd/Vt) - 1)
    // G = dI/dV = (Is/Vt) * exp(Vd/Vt)
    // Ieq = I - G * Vd

    const expV = Math.exp(vd / this.Vt);
    const G = (this.Is / this.Vt) * expV;
    const I = this.Is * (expV - 1);
    const Ieq = I - G * vd;

    const n1 = this.node1;
    const n2 = this.node2;

    // Conductance
    matrix.add(n1, n1, G);
    matrix.add(n2, n2, G);
    matrix.add(n1, n2, -G);
    matrix.add(n2, n1, -G);

    // Current Source
    rhs[n1] -= Ieq;
    rhs[n2] += Ieq;
  }

  public getExtraVariables(): number {
    return 0;
  }

  public getCurrent(solution: number[], dt: number): number {
    const v1 = solution[this.node1];
    const v2 = solution[this.node2];
    const vd = v1 - v2;
    return this.Is * (Math.exp(vd / this.Vt) - 1);
  }
}
