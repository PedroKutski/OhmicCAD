import { ComponentModel, WireModel } from '../types';
import { EngineComponent, EngineWire, solveCircuit } from '../engine/analysis/circuitEngine';

const toEngineComponents = (components: ComponentModel[]): EngineComponent[] => components.map(component => ({
  id: component.id,
  type: component.type,
  props: component.props,
  simData: {
    voltage: component.simData.voltage,
    current: component.simData.current,
    power: component.simData.power,
    resistance: component.simData.resistance,
    storedVoltage: component.simData.storedVoltage,
    storedCurrent: component.simData.storedCurrent,
    vPk: component.simData.vPk,
    vRms: component.simData.vRms,
    iPk: component.simData.iPk,
    iRms: component.simData.iRms,
    _vSqSum: component.simData._vSqSum,
    _iSqSum: component.simData._iSqSum,
  },
}));

const toEngineWires = (wires: WireModel[]): EngineWire[] => wires.map(wire => ({
  id: wire.id,
  compAId: wire.compAId,
  portAIndex: wire.portAIndex,
  compBId: wire.compBId,
  portBIndex: wire.portBIndex,
  simData: {
    voltage: wire.simData.voltage,
    current: wire.simData.current,
    power: wire.simData.power,
    resistance: wire.simData.resistance,
  },
}));

export class CircuitSolver {
  static solve(components: ComponentModel[], wires: WireModel[], dt = 0.1, simTime = 0): { ok: boolean; error?: string } {
    const result = solveCircuit(toEngineComponents(components), toEngineWires(wires), dt, simTime);
    if (!result.ok) return { ok: false, error: result.error };

    components.forEach(component => {
      const nextState = result.componentStates?.[component.id];
      if (!nextState) return;
      Object.assign(component.simData, nextState);
    });

    wires.forEach(wire => {
      const nextState = result.wireStates?.[wire.id];
      if (!nextState) return;
      Object.assign(wire.simData, nextState);
    });

    return { ok: true };
  }
}
