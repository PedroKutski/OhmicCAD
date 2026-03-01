import { SparseMatrix } from '../core/matrixSparse';

export abstract class Device {
  public id: string;
  public node1: number;
  public node2: number;
  public extraVarIndex: number = -1;

  constructor(id: string, node1: number, node2: number) {
    this.id = id;
    this.node1 = node1;
    this.node2 = node2;
  }

  public abstract stampLinear(matrix: SparseMatrix, rhs: number[], dt: number): void;
  public abstract stampNonLinear(matrix: SparseMatrix, rhs: number[], solution: number[], dt: number): void;
  public abstract getExtraVariables(): number;
  public abstract getCurrent(solution: number[], dt: number): number;
}
