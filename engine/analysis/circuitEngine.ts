import { SparseMatrix } from '../core/matrixSparse';

const G_MIN = 1e-10;
const R_CLOSED_SWITCH = 0.001;
const R_OPEN_SWITCH = 1e13;
const MAX_ITERATIONS = 50;
const NEWTON_TOLERANCE = 1e-9;
const LED_OFF_G = 1e-12;
const LED_EMISSION_EPSILON = 1e-12;

export interface EngineSimData {
  voltage: number;
  current: number;
  power: number;
  brightness?: number;
  isFailed?: boolean;
  resistance?: number;
  storedVoltage?: number;
  storedCurrent?: number;
  vPk?: number;
  vRms?: number;
  iPk?: number;
  iRms?: number;
  _vSqSum?: number;
  _iSqSum?: number;
}

export interface EngineComponent {
  id: string;
  type: string;
  props: Record<string, any>;
  simData: EngineSimData;
}

export interface EngineWire {
  id: string;
  compAId: string;
  portAIndex: number;
  compBId: string;
  portBIndex: number;
  simData: EngineSimData;
}

export interface EngineSolveResult {
  ok: boolean;
  error?: string;
  componentStates?: Record<string, Partial<EngineSimData>>;
  wireStates?: Record<string, Partial<EngineSimData>>;
}

type LedModelParams = {
  vf: number;
  ifMax: number;
  failureMode: 'saturate' | 'burn_open';
  brightnessFactor: number;
  hasFailed: boolean;
  is: number;
  nVt: number;
};

const getLedModelParams = (c: EngineComponent): LedModelParams => {
  const vf = Math.max(0.8, c.props.voltageDrop ?? 1.73);
  const ifMax = Math.max(1e-9, c.props.currentRating ?? ((c.props.maxCurrentMa ?? 20) / 1000));
  const failureMode: 'saturate' | 'burn_open' = c.props.ledFailureMode === 'burn_open' ? 'burn_open' : 'saturate';
  const brightnessFactor = Math.max(0, c.props.ledBrightnessFactor ?? 1);
  const nominalForwardCurrent = Math.max(1e-9, c.props.currentRating ?? ifMax);
  const nVt = 0.052;
  const rawIs = c.props.saturationCurrent ?? (nominalForwardCurrent / Math.max(Math.exp(vf / nVt) - 1, 1e-9));
  const is = Math.max(1e-18, rawIs);

  // LED modelado com Shockley: I = Is*(exp(Vd/(nVt)) - 1).
  // Isso faz a tensão e a corrente do LED surgirem do circuito desenhado.

  return {
    vf,
    ifMax,
    failureMode,
    brightnessFactor,
    hasFailed: Boolean(c.simData.isFailed),
    is,
    nVt,
  };
};

const linearizeLed = (vd: number, c: EngineComponent) => {
  const params = getLedModelParams(c);

  if (params.failureMode === 'burn_open' && params.hasFailed) {
    return { G: LED_OFF_G, I_eq: 0, current: vd * LED_OFF_G, ...params };
  }

  const clampedExpArg = Math.max(-50, Math.min(40, vd / params.nVt));
  const expV = Math.exp(clampedExpArg);
  const current = params.is * (expV - 1);
  const G = Math.max(LED_OFF_G, (params.is / params.nVt) * expV);
  const I_eq = current - G * vd;

  return { G, I_eq, current, ...params };
};

