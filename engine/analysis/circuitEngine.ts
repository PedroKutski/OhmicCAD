import { SparseMatrix } from '../core/matrixSparse';

const G_MIN = 1e-10;
const R_CLOSED_SWITCH = 0.001;
const R_OPEN_SWITCH = 1e13;
const MAX_ITERATIONS = 50;
const NEWTON_TOLERANCE = 1e-9;
const LED_OFF_G = 1e-12;
const LED_EMISSION_EPSILON = 1e-12;
const THERMAL_VOLTAGE_300K = 0.025851999786;

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
  maxVoltage: number;
  ifMax: number;
  failureMode: 'saturate' | 'burn_open';
  brightnessFactor: number;
  hasFailed: boolean;
  saturationCurrent: number;
  idealityFactor: number;
  internalSeriesResistance: number;
};

type LedLinearizedModel = LedModelParams & {
  G: number;
  I_eq: number;
  current: number;
  dynamicResistance: number;
  junctionVoltage: number;
};

const getLedModelParams = (c: EngineComponent): LedModelParams => {
  const configuredMaxVoltage = c.props.maxVoltage ?? c.props.voltageDrop;
  const maxVoltage = Math.max(1, configuredMaxVoltage ?? 4);
  const ifMax = Math.max(1e-9, c.props.currentRating ?? ((c.props.maxCurrentMa ?? 20) / 1000));
  const failureMode: 'saturate' | 'burn_open' = c.props.ledFailureMode === 'burn_open' ? 'burn_open' : 'saturate';
  const brightnessFactor = Math.max(0, c.props.ledBrightnessFactor ?? 1);
  const saturationCurrent = Math.max(1e-18, c.props.saturationCurrent ?? 2e-12);
  const idealityFactor = Math.min(4, Math.max(1, c.props.idealityFactor ?? 2));
  const internalSeriesResistance = Math.max(0, c.props.internalSeriesResistance ?? 2);

  return {
    maxVoltage,
    ifMax,
    failureMode,
    brightnessFactor,
    hasFailed: Boolean(c.simData.isFailed),
    saturationCurrent,
    idealityFactor,
    internalSeriesResistance,
  };
};

const solveLedCurrentFromVoltage = (vd: number, params: LedModelParams): number => {
  if (params.failureMode === 'burn_open' && params.hasFailed) return vd * LED_OFF_G;

  const Is = params.saturationCurrent;
  const nVt = params.idealityFactor * THERMAL_VOLTAGE_300K;
  const Rs = Math.max(1e-9, params.internalSeriesResistance);

  let current = Math.max(-0.95 * Is, vd / Math.max(10, Rs));

  for (let i = 0; i < 30; i++) {
    const onePlus = Math.max(1e-18, 1 + current / Is);
    const f = nVt * Math.log(onePlus) + (current * Rs) - vd;
    const df = (nVt / (Is * onePlus)) + Rs;
    const delta = f / Math.max(1e-15, df);
    current -= delta;
    const minCurrent = -0.999999 * Is;
    if (current < minCurrent) current = minCurrent;
    if (Math.abs(delta) < 1e-12) break;
  }

  return current;
};

const linearizeLed = (vd: number, c: EngineComponent): LedLinearizedModel => {
  const params = getLedModelParams(c);

  if (params.failureMode === 'burn_open' && params.hasFailed) {
    return { G: LED_OFF_G, I_eq: 0, current: vd * LED_OFF_G, dynamicResistance: 1 / LED_OFF_G, junctionVoltage: 0, ...params };
  }

  const current = solveLedCurrentFromVoltage(vd, params);
  const Is = params.saturationCurrent;
  const nVt = params.idealityFactor * THERMAL_VOLTAGE_300K;
  const expArg = Math.log(Math.max(1e-18, 1 + current / Is));
  const junctionVoltage = nVt * expArg;
  const junctionDynamicResistance = nVt / Math.max(current + Is, 1e-18);
  const dynamicResistance = Math.max(1e-9, params.internalSeriesResistance + junctionDynamicResistance);
  const G = 1 / dynamicResistance;
  const I_eq = current - (G * vd);

  return { G, I_eq, current, dynamicResistance, junctionVoltage, ...params };
};

