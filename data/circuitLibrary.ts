import { ComponentModel, WireModel } from '../types';

export interface CircuitData {
    components: ComponentModel[];
    wires: WireModel[];
}

export interface CircuitItem {
    name: string;
    id: string;
    data?: () => CircuitData;
}

export interface CircuitCategory {
    name: string;
    items: (CircuitItem | CircuitCategory)[];
}

export const CIRCUIT_LIBRARY: CircuitCategory[] = [];
