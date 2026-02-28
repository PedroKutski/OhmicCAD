
export enum ComponentType {
  Battery = 'battery',
  Switch = 'switch',
  PushButton = 'pushbutton',
  Resistor = 'resistor',
  Capacitor = 'capacitor',
  PolarizedCapacitor = 'capacitor_pol',
  Inductor = 'inductor',
  ACSource = 'ac_source',
  Diode = 'diode',
  LED = 'led',
  Lamp = 'lamp',
  Junction = 'junction',
}

export interface SimData {
  voltage: number;
  current: number;
  power: number;
  resistance?: number;
  eField: number;
  bField: number;
  driftV: number;
  flowDir: number;
  storedVoltage?: number; // For capacitors
  storedCurrent?: number; // For inductors
  // AC Analysis Data
  vPk?: number;
  vRms?: number;
  iPk?: number;
  iRms?: number;
  // Internal state for RMS/Peak calculation
  _vSqSum?: number;
  _iSqSum?: number;
  _samples?: number;
  _lastZeroCrossing?: number;
}

export interface ComponentProps {
  name: string;
  voltage?: number;
  capacity?: number;
  currentRating?: number; 
  voltageDrop?: number; // Forward voltage drop for diodes
  zenerVoltage?: number; // Breakdown voltage for Zener
  diodeType?: 'rectifier' | 'zener' | 'schottky';
  beta?: number; // For BJT
  thresholdVoltage?: number; // For MOSFET
  transconductance?: number; // For MOSFET
  color?: string; // For LED/Lamp
  power?: number;
  resistance?: number;
  capacitance?: number;
  capacitanceUnit?: string; // 'mF', 'µF', 'nF', 'pF'
  inductance?: number; // For Inductor (Henry)
  frequency?: number; // For AC Source (Hz)
  amplitude?: number; // For AC Source (V)
  closed?: boolean;
  tolerance?: number;
  maxCurrent?: number; 
}

export interface Port {
  id: number;
  x: number;
  y: number;
  parentId: string;
}

export interface ComponentModel {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: number; // 0, 1, 2, 3 (multiples of 90 deg)
  state: boolean;
  props: ComponentProps;
  simData: SimData;
}

export interface WireModel {
  id: string;
  compAId: string;
  portAIndex: number;
  compBId: string;
  portBIndex: number;
  anchor: { x: number; y: number } | null;
  path: { x: number; y: number }[];
  selected: boolean;
  simData: SimData;
  props: {
    name: string;
  };
}

export interface ViewState {
  x: number;
  y: number;
  scale: number;
}

export interface AppSettings {
  showGrid: boolean;
  showLabels: boolean;
  showCurrent: boolean;
  timeStepMultiplier: number; 
  visualFlowSpeed: number; 
}

export const GRID_SIZE = 20; 
export const GRID_STEP = 10; 

export const THEME = {
  bg: '#1a1a1a',
  gridMajor: 'rgba(255,255,255,0.05)', 
  gridMinor: 'rgba(255,255,255,0.02)', 
  accent: '#ff9d00',
  selected: '#00e5ff',
  wire: '#ffb74d',
  wireSelected: '#00e5ff',
  componentStroke: '#ffffff',
  componentFill: '#1a1a1a',
  text: '#aaaaaa'
};

