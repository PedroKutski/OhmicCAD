import { SparseMatrix } from '../../core/matrixSparse';
import { Device } from '../Device';

export class VoltageSource extends Device {
  public voltage: number;

  constructor(id: string, node1: number, node2: number, voltage: number) {
    super(id, node1, node2);
    this.voltage = voltage;
  }

  public stampLinear(matrix: SparseMatrix, rhs: number[], dt: number): void {
    const n1 = this.node1;
    const n2 = this.node2;
    const idx = this.extraVarIndex;

    // V1 - V2 = Vsrc
    matrix.add(idx, n1, 1);
    matrix.add(idx, n2, -1);
    rhs[idx] = this.voltage;

    // Current variable enters n1, leaves n2
    matrix.add(n1, idx, 1);
    matrix.add(n2, idx, -1);
  }

  public stampNonLinear(matrix: SparseMatrix, rhs: number[], solution: number[], dt: number): void {
    // Voltage Source is linear
  }

  public getExtraVariables(): number {
    return 1;
  }

  public getCurrent(solution: number[], dt: number): number {
    return solution[this.extraVarIndex];
  }
}
