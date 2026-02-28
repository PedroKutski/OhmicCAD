
import { ComponentModel, WireModel, ComponentType } from '../types';

const G_MIN = 1e-12; 
const R_CLOSED_SWITCH = 0.001; 
const R_OPEN_SWITCH = 1e12; 
const R_CAPACITOR_DC = 1e12; 
const MAX_ITERATIONS = 50; 

export class CircuitSolver {
  static solve(components: ComponentModel[], wires: WireModel[], dt: number = 0.1, simTime: number = 0) {
    const voltageSources: ComponentModel[] = components.filter(c => c.type === ComponentType.Battery || c.type === ComponentType.ACSource);
    // Capacitors and Inductors are now modeled with companion models (Resistor + Current Source), so they don't add rows to the matrix like voltage sources do.
    
    const allPorts = new Set<string>();
    components.forEach(c => { 
        allPorts.add(`${c.id}_0`); 
        if (c.type !== ComponentType.Junction) allPorts.add(`${c.id}_1`); 
    });
    const pList = Array.from(allPorts);
    const pMap = new Map<string, number>();
    pList.forEach((p, i) => pMap.set(p, i));
    
    // Matrix size: nodes + voltage sources
    const size = pList.length + voltageSources.length;
    let sol = new Array(size).fill(0);

    // Iterative Newton-Raphson Solver (though linear components only need 1 iteration)
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const A = Array(size).fill(0).map(() => Array(size).fill(0));
        const B = Array(size).fill(0);
        
        const stampR = (u: number, v: number, r: number) => {
            const g = 1/Math.max(1e-14, r);
            A[u][u] += g; A[v][v] += g;
            A[u][v] -= g; A[v][u] -= g;
        };

        const stampG = (u: number, v: number, g: number) => {
            A[u][u] += g; A[v][v] += g;
            A[u][v] -= g; A[v][u] -= g;
        };

        const stampCurrentSource = (u: number, v: number, i: number) => {
            // Current entering u, leaving v
            B[u] += i;
            B[v] -= i;
        };

        const stampVoltageSource = (u: number, v: number, voltage: number, idx: number) => {
            A[idx][u] = 1; A[idx][v] = -1; B[idx] = voltage;
            A[u][idx] = 1; A[v][idx] = -1;
        };
        
        wires.forEach(w => {
            const u = pMap.get(`${w.compAId}_${w.portAIndex}`);
            const v = pMap.get(`${w.compBId}_${w.portBIndex}`);
            if (u !== undefined && v !== undefined) {
                const R_Ideal = 1e-4;
                stampR(u, v, R_Ideal);
                w.simData.resistance = R_Ideal;
            }
        });
        
        components.forEach(c => {
            if (c.type === ComponentType.Junction) return;
            const u = pMap.get(`${c.id}_0`)!; 
            const v = pMap.get(`${c.id}_1`)!; 
            
            if (c.type === ComponentType.Resistor) {
                stampR(u, v, c.props.resistance || 1000);
            } else if (c.type === ComponentType.Switch || c.type === ComponentType.PushButton) {
                stampR(u, v, c.props.closed ? R_CLOSED_SWITCH : R_OPEN_SWITCH);
            } else if (c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) {
                // Companion Model (Backward Euler)
                // i(n) = C * (v(n) - v(n-1)) / dt
                // i(n) = (C/dt)*v(n) - (C/dt)*v(n-1)
                // Modeled as Conductance G = C/dt in parallel with Current Source I = -(C/dt)*v(n-1)
                // Current source direction: I flows from node 1 to node 0 (if v defined as v1-v0)
                // Actually simpler:
                // I_branch = G*V_branch + I_eq
                // I_eq = -G * V_prev
                // V_prev is storedVoltage from previous step.
                
                const unit = c.props.capacitanceUnit || 'µF';
                let mult = 1e-6;
                if (unit === 'mF') mult = 1e-3;
                if (unit === 'nF') mult = 1e-9;
                if (unit === 'pF') mult = 1e-12;
                const C = (c.props.capacitance || 10) * mult;
                const G = C / dt;
                const vPrev = c.simData.storedVoltage || 0;
                const I_eq = -G * vPrev; // Current source value
                
                stampG(u, v, G);
                
                // Add Leakage Resistance (e.g., 100M Ohm)
                // This ensures that if the capacitor is disconnected, it slowly discharges or stabilizes to 0 if floating.
                const G_leak = 1e-12; // 1 TOhm
                stampG(u, v, G_leak);

                // Current source I_eq is in parallel with G.
                // Total current leaving u = G*(Vu - Vv) + I_eq
                // So in KCL at u: ... + G(Vu - Vv) + I_eq = 0
                // G terms are handled by stampG.
                // I_eq term: move to RHS -> B[u] -= I_eq
                // KCL at v: ... + G(Vv - Vu) - I_eq = 0 -> B[v] += I_eq
                
                B[u] -= I_eq;
                B[v] += I_eq;

            } else if (c.type === ComponentType.Diode || c.type === ComponentType.LED) {
                // Diode Model (Piecewise Linear with Iteration)
                const u = pMap.get(`${c.id}_0`)!; 
                const v = pMap.get(`${c.id}_1`)!; 
                
                let V_fwd = 0.7;
                if (c.props.diodeType === 'schottky') V_fwd = 0.3;
                if (c.type === ComponentType.LED) V_fwd = c.props.voltageDrop || 2.0;
                
                const V_zener = c.props.zenerVoltage || 5.6;
                const R_on = 0.1;
                const G_off = 1e-12;

                // Get voltage from previous iteration (or 0 if first iter)
                // Note: sol is updated at the end of the loop, so for iter > 0, sol contains prev iter results
                let Vd = 0;
                if (iter > 0) Vd = sol[u] - sol[v];
                
                if (Vd > V_fwd) {
                    // Forward Conducting
                    // I = (Vd - V_fwd) / R_on = Vd/R_on - V_fwd/R_on
                    // G = 1/R_on, I_eq = -V_fwd/R_on
                    const G = 1/R_on;
                    const I_eq = -V_fwd/R_on;
                    stampG(u, v, G);
                    B[u] -= I_eq; B[v] += I_eq;
                } else if (c.props.diodeType === 'zener' && Vd < -V_zener) {
                    // Zener Breakdown
                    // I = (Vd - (-V_zener)) / R_on = (Vd + V_zener)/R_on
                    // G = 1/R_on, I_eq = V_zener/R_on
                    const G = 1/R_on;
                    const I_eq = V_zener/R_on;
                    stampG(u, v, G);
                    B[u] -= I_eq; B[v] += I_eq;
                } else {
                    // Blocking
                    stampG(u, v, G_off);
                }

            } else if (c.type === ComponentType.Lamp) {
                // Lamp modeled as resistor (constant for now, could be temp-dependent)
                const R_lamp = 100; 
                stampR(u, v, R_lamp);

            } else if (c.type === ComponentType.Inductor) {
                // Companion Model with Series Resistance (ESR)
                const L = c.props.inductance || 100e-3;
                const Rs = 0.1; // 100 mOhm ESR - more realistic and prevents kA currents
                const safeDt = Math.max(1e-6, dt);
                const G_eq = 1 / (Rs + L/safeDt);
                const iPrev = c.simData.storedCurrent || 0; 
                const I_eq = iPrev * (L/safeDt) * G_eq;
                
                stampG(u, v, G_eq);
                
                B[u] -= I_eq;
                B[v] += I_eq;

            } else if (c.type === ComponentType.Battery) {
                const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
                const idx = pList.length + vsIdx;
                stampVoltageSource(v, u, c.props.voltage || 9, idx);
            } else if (c.type === ComponentType.ACSource) {
                const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
                const idx = pList.length + vsIdx;
                const amp = c.props.amplitude || 10;
                const freq = c.props.frequency || 60;
                const val = amp * Math.sin(2 * Math.PI * freq * simTime);
                stampVoltageSource(v, u, val, idx);
            }
        });
        
        // Ground reference
        for(let i=0; i<pList.length; i++) A[i][i] += G_MIN;
        A[0].fill(0); A[0][0] = 1; B[0] = 0;
        
        sol = CircuitSolver.solveLinearMatrix(A, B);
        if (sol.some(isNaN)) {
            console.warn("Solver produced NaN, resetting simulation state.");
            sol.fill(0);
            return; // Abort this step
        }
    }
    