const buildPortToNetMap = (components: EngineComponent[], wires: EngineWire[]): Map<string, number> => {
  const allPorts: string[] = [];
  components.forEach(c => {
    allPorts.push(`${c.id}_0`);
    if (c.type !== 'junction') allPorts.push(`${c.id}_1`);
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
};

export const solveCircuit = (components: EngineComponent[], wires: EngineWire[], dt = 0.1, simTime = 0): EngineSolveResult => {
  const voltageSources = components.filter(c => c.type === 'battery' || c.type === 'ac_source');
  const portToNet = buildPortToNetMap(components, wires);
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

    const stampVoltageSource = (u: number, v: number, voltage: number, idx: number, Rs = 0) => {
      if (u !== v) {
        A.add(idx, u, 1); A.add(idx, v, -1);
        A.add(u, idx, 1); A.add(v, idx, -1);
      }
      A.add(idx, idx, -Rs);
      B[idx] = voltage;
    };

    components.forEach(c => {
      if (c.type === 'junction') return;
      const u = portToNet.get(`${c.id}_0`)!;
      const v = portToNet.get(`${c.id}_1`)!;

      if (c.type === 'resistor') {
        stampR(u, v, Math.max(1e-6, c.props.resistance || 1000));
      } else if (c.type === 'switch' || c.type === 'pushbutton') {
        stampR(u, v, c.props.closed ? R_CLOSED_SWITCH : R_OPEN_SWITCH);
      } else if (c.type === 'capacitor' || c.type === 'capacitor_pol') {
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
      } else if (c.type === 'diode' || c.type === 'led') {
        let V_fwd = c.type === 'led' ? Math.max(0.8, c.props.voltageDrop ?? 1.73) : 0.7;
        if (c.props.diodeType === 'schottky') V_fwd = 0.3;

        const V_zener = c.props.zenerVoltage || 5.6;
        const R_on = 0.1;
        const G_off = LED_OFF_G;
        const Vd = iter > 0 ? (sol[u] - sol[v]) : 0;

        if (c.type === 'led') {
          const led = linearizeLed(Vd, c);
          stampG(u, v, led.G);
          B[u] -= led.I_eq; B[v] += led.I_eq;
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
      } else if (c.type === 'lamp') {
        stampR(u, v, 100);
      } else if (c.type === 'inductor') {
        const L = c.props.inductance || 100e-3;
        const Rs = 0.1;
        const safeDt = Math.max(1e-6, dt);
        const G_eq = 1 / (Rs + L / safeDt);
        const iPrev = c.simData.storedCurrent || 0;
        const I_eq = iPrev * (L / safeDt) * G_eq;

        stampG(u, v, G_eq);
        B[u] -= I_eq;
        B[v] += I_eq;
      } else if (c.type === 'battery') {
        const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
        stampVoltageSource(v, u, c.props.voltage || 9, netCount + vsIdx, 0.1);
      } else if (c.type === 'ac_source') {
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
      return { ok: false, error: 'Falha na simulação: solução numérica inválida (NaN).' };
    }

    const maxDelta = sol.reduce((m, value, i) => Math.max(m, Math.abs(value - previousSol[i])), 0);
    if (maxDelta < NEWTON_TOLERANCE) break;
  }

  const componentStates: Record<string, Partial<EngineSimData>> = {};
  const portCurrents = new Map<string, number>();
  const portWireDegree = new Map<string, number>();

  wires.forEach(w => {
    const portA = `${w.compAId}_${w.portAIndex}`;
    const portB = `${w.compBId}_${w.portBIndex}`;
    portWireDegree.set(portA, (portWireDegree.get(portA) || 0) + 1);
    portWireDegree.set(portB, (portWireDegree.get(portB) || 0) + 1);
  });

  components.forEach(c => {
    if (c.type === 'junction') return;
    const u = portToNet.get(`${c.id}_0`)!;
    const v = portToNet.get(`${c.id}_1`)!;

    const newVoltage = sol[u] - sol[v];
    let newCurrent = 0;
    const nextState: Partial<EngineSimData> = {};

    if (c.type === 'battery' || c.type === 'ac_source') {
      const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
      newCurrent = -sol[netCount + vsIdx];
    } else if (c.type === 'capacitor' || c.type === 'capacitor_pol') {
      const unit = c.props.capacitanceUnit || 'µF';
      let mult = 1e-6;
      if (unit === 'mF') mult = 1e-3;
      if (unit === 'nF') mult = 1e-9;
      if (unit === 'pF') mult = 1e-12;
      const C = (c.props.capacitance || 10) * mult;
      const G = C / dt;
      const vPrev = c.simData.storedVoltage || 0;
      newCurrent = G * (newVoltage - vPrev);
      nextState.storedVoltage = newVoltage;
      nextState.voltage = Math.abs(newVoltage);
    } else if (c.type === 'inductor') {
      const L = c.props.inductance || 100e-3;
      const Rs = 0.1;
      const safeDt = Math.max(1e-6, dt);
      const G_eq = 1 / (Rs + L / safeDt);
      const iPrev = c.simData.storedCurrent || 0;
      const I_eq = iPrev * (L / safeDt) * G_eq;

      newCurrent = G_eq * newVoltage + I_eq;
      nextState.storedCurrent = newCurrent;
      nextState.voltage = Math.abs(newVoltage);
    } else if (c.type === 'diode' || c.type === 'led') {
      let V_fwd = c.type === 'led' ? Math.max(0.8, c.props.voltageDrop ?? 1.73) : 0.7;
      if (c.props.diodeType === 'schottky') V_fwd = 0.3;

      const V_zener = c.props.zenerVoltage || 5.6;
      const R_on = 0.1;
      const G_off = LED_OFF_G;

      if (c.type === 'led') {
        const led = linearizeLed(newVoltage, c);
        newCurrent = led.current;

        const hasFailed = led.failureMode === 'burn_open' && (c.simData.isFailed || Math.abs(newCurrent) > led.ifMax);
        nextState.isFailed = Boolean(hasFailed);
        const luminousCurrent = Math.max(0, Math.abs(newCurrent) - LED_EMISSION_EPSILON);
        const normalized = Math.min(1, luminousCurrent / led.ifMax);
        nextState.brightness = hasFailed ? 0 : Math.max(0, normalized * led.brightnessFactor);
      } else if (newVoltage > V_fwd) {
        newCurrent = (newVoltage - V_fwd) / R_on;
      } else if (c.props.diodeType === 'zener' && newVoltage < -V_zener) {
        newCurrent = (newVoltage + V_zener) / R_on;
      } else {
        newCurrent = newVoltage * G_off;
      }

      nextState.resistance = Math.abs(newCurrent) > 1e-12 ? Math.abs(newVoltage / newCurrent) : 1 / G_off;
    } else if (c.type === 'lamp') {
      newCurrent = newVoltage / 100;
    } else {
      const r = c.type === 'resistor' ? (c.props.resistance || 1000) : 1e-9;
      if (c.type === 'switch' || c.type === 'pushbutton') {
        newCurrent = newVoltage / (c.props.closed ? R_CLOSED_SWITCH : R_OPEN_SWITCH);
      } else {
        newCurrent = newVoltage / Math.max(r, 1e-9);
      }
    }

    const alpha = 0.5;
    const smoothedCurrent = c.simData.current * (1 - alpha) + newCurrent * alpha;
    nextState.current = smoothedCurrent;

    if (c.type !== 'capacitor' && c.type !== 'capacitor_pol' && c.type !== 'inductor') {
      let voltage = c.type === 'ac_source' ? newVoltage : Math.abs(newVoltage);
      if (voltage < 1e-6) voltage = 0;
      nextState.voltage = voltage;
    }

    const voltageForPower = nextState.voltage ?? c.simData.voltage ?? 0;
    nextState.power = voltageForPower * Math.abs(smoothedCurrent);

    if (c.type !== 'led') {
      nextState.brightness = c.simData.brightness ?? 0;
      nextState.isFailed = c.simData.isFailed ?? false;
    }

    const decay = 0.999;
    const rmsAlpha = 0.005;

    nextState.vPk = Math.max(Math.abs(voltageForPower), (c.simData.vPk || 0) * decay);
    nextState.iPk = Math.max(Math.abs(smoothedCurrent), (c.simData.iPk || 0) * decay);

    const vSq = voltageForPower * voltageForPower;
    nextState._vSqSum = (c.simData._vSqSum || 0) * (1 - rmsAlpha) + vSq * rmsAlpha;
    nextState.vRms = Math.sqrt(nextState._vSqSum);

    const iSq = smoothedCurrent * smoothedCurrent;
    nextState._iSqSum = (c.simData._iSqSum || 0) * (1 - rmsAlpha) + iSq * rmsAlpha;
    nextState.iRms = Math.sqrt(nextState._iSqSum);

    componentStates[c.id] = nextState;

    const smoothedCurrentValue = nextState.current ?? 0;
    const port0 = `${c.id}_0`;
    const port1 = `${c.id}_1`;

    // Positive component current is defined from port 0 -> port 1.
    // Track current leaving each port to estimate ideal-wire current display.
    portCurrents.set(port0, (portCurrents.get(port0) || 0) - smoothedCurrentValue);
    if (c.type !== 'junction') {
      portCurrents.set(port1, (portCurrents.get(port1) || 0) + smoothedCurrentValue);
    }
  });

  const wireStates: Record<string, Partial<EngineSimData>> = {};
  wires.forEach(w => {
    const u = portToNet.get(`${w.compAId}_${w.portAIndex}`);
    const v = portToNet.get(`${w.compBId}_${w.portBIndex}`);
    if (u === undefined || v === undefined) return;

    const alpha = 0.4;
    const wireVoltage = Math.abs(sol[u] - sol[v]);
    const portA = `${w.compAId}_${w.portAIndex}`;
    const portB = `${w.compBId}_${w.portBIndex}`;
    const degreeA = Math.max(1, portWireDegree.get(portA) || 1);
    const degreeB = Math.max(1, portWireDegree.get(portB) || 1);
    const estimateFromA = (portCurrents.get(portA) || 0) / degreeA;
    const estimateFromB = -(portCurrents.get(portB) || 0) / degreeB;
    const estimatedWireCurrent = (estimateFromA + estimateFromB) / 2;
    const wireCurrent = w.simData.current * (1 - alpha) + estimatedWireCurrent * alpha;

    wireStates[w.id] = {
      voltage: wireVoltage,
      current: wireCurrent,
      power: Math.abs(wireVoltage * wireCurrent),
      resistance: 0,
    };
  });

  return { ok: true, componentStates, wireStates };
};
