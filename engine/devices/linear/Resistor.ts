import { SparseMatrix } from '../../core/matrixSparse';
import { Device } from '../Device';

export class Resistor extends Device {
  public resistance: number;

  constructor(id: string, node1: number, node2: number, resistance: number) {
    super(id, node1, node2);
    this.resistance = resistance;
  }

  public stampLinear(matrix: SparseMatrix, rhs: number[], dt: number): void {
    const G = 1 / Math.max(1e-12, this.resistance);
    const n1 = this.node1;
    const n2 = this.node2;

    matrix.add(n1, n1, G);
    matrix.add(n2, n2, G);
    matrix.add(n1, n2, -G);
    matrix.add(n2, n1, -G);
  }

  public stampNonLinear(matrix: SparseMatrix, rhs: number[], solution: number[], dt: number): void {
    // Resistor is linear
  }

  public getExtraVariables(): number {
    return 0;
  }

  public getCurrent(solution: number[], dt: number): number {
    const v1 = solution[this.node1];
    const v2 = solution[this.node2];
    return (v1 - v2) / this.resistance;
  }
}
