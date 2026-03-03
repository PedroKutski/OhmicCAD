export interface LedNewtonRaphsonParams {
  /**
   * Matriz base de condutâncias (MNA) sem o componente não-linear carimbado.
   */
  baseG: number[][];
  /**
   * Vetor base de correntes/fonte independente (lado direito da MNA).
   */
  baseI: number[];
  /**
   * Índice do nó positivo (ânodo do LED).
   */
  positiveNode: number;
  /**
   * Índice do nó negativo (cátodo do LED).
   */
  negativeNode: number;
  /**
   * Chute inicial de tensões nodais.
   */
  initialVoltages: number[];
  /**
   * Corrente de saturação do modelo Shockley.
   */
  Is?: number;
  /**
   * Tensão térmica do modelo Shockley.
   */
  Vt?: number;
  /**
   * Tolerância para convergência de Newton-Raphson.
   */
  tolerance?: number;
  /**
   * Limite de iterações do método.
   */
  maxIterations?: number;
}

export interface LedNewtonRaphsonResult {
  converged: boolean;
  iterations: number;
  nodeVoltages: number[];
  ledVoltage: number;
  ledCurrent: number;
}

const cloneMatrix = (matrix: number[][]): number[][] => matrix.map(row => [...row]);

const assertMatrixDimensions = (matrix: number[][], rhs: number[]): void => {
  if (matrix.length === 0 || matrix.length !== rhs.length) {
    throw new Error('Dimensões inválidas: matriz G e vetor I devem ter o mesmo tamanho.');
  }

  const matrixSize = matrix.length;
  matrix.forEach((row, index) => {
    if (row.length !== matrixSize) {
      throw new Error(`Matriz G inválida: linha ${index} possui tamanho ${row.length}, esperado ${matrixSize}.`);
    }
  });
};

/**
 * Resolve A*x=b por eliminação de Gauss com pivoteamento parcial.
 */
export const solveLinearSystemGaussian = (A: number[][], b: number[]): number[] => {
  const n = A.length;
  const M = cloneMatrix(A);
  const rhs = [...b];

  for (let pivot = 0; pivot < n; pivot++) {
    let maxRow = pivot;
    let maxAbs = Math.abs(M[pivot][pivot]);

    for (let row = pivot + 1; row < n; row++) {
      const value = Math.abs(M[row][pivot]);
      if (value > maxAbs) {
        maxAbs = value;
        maxRow = row;
      }
    }

    if (maxAbs < 1e-18) {
      throw new Error('Matriz singular ou mal-condicionada durante eliminação de Gauss.');
    }

    if (maxRow !== pivot) {
      [M[pivot], M[maxRow]] = [M[maxRow], M[pivot]];
      [rhs[pivot], rhs[maxRow]] = [rhs[maxRow], rhs[pivot]];
    }

    for (let row = pivot + 1; row < n; row++) {
      const factor = M[row][pivot] / M[pivot][pivot];
      if (factor === 0) continue;

      for (let col = pivot; col < n; col++) {
        M[row][col] -= factor * M[pivot][col];
      }
      rhs[row] -= factor * rhs[pivot];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let col = row + 1; col < n; col++) {
      sum -= M[row][col] * x[col];
    }
    x[row] = sum / M[row][row];
  }

  return x;
};

const stampCompanionModel = (
  G: number[][],
  I: number[],
  positiveNode: number,
  negativeNode: number,
  Geq: number,
  Ieq: number,
): void => {
  G[positiveNode][positiveNode] += Geq;
  G[negativeNode][negativeNode] += Geq;
  G[positiveNode][negativeNode] -= Geq;
  G[negativeNode][positiveNode] -= Geq;

  I[positiveNode] -= Ieq;
  I[negativeNode] += Ieq;
};

/**
 * Motor matemático MNA + Newton-Raphson para um LED/diodo não-linear.
 */
export const solveLedWithMnaNewtonRaphson = (
  params: LedNewtonRaphsonParams,
): LedNewtonRaphsonResult => {
  const {
    baseG,
    baseI,
    positiveNode,
    negativeNode,
    initialVoltages,
    Is = 1e-12,
    Vt = 0.026,
    tolerance = 1e-6,
    maxIterations = 50,
  } = params;

  assertMatrixDimensions(baseG, baseI);

  if (initialVoltages.length !== baseI.length) {
    throw new Error('initialVoltages deve possuir o mesmo tamanho de baseI.');
  }

  let V_old = [...initialVoltages];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // Passo A: tensão instantânea no LED.
    const Vd = V_old[positiveNode] - V_old[negativeNode];

    // Passo B: modelo Shockley linearizado (modelo companheiro).
    const limitedVd = Math.max(-1, Math.min(Vd, 1.5));
    const expTerm = Math.exp(limitedVd / Vt);
    const Id = Is * (expTerm - 1);
    const Geq = (Is / Vt) * expTerm;
    const Ieq = Id - Geq * Vd;

    // Passo C: carimbo temporário em cópias da MNA base.
    const workingG = cloneMatrix(baseG);
    const workingI = [...baseI];
    stampCompanionModel(workingG, workingI, positiveNode, negativeNode, Geq, Ieq);

    // Passo D: resolução da MNA linearizada.
    const V_new = solveLinearSystemGaussian(workingG, workingI);

    // Passo E: convergência.
    let maxDelta = 0;
    for (let i = 0; i < V_new.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(V_new[i] - V_old[i]));
    }

    if (maxDelta < tolerance) {
      const finalVd = V_new[positiveNode] - V_new[negativeNode];
      const finalId = Is * (Math.exp(Math.max(-1, Math.min(finalVd, 1.5)) / Vt) - 1);
      return {
        converged: true,
        iterations: iteration,
        nodeVoltages: V_new,
        ledVoltage: finalVd,
        ledCurrent: finalId,
      };
    }

    // Próxima iteração (equivalente a reverter os carimbos e atualizar chutes).
    V_old = V_new;
  }

  const finalVd = V_old[positiveNode] - V_old[negativeNode];
  const finalId = Is * (Math.exp(Math.max(-1, Math.min(finalVd, 1.5)) / Vt) - 1);

  return {
    converged: false,
    iterations: maxIterations,
    nodeVoltages: V_old,
    ledVoltage: finalVd,
    ledCurrent: finalId,
  };
};
