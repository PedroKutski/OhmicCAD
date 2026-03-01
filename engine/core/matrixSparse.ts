export class SparseMatrix {
  private readonly size: number;
  private readonly data: Map<number, number>;

  constructor(size: number) {
    this.size = size;
    this.data = new Map<number, number>();
  }

  private getIndex(row: number, col: number): number {
    return row * this.size + col;
  }

  public get(row: number, col: number): number {
    return this.data.get(this.getIndex(row, col)) || 0;
  }

  public set(row: number, col: number, value: number): void {
    if (Math.abs(value) < 1e-15) {
      this.data.delete(this.getIndex(row, col));
    } else {
      this.data.set(this.getIndex(row, col), value);
    }
  }

  public add(row: number, col: number, value: number): void {
    const idx = this.getIndex(row, col);
    const current = this.data.get(idx) || 0;
    const next = current + value;
    if (Math.abs(next) < 1e-15) {
      this.data.delete(idx);
    } else {
      this.data.set(idx, next);
    }
  }

  public clear(): void {
    this.data.clear();
  }

  public toDense(): Float64Array {
    const dense = new Float64Array(this.size * this.size);
    for (const [key, value] of this.data.entries()) {
      dense[key] = value;
    }
    return dense;
  }

  public solve(rhs: number[]): number[] {
    const n = this.size;
    const x = new Float64Array(rhs);
    const A = this.toDense();
    const p = new Int32Array(n); // Permutation vector

    for (let i = 0; i < n; i++) p[i] = i;

    // Gaussian elimination with partial pivoting
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      let maxVal = Math.abs(A[i * n + i]);

      for (let k = i + 1; k < n; k++) {
        const val = Math.abs(A[k * n + i]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = k;
        }
      }

      if (maxVal < 1e-12) {
        // Add Gmin to diagonal to handle floating nodes
        A[i * n + i] += 1e-12; 
        maxVal = Math.abs(A[i * n + i]);
        if (maxVal < 1e-12) throw new Error(`Singular matrix at row ${i}`);
      }

      if (maxRow !== i) {
        // Swap rows in A
        for (let k = i; k < n; k++) {
          const temp = A[i * n + k];
          A[i * n + k] = A[maxRow * n + k];
          A[maxRow * n + k] = temp;
        }
        // Swap rows in x (RHS)
        const tempX = x[i];
        x[i] = x[maxRow];
        x[maxRow] = tempX;
      }

      const pivot = A[i * n + i];
      for (let k = i + 1; k < n; k++) {
        const factor = A[k * n + i] / pivot;
        for (let j = i; j < n; j++) {
          A[k * n + j] -= factor * A[i * n + j];
        }
        x[k] -= factor * x[i];
      }
    }

    // Back substitution
    const solution = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += A[i * n + j] * solution[j];
      }
      solution[i] = (x[i] - sum) / A[i * n + i];
    }

    return solution;
  }
}