const buildPortToNetMap = (components: EngineComponent[], wires: EngineWire[]): Map<string, number> => {
  const allPorts: string[] = [];
  components.forEach(c => {
    allPorts.push(`${c.id}_0`);
    if (c.type !== 'junction' && c.type !== 'gnd' && c.type !== 'vcc') allPorts.push(`${c.id}_1`);
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


const ledHasDedicatedSeriesResistor = (
  led: EngineComponent,
  components: EngineComponent[],
  portToNet: Map<string, number>,
): boolean => {
  const terminalNets = [
    portToNet.get(`${led.id}_0`),
    portToNet.get(`${led.id}_1`),
  ].filter((v): v is number => v !== undefined);

  for (const net of terminalNets) {
    const attached = components
      .filter(c => c.type !== 'junction' && (portToNet.get(`${c.id}_0`) === net || (c.type !== 'gnd' && c.type !== 'vcc' && portToNet.get(`${c.id}_1`) === net)))
      .map(c => c.type);

    const resistorCount = attached.filter(t => t === 'resistor').length;
    const ledCount = attached.filter(t => t === 'led').length;
    const foreignCount = attached.filter(t => t !== 'resistor' && t !== 'led').length;

    if (resistorCount === 1 && ledCount === 1 && foreignCount === 0) {
      return true;
    }
  }

  return false;
};

export const solveCircuit = (components: EngineComponent[], wires: EngineWire[], dt = 0.1, simTime = 0): EngineSolveResult => {
  const portToNet = buildPortToNetMap(components, wires);
  const netCount = new Set(portToNet.values()).size;

  const ledWithoutPhysicalSeriesResistor = components.find(c => c.type === 'led' && !ledHasDedicatedSeriesResistor(c, components, portToNet));
  if (ledWithoutPhysicalSeriesResistor) {
    return {
      ok: false,
      error: `LED ${ledWithoutPhysicalSeriesResistor.props.name || ledWithoutPhysicalSeriesResistor.id} deve ter resistor físico em série (componente resistor dedicado no ramo).`,
    };
  }
  const gndComponents = components.filter(c => c.type === 'gnd');
  const vccComponents = components.filter(c => c.type === 'vcc');

  const getSupplyKey = (c: EngineComponent) => {
    const name = String(c.props.name || '').trim().toUpperCase();
    return name.match(/(\d+)$/)?.[1] || '';
  };

  const gndByKey = new Map<string, EngineComponent[]>();
  gndComponents.forEach(gnd => {
    const key = getSupplyKey(gnd);
    const bucket = gndByKey.get(key) || [];
    bucket.push(gnd);
    gndByKey.set(key, bucket);
  });

  const gndUsage = new Map<string, number>();
  const vccGndPairs = vccComponents
    .map(vcc => {
      const key = getSupplyKey(vcc);
      const sameKeyCandidates = gndByKey.get(key) || [];
      const candidates = sameKeyCandidates.length > 0 ? sameKeyCandidates : gndComponents;
      if (candidates.length === 0) return null;

      let selected = candidates[0];
      let selectedUsage = gndUsage.get(selected.id) || 0;
      for (let i = 1; i < candidates.length; i++) {
        const usage = gndUsage.get(candidates[i].id) || 0;
        if (usage < selectedUsage) {
          selected = candidates[i];
          selectedUsage = usage;
        }
      }

      gndUsage.set(selected.id, selectedUsage + 1);
      return { vccId: vcc.id, gndId: selected.id, voltage: vcc.props.voltage || 5 };
    })
    .filter((pair): pair is { vccId: string; gndId: string; voltage: number } => pair !== null);

  const voltageSources = [
    ...components.filter(c => c.type === 'battery' || c.type === 'ac_source'),
    ...vccGndPairs.map(pair => ({
      id: `vcc_gnd_pair_${pair.vccId}_${pair.gndId}`,
      type: 'vcc_pair',
      props: { voltage: pair.voltage },
      simData: { voltage: 0, current: 0, power: 0 } as EngineSimData,
    })),
  ];
  const preferredGround = components.find(c => c.type === 'gnd');
  const groundNet = preferredGround ? (portToNet.get(`${preferredGround.id}_0`) ?? 0) : 0;

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
      if (c.type === 'junction' || c.type === 'gnd') return;
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
        let V_fwd = 0.7;
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

    vccGndPairs.forEach(pair => {
      const u = portToNet.get(`${pair.vccId}_0`);
      const v = portToNet.get(`${pair.gndId}_0`);
      if (u === undefined || v === undefined) return;
      const sourceId = `vcc_gnd_pair_${pair.vccId}_${pair.gndId}`;
      const vsIdx = voltageSources.findIndex(src => src.id === sourceId);
      if (vsIdx < 0) return;
      stampVoltageSource(u, v, pair.voltage, netCount + vsIdx, 0.05);
    });

    for (let i = 0; i < netCount; i++) A.add(i, i, G_MIN);
    for (let j = 0; j < size; j++) {
      if (j !== groundNet) {
        A.set(groundNet, j, 0);
        A.set(j, groundNet, 0);
      }
    }
    A.set(groundNet, groundNet, 1);
    B[groundNet] = 0;

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
  const pairByVcc = new Map(vccGndPairs.map(pair => [pair.vccId, pair]));
  const pairByGnd = new Map(vccGndPairs.map(pair => [pair.gndId, pair]));
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

    if (c.type === 'gnd') {
      const pair = pairByGnd.get(c.id);
      if (!pair) {
        componentStates[c.id] = { voltage: 0, current: 0, power: 0 };
        return;
      }

      const sourceId = `vcc_gnd_pair_${pair.vccId}_${pair.gndId}`;
      const vsIdx = voltageSources.findIndex(src => src.id === sourceId);
      if (vsIdx < 0) {
        componentStates[c.id] = { voltage: 0, current: 0, power: 0 };
        return;
      }

      const vccNet = portToNet.get(`${pair.vccId}_0`) ?? 0;
      const gndNet = portToNet.get(`${pair.gndId}_0`) ?? 0;
      const voltage = sol[vccNet] - sol[gndNet];
      const current = -sol[netCount + vsIdx];
      componentStates[c.id] = { voltage, current, power: Math.abs(voltage * current) };
      return;
    }

    const u = portToNet.get(`${c.id}_0`) ?? 0;
    const v = portToNet.get(`${c.id}_1`);
    const newVoltage = v === undefined ? 0 : sol[u] - sol[v];
    let newCurrent = 0;
    const nextState: Partial<EngineSimData> = {};

    if (c.type === 'battery' || c.type === 'ac_source') {
      const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
      newCurrent = -sol[netCount + vsIdx];
    } else if (c.type === 'vcc') {
      const pair = pairByVcc.get(c.id);
      if (pair) {
        const sourceId = `vcc_gnd_pair_${pair.vccId}_${pair.gndId}`;
        const vsIdx = voltageSources.findIndex(src => src.id === sourceId);
        if (vsIdx >= 0) {
          newCurrent = -sol[netCount + vsIdx];
          const gndNet = portToNet.get(`${pair.gndId}_0`) ?? 0;
          const supplyVoltage = Math.abs(sol[u] - sol[gndNet]);
          nextState.voltage = supplyVoltage < 1e-6 ? 0 : supplyVoltage;
        }
      }
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
      let V_fwd = 0.7;
      if (c.props.diodeType === 'schottky') V_fwd = 0.3;

      const V_zener = c.props.zenerVoltage || 5.6;
      const R_on = 0.1;
      const G_off = LED_OFF_G;
      let ledModel: ReturnType<typeof linearizeLed> | null = null;

      if (c.type === 'led') {
        ledModel = linearizeLed(newVoltage, c);
        newCurrent = ledModel.current;

        const overVoltage = newVoltage > ledModel.maxVoltage;
        const overCurrent = newCurrent > ledModel.ifMax;
        const hasFailed = c.simData.isFailed || overVoltage || (ledModel.failureMode === 'burn_open' && overCurrent);
        nextState.isFailed = Boolean(hasFailed);

        const usefulForwardCurrent = Math.max(0, newCurrent - LED_EMISSION_EPSILON);
        const normalized = Math.min(1, usefulForwardCurrent / Math.max(ledModel.ifMax, 1e-12));
        nextState.brightness = hasFailed ? 0 : Math.max(0, normalized * ledModel.brightnessFactor);
      } else if (newVoltage > V_fwd) {
        newCurrent = (newVoltage - V_fwd) / R_on;
      } else if (c.props.diodeType === 'zener' && newVoltage < -V_zener) {
        newCurrent = (newVoltage + V_zener) / R_on;
      } else {
        newCurrent = newVoltage * G_off;
      }

      if (c.type === 'led' && ledModel) {
        const ledOffResistance = 1 / LED_OFF_G;
        nextState.resistance = newCurrent > 1e-12 ? Math.abs(newVoltage / newCurrent) : ledOffResistance;
      } else {
        nextState.resistance = Math.abs(newCurrent) > 1e-12 ? Math.abs(newVoltage / newCurrent) : 1 / G_off;
      }
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

    if (c.type !== 'capacitor' && c.type !== 'capacitor_pol' && c.type !== 'inductor' && c.type !== 'vcc') {
      let voltage = c.type === 'ac_source' ? newVoltage : Math.abs(newVoltage);
      if (c.type === 'led') {
        // Exibe sempre a tensão realmente calculada no LED (não fixa em Vf),
        // para refletir o valor que chega ao componente dentro do circuito desenhado.
        voltage = Math.max(0, voltage);
      }
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
