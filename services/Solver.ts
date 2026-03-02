import { ComponentModel, WireModel, ComponentType } from '../types';
import { SparseMatrix } from '../engine/core/matrixSparse';

const G_MIN = 1e-10;
const R_CLOSED_SWITCH = 0.001;
const R_OPEN_SWITCH = 1e13;
const MAX_ITERATIONS = 50;
const NEWTON_TOLERANCE = 1e-9;

const LED_VT = 0.02585;

const linearizeLed = (vd: number, c: ComponentModel) => {
  const V_fwdNominal = Math.max(0.8, c.props.voltageDrop || 2.0);
  const ratedCurrent = Math.max(1e-9, c.props.currentRating || 0.02);
  const n = 2.0;
  const R_series = Math.max(0.5, V_fwdNominal / Math.max(1e-9, ratedCurrent * 40));
  const thermal = n * LED_VT;
  const junctionNominal = Math.max(0.1, V_fwdNominal - ratedCurrent * R_series);
  const denom = Math.exp(Math.min(80, junctionNominal / thermal)) - 1;
  const Is = Math.max(1e-30, ratedCurrent / Math.max(1e-12, denom));

  let current = vd > 0 ? Math.max(0, (vd - V_fwdNominal) / Math.max(0.5, R_series)) : -Is;
  for (let k = 0; k < 12; k++) {
    const junctionVoltage = vd - current * R_series;
    const exponent = Math.min(80, Math.max(-40, junctionVoltage / thermal));
    const expTerm = Math.exp(exponent);
    const shockleyCurrent = Is * (expTerm - 1);
    const residual = current - shockleyCurrent;
    const derivative = 1 + (Is * expTerm * R_series) / thermal;
    const step = residual / Math.max(1e-12, derivative);
    current -= step;
    if (Math.abs(step) < 1e-12) break;
  }

  const junctionVoltage = vd - current * R_series;
  const exponent = Math.min(80, Math.max(-40, junctionVoltage / thermal));
  const expTerm = Math.exp(exponent);
  const gd = (Is * expTerm) / thermal;

  const G = Math.max(1e-10, gd / (1 + gd * R_series));
  const I_eq = current - G * vd;

  return { G, I_eq, current };
};

export class CircuitSolver {
  private static buildPortToNetMap(components: ComponentModel[], wires: WireModel[]): Map<string, number> {
    const allPorts: string[] = [];
    components.forEach(c => {
      allPorts.push(`${c.id}_0`);
      if (c.type !== ComponentType.Junction) allPorts.push(`${c.id}_1`);
    });

    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    const makeSet = (x: string) => {
      if (parent.has(x)) return;
      parent.set(x, x);
      rank.set(x, 0);
    };

    const find = (x: string): string => {
      const p = parent.get(x);
      if (!p) {
        makeSet(x);
        return x;
      }
      if (p === x) return x;
      const root = find(p);
      parent.set(x, root);
      return root;
    };

    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      const rankA = rank.get(ra) || 0;
      const rankB = rank.get(rb) || 0;
      if (rankA < rankB) {
        parent.set(ra, rb);
      } else if (rankA > rankB) {
        parent.set(rb, ra);
      } else {
        parent.set(rb, ra);
        rank.set(ra, rankA + 1);
      }
    };

    allPorts.forEach(makeSet);
    wires.forEach(w => {
      const pA = `${w.compAId}_${w.portAIndex}`;
      const pB = `${w.compBId}_${w.portBIndex}`;
      if (parent.has(pA) && parent.has(pB)) union(pA, pB);
    });

    const rootToNet = new Map<string, number>();
    const portToNet = new Map<string, number>();
    allPorts.forEach(port => {
      const root = find(port);
      let netIdx = rootToNet.get(root);
      if (netIdx === undefined) {
        netIdx = rootToNet.size;
        rootToNet.set(root, netIdx);
      }
      portToNet.set(port, netIdx);
    });