    // Update State
    components.forEach(c => {
        if (c.type === ComponentType.Junction) return;
        const u = pMap.get(`${c.id}_0`)!;
        const v = pMap.get(`${c.id}_1`)!;
        
        const newVoltage = sol[u] - sol[v]; // V_u - V_v
        let newCurrent = 0; // Current from u to v

        if (c.type === ComponentType.Battery || c.type === ComponentType.ACSource) {
            const vsIdx = voltageSources.findIndex(bat => bat.id === c.id);
            // Solver calculates current leaving positive terminal (v)
            // So current from u to v is -I_source
            newCurrent = -sol[pList.length + vsIdx]; 
        } else if (c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) {
             const unit = c.props.capacitanceUnit || 'µF';
             let mult = 1e-6;
             if (unit === 'mF') mult = 1e-3;
             if (unit === 'nF') mult = 1e-9;
             if (unit === 'pF') mult = 1e-12;
             const C = (c.props.capacitance || 10) * mult;
             const G = C / dt;
             const vPrev = c.simData.storedVoltage || 0;
             // I = G * (V - V_prev)
             newCurrent = G * (newVoltage - vPrev);
             
             c.simData.storedVoltage = newVoltage; // Update state
             c.simData.voltage = Math.abs(newVoltage);
        } else if (c.type === ComponentType.Inductor) {
             const L = c.props.inductance || 100e-3;
             const Rs = 0.1;
             const safeDt = Math.max(1e-6, dt);
             const G_eq = 1 / (Rs + L/safeDt);
             const iPrev = c.simData.storedCurrent || 0;
             const I_eq = iPrev * (L/safeDt) * G_eq;
             
             newCurrent = G_eq * newVoltage + I_eq;
             
             c.simData.storedCurrent = newCurrent; // Update state
             c.simData.voltage = Math.abs(newVoltage);
        } else if (c.type === ComponentType.Diode || c.type === ComponentType.LED) {
             let V_fwd = 0.7;
             if (c.props.diodeType === 'schottky') V_fwd = 0.3;
             if (c.type === ComponentType.LED) V_fwd = c.props.voltageDrop || 2.0;

             const V_zener = c.props.zenerVoltage || 5.6;
             const R_on = 0.1;
             const G_off = 1e-12;

             if (newVoltage > V_fwd) {
                 newCurrent = (newVoltage - V_fwd) / R_on;
             } else if (c.props.diodeType === 'zener' && newVoltage < -V_zener) {
                 newCurrent = (newVoltage + V_zener) / R_on;
             } else {
                 newCurrent = newVoltage * G_off;
             }
        } else if (c.type === ComponentType.Lamp) {
             const R_lamp = 100;
             newCurrent = newVoltage / R_lamp;
        } else {
            const r = c.type === ComponentType.Resistor ? (c.props.resistance || 1000) : 1e-9;
            if (c.type === ComponentType.Switch || c.type === ComponentType.PushButton) {
                 newCurrent = newVoltage / (c.props.closed ? R_CLOSED_SWITCH : R_OPEN_SWITCH);
            } else {
                 newCurrent = newVoltage / Math.max(r, 1e-9);
            }
        }

        // Apply Inductance / Smoothing to Current for display
        const alpha = 0.5; // Less smoothing for faster response
        c.simData.current = c.simData.current * (1 - alpha) + newCurrent * alpha;
        
        if (c.type !== ComponentType.Capacitor && c.type !== ComponentType.PolarizedCapacitor && c.type !== ComponentType.Inductor) {
            c.simData.voltage = Math.abs(newVoltage);
        }
        c.simData.power = c.simData.voltage * Math.abs(c.simData.current);

        // RMS/Peak Calculation
        const decay = 0.999; // Slow decay for peak
        const rmsAlpha = 0.005; // Smoothing for RMS (Mean Square)
        
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
        const u = pMap.get(`${w.compAId}_${w.portAIndex}`);
        const v = pMap.get(`${w.compBId}_${w.portBIndex}`);
        if (u !== undefined && v !== undefined) {
            const newVoltage = Math.abs(sol[u] - sol[v]);
            const newCurrent = (sol[u] - sol[v]) / (w.simData.resistance || 1e-4);
            
            // Inductance for wires
            const alpha = 0.2;
            w.simData.current = w.simData.current * (1 - alpha) + newCurrent * alpha;
            w.simData.voltage = newVoltage;
            w.simData.power = Math.abs(w.simData.voltage * w.simData.current);
        }
    });
  }

  private static solveLinearMatrix(A: number[][], B: number[]): number[] {
    const n = B.length;
    // Deep copy A and B
    const M = A.map(row => [...row]);
    const x = [...B];
    
    // Gaussian elimination with partial pivoting
    for (let i = 0; i < n; i++) {
        // Find pivot
        let maxEl = Math.abs(M[i][i]);
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > maxEl) {
                maxEl = Math.abs(M[k][i]);
                maxRow = k;
            }
        }

        // Swap rows
        if (maxRow !== i) {
            [M[i], M[maxRow]] = [M[maxRow], M[i]];
            [x[i], x[maxRow]] = [x[maxRow], x[i]];
        }

        // Check for singular matrix or near-zero pivot
        if (Math.abs(M[i][i]) < 1e-20) {
            // Skip this column or handle singularity
            continue;
        }

        // Eliminate
        for (let k = i + 1; k < n; k++) {
            const factor = -M[k][i] / M[i][i];
            // Optimization: M[k][i] becomes 0, so we can skip it or set it explicitly
            M[k][i] = 0; 
            for (let j = i + 1; j < n; j++) {
                M[k][j] += factor * M[i][j];
            }
            x[k] += factor * x[i];
        }
    }

    // Back substitution
    const res = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        if (Math.abs(M[i][i]) < 1e-20) {
            res[i] = 0; // Free variable, set to 0
        } else {
            let sum = 0;
            for (let j = i + 1; j < n; j++) {
                sum += M[i][j] * res[j];
            }
            res[i] = (x[i] - sum) / M[i][i];
        }
        
        // Clamp extremely small values to 0 to avoid -1.336e-12 noise
        // if (Math.abs(res[i]) < 1e-15) res[i] = 0;
    }
    
    return res;
  }
}