    return portToNet;
  }

  static solve(components: ComponentModel[], wires: WireModel[], dt: number = 0.1, simTime: number = 0): { ok: boolean; error?: string } {
    const voltageSources: ComponentModel[] = components.filter(c => c.type === ComponentType.Battery || c.type === ComponentType.ACSource);
    const portToNet = CircuitSolver.buildPortToNetMap(components, wires);
    const netCount = new Set(portToNet.values()).size;

    const size = netCount + voltageSources.length;
    let sol = new Array(size).fill(0);

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const A = new SparseMatrix(size);
      const B = Array(size).fill(0);

      const stampR = (u: number, v: number, r: number) => {
        if (u === v) return;
        const g = 1 / Math.max(1e-14, r);
        A.add(u, u, g); A.add(v, v, g);
        A.add(u, v, -g); A.add(v, u, -g);
      };

      const stampG = (u: number, v: number, g: number) => {
        if (u === v) return;
        A.add(u, u, g); A.add(v, v, g);
        A.add(u, v, -g); A.add(v, u, -g);
      };

      const stampVoltageSource = (u: number, v: number, voltage: number, idx: number, Rs: number = 0) => {
        if (u !== v) {
          A.add(idx, u, 1); A.add(idx, v, -1);
          A.add(u, idx, 1); A.add(v, idx, -1);
        }
        A.add(idx, idx, -Rs);
        B[idx] = voltage;
      };

      components.forEach(c => {
        if (c.type === ComponentType.Junction) return;
        const u = portToNet.get(`${c.id}_0`)!;
        const v = portToNet.get(`${c.id}_1`)!;

        if (c.type === ComponentType.Resistor) {
          stampR(u, v, Math.max(1e-6, c.props.resistance || 1000));
        } else if (c.type === ComponentType.Switch || c.type === ComponentType.PushButton) {
          stampR(u, v, c.props.closed ? R_CLOSED_SWITCH : R_OPEN_SWITCH);
        } else if (c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) {
          const unit = c.props.capacitanceUnit || 'µF';
          let mult = 1e-6;
          if (unit === 'mF') mult = 1e-3;
          if (unit === 'nF') mult = 1e-9;
          if (unit === 'pF') mult = 1e-12;
          const C = (c.props.capacitance || 10) * mult;
          const G = C / dt;
          const vPrev = c.simData.storedVoltage || 0;
          const I_eq = -G * vPrev;

          stampG(u, v, G);
          stampG(u, v, 1e-12);
          B[u] -= I_eq;
          B[v] += I_eq;
        } else if (c.type === ComponentType.Diode || c.type === ComponentType.LED) {
          let V_fwd = c.type === ComponentType.LED ? Math.max(0.8, c.props.voltageDrop || 2.0) : 0.7;
          if (c.props.diodeType === 'schottky') V_fwd = 0.3;

          const V_zener = c.props.zenerVoltage || 5.6;
          const R_on = 0.1;
          const G_off = 1e-10;
          const Vd = iter > 0 ? (sol[u] - sol[v]) : 0;

          if (c.type === ComponentType.LED) {
            if (Vd > 0) {
              const { G, I_eq } = linearizeLed(Vd, c);
              stampG(u, v, G);
              B[u] -= I_eq; B[v] += I_eq;
            } else {
              stampG(u, v, G_off);
            }
          } else if (Vd > V_fwd) {
            const G = 1 / R_on;
            const I_eq = -V_fwd / R_on;
            stampG(u, v, G);
            B[u] -= I_eq; B[v] += I_eq;
          } else if (c.props.diodeType === 'zener' && Vd < -V_zener) {
            const G = 1 / R_on;
            const I_eq = V_zener / R_on;
            stampG(u, v, G);
            B[u] -= I_eq; B[v] += I_eq;
          } else {
            stampG(u, v, G_off);
          }
        } else if (c.type === ComponentType.Lamp) {
          stampR(u, v, 100);
        } else if (c.type === ComponentType.Inductor) {
          const L = c.props.inductance || 100e-3;
          const Rs = 0.1;
          const safeDt = Math.max(1e-6, dt);
          const G_eq = 1 / (Rs + L / safeDt);
          const iPrev = c.simData.storedCurrent || 0;
          const I_eq = iPrev * (L / safeDt) * G_eq;

          stampG(u, v, G_eq);
          B[u] -= I_eq;
          B[v] += I_eq;
        } else if (c.type === ComponentType.Battery) {
          const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
          stampVoltageSource(v, u, c.props.voltage || 9, netCount + vsIdx, 0.1);
        } else if (c.type === ComponentType.ACSource) {
          const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
          const amp = c.props.amplitude || 20;
          const freq = c.props.frequency || 60;
          const val = amp * Math.sin(2 * Math.PI * freq * simTime);
          stampVoltageSource(v, u, val, netCount + vsIdx, 0.1);
        }
      });

      for (let i = 0; i < netCount; i++) A.add(i, i, G_MIN);
      for (let j = 0; j < size; j++) {
        if (j !== 0) {
          A.set(0, j, 0);
          A.set(j, 0, 0);
        }
      }
      A.set(0, 0, 1);
      B[0] = 0;

      const previousSol = sol;
      try {
        sol = A.solve(B);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown matrix solve error';
        return { ok: false, error: `Falha na simulação: matriz singular ou mal-condicionada (${message}).` };
      }

      if (sol.some(Number.isNaN)) {
        sol.fill(0);
        return { ok: false, error: 'Falha na simulação: solução numérica inválida (NaN).' };
      }

      const maxDelta = sol.reduce((m, v, i) => Math.max(m, Math.abs(v - previousSol[i])), 0);
      if (maxDelta < NEWTON_TOLERANCE) break;
    }

    components.forEach(c => {
      if (c.type === ComponentType.Junction) return;
      const u = portToNet.get(`${c.id}_0`)!;
      const v = portToNet.get(`${c.id}_1`)!;

      const newVoltage = sol[u] - sol[v];
      let newCurrent = 0;

      if (c.type === ComponentType.Battery || c.type === ComponentType.ACSource) {
        const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
        newCurrent = -sol[netCount + vsIdx];
      } else if (c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) {
        const unit = c.props.capacitanceUnit || 'µF';
        let mult = 1e-6;
        if (unit === 'mF') mult = 1e-3;
        if (unit === 'nF') mult = 1e-9;
        if (unit === 'pF') mult = 1e-12;
        const C = (c.props.capacitance || 10) * mult;
        const G = C / dt;
        const vPrev = c.simData.storedVoltage || 0;
        newCurrent = G * (newVoltage - vPrev);

        c.simData.storedVoltage = newVoltage;
        c.simData.voltage = Math.abs(newVoltage);
      } else if (c.type === ComponentType.Inductor) {
        const L = c.props.inductance || 100e-3;
        const Rs = 0.1;
        const safeDt = Math.max(1e-6, dt);
        const G_eq = 1 / (Rs + L / safeDt);
        const iPrev = c.simData.storedCurrent || 0;
        const I_eq = iPrev * (L / safeDt) * G_eq;

        newCurrent = G_eq * newVoltage + I_eq;
        c.simData.storedCurrent = newCurrent;
        c.simData.voltage = Math.abs(newVoltage);
      } else if (c.type === ComponentType.Diode || c.type === ComponentType.LED) {
        let V_fwd = c.type === ComponentType.LED ? Math.max(0.8, c.props.voltageDrop || 2.0) : 0.7;
        if (c.props.diodeType === 'schottky') V_fwd = 0.3;

        const V_zener = c.props.zenerVoltage || 5.6;
        const R_on = 0.1;
        const G_off = 1e-10;

        if (c.type === ComponentType.LED) {
          newCurrent = newVoltage > 0 ? linearizeLed(newVoltage, c).current : newVoltage * G_off;
        } else if (newVoltage > V_fwd) {
          newCurrent = (newVoltage - V_fwd) / R_on;
        } else if (c.props.diodeType === 'zener' && newVoltage < -V_zener) {
          newCurrent = (newVoltage + V_zener) / R_on;
        } else {
          newCurrent = newVoltage * G_off;
        }

        c.simData.resistance = Math.abs(newCurrent) > 1e-12 ? Math.abs(newVoltage / newCurrent) : 1 / G_off;
      } else if (c.type === ComponentType.Lamp) {
        newCurrent = newVoltage / 100;
      } else {
        const r = c.type === ComponentType.Resistor ? (c.props.resistance || 1000) : 1e-9;
        if (c.type === ComponentType.Switch || c.type === ComponentType.PushButton) {
          newCurrent = newVoltage / (c.props.closed ? R_CLOSED_SWITCH : R_OPEN_SWITCH);
        } else {
          newCurrent = newVoltage / Math.max(r, 1e-9);
        }
      }

      const alpha = 0.5;
      c.simData.current = c.simData.current * (1 - alpha) + newCurrent * alpha;

      if (c.type !== ComponentType.Capacitor && c.type !== ComponentType.PolarizedCapacitor && c.type !== ComponentType.Inductor) {
        c.simData.voltage = c.type === ComponentType.ACSource ? newVoltage : Math.abs(newVoltage);
        if (c.simData.voltage < 1e-6) c.simData.voltage = 0;
      }
      c.simData.power = c.simData.voltage * Math.abs(c.simData.current);

      const decay = 0.999;
      const rmsAlpha = 0.005;

      c.simData.vPk = Math.max(Math.abs(c.simData.voltage), (c.simData.vPk || 0) * decay);
      c.simData.iPk = Math.max(Math.abs(c.simData.current), (c.simData.iPk || 0) * decay);

      const vSq = c.simData.voltage * c.simData.voltage;
      c.simData._vSqSum = (c.simData._vSqSum || 0) * (1 - rmsAlpha) + vSq * rmsAlpha;
      c.simData.vRms = Math.sqrt(c.simData._vSqSum);

      const iSq = c.simData.current * c.simData.current;
      c.simData._iSqSum = (c.simData._iSqSum || 0) * (1 - rmsAlpha) + iSq * rmsAlpha;
      c.simData.iRms = Math.sqrt(c.simData._iSqSum);
    });

    wires.forEach(w => {
      const u = portToNet.get(`${w.compAId}_${w.portAIndex}`);
      const v = portToNet.get(`${w.compBId}_${w.portBIndex}`);
      if (u !== undefined && v !== undefined) {
        const newVoltage = Math.abs(sol[u] - sol[v]);
        const alpha = 0.2;
        w.simData.current = w.simData.current * (1 - alpha);
        w.simData.voltage = newVoltage;
        w.simData.power = Math.abs(w.simData.voltage * w.simData.current);
        w.simData.resistance = 0;
      }
    });

    return { ok: true };
  }
}
