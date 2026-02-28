
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ComponentType, ComponentModel, WireModel, ViewState, 
  Port, ComponentProps, AppSettings, THEME, GRID_STEP
} from './types';
import { rotatePoint, findSmartPath, distPointToSegment } from './utils/geometry';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { CircuitCanvas, CircuitCanvasHandle } from './components/CircuitCanvas';
import { CircuitSolver } from './services/Solver';

const VISUAL_SPEEDS = [0, 1, 5, 10, 100, 1000, 5000];

const App: React.FC = () => {
  const loadInitialState = (key: string, def: any) => {
    const saved = localStorage.getItem(key);
    if (!saved) return def;
    try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(def)) return Array.isArray(parsed) ? parsed : def;
        return { ...def, ...parsed };
    } catch (e) { return def; }
  };

  const [components, setComponents] = useState<ComponentModel[]>(() => loadInitialState('ohmic_components', []));
  const [wires, setWires] = useState<WireModel[]>(() => loadInitialState('ohmic_wires', []));
  const [view, setView] = useState<ViewState>({ x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [placementMode, setPlacementMode] = useState<{ type: ComponentType; rotation: number } | null>(null);
  const [connectionStart, setConnectionStart] = useState<{ compId: string; portId: number } | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadInitialState('ohmic_settings', {
      showGrid: true, showLabels: true, showCurrent: true, timeStepMultiplier: 1.0, visualFlowSpeed: 1000
  }));
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const simTimeRef = useRef(0);
  const componentsRef = useRef(components);
  const wiresRef = useRef(wires);
  const canvasRef = useRef<CircuitCanvasHandle>(null);
  const [showProperties, setShowProperties] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Ready.");

  useEffect(() => {
    componentsRef.current = components;
    wiresRef.current = wires;
  }, [components, wires]);

  useEffect(() => {
    if (!isSimulating || isPaused) return;
    
    const tickRate = 1; // 1ms for better transient resolution
    const dt = (tickRate / 1000) * appSettings.timeStepMultiplier;

    const interval = setInterval(() => {
      // Run multiple sub-steps per frame if needed for stability, but 1ms is already quite fine
      CircuitSolver.solve(componentsRef.current, wiresRef.current, dt, simTimeRef.current);
      simTimeRef.current += dt;
      setSimTime(simTimeRef.current);
      setComponents([...componentsRef.current]);
      setWires([...wiresRef.current]);
    }, tickRate);
    
    return () => clearInterval(interval);
  }, [isSimulating, isPaused, appSettings.timeStepMultiplier]);

  useEffect(() => {
    localStorage.setItem('ohmic_components', JSON.stringify(components));
    localStorage.setItem('ohmic_wires', JSON.stringify(wires));
    localStorage.setItem('ohmic_settings', JSON.stringify(appSettings));
  }, [components, wires, appSettings]);

  const resetSimulation = () => {
    setSimTime(0); simTimeRef.current = 0;
    const reset = { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0, storedVoltage: 0, storedCurrent: 0 };
    setComponents(prev => prev.map(c => ({ ...c, state: false, simData: { ...reset } })));
    setWires(prev => prev.map(w => ({ ...w, simData: { ...reset } })));
    setIsSimulating(false); setIsPaused(false);
  };

  const getAbsPorts = useCallback((c: ComponentModel): Port[] => {
    if (c.type === ComponentType.Junction) return [{ id: 0, x: c.x, y: c.y, parentId: c.id }];
    const basePorts = [{ id: 0, x: -40, y: 0 }, { id: 1, x: 40, y: 0 }];
    return basePorts.map(p => {
      const r = rotatePoint(p.x, p.y, c.rotation);
      return { id: p.id, x: c.x + r.x, y: c.y + r.y, parentId: c.id };
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    
    setComponents(prev => {
        const remaining = prev.filter(c => !selectedIds.includes(c.id));
        
        // Renumbering logic to ensure sequential names (R1, R2, etc.)
        const counters: Record<string, number> = { R: 1, C: 1, V: 1, S: 1, J: 1, U: 1 };
        
        return remaining.map(c => {
            let prefix = 'U';
            switch (c.type) {
                case ComponentType.Resistor: prefix = 'R'; break;
                case ComponentType.Capacitor: 
                case ComponentType.PolarizedCapacitor: prefix = 'C'; break;
                case ComponentType.Battery: prefix = 'V'; break;
                case ComponentType.Switch: 
                case ComponentType.PushButton: prefix = 'S'; break;
                case ComponentType.Junction: prefix = 'J'; break;
            }
            
            // Assign new sequential name
            const newName = `${prefix}${counters[prefix]++}`;
            return { ...c, props: { ...c.props, name: newName } };
        });
    });

    setWires(prev => prev.filter(w => !selectedIds.includes(w.id) && !selectedIds.includes(w.compAId) && !selectedIds.includes(w.compBId)));
    setSelectedIds([]);
  }, [selectedIds]);

  const rotateSelected = useCallback((id?: string) => {
      const targetIds = id ? [id] : selectedIds;
      if (targetIds.length === 0) return;
      
      setComponents(prev => prev.map(c => {
          if (targetIds.includes(c.id)) {
              return { ...c, rotation: (c.rotation + 1) % 4 };
          }
          return c;
      }));
      
      // Update wires for all rotated components
      setWires(prev => prev.map(w => {
          const isA = targetIds.includes(w.compAId);
          const isB = targetIds.includes(w.compBId);
          if (isA || isB) {
              // We need the latest component positions/rotations here
              // This is tricky with functional state updates if multiple components move
              // But since we are only rotating, we can calculate based on the current state + the rotation we just applied
              return w; // findSmartPath will be called in the next effect or we should trigger it
          }
          return w;
      }));
  }, [selectedIds]);

  const getObstacles = useCallback((comps: ComponentModel[]) => {
      const obstacles = new Set<string>();
      const key = (x: number, y: number) => `${x},${y}`;
      
      comps.forEach(c => {
          if (c.type === ComponentType.Junction) return;
          
          // Dense sampling to catch all grid points covered by the component
          // Component body is approx -40 to 40 (width) and -15 to 15 (height)
          // We iterate with step 5 to ensure we hit nearest grid points (step 10)
          for (let dx = -35; dx <= 35; dx += 5) {
              for (let dy = -15; dy <= 15; dy += 5) {
                  const r = rotatePoint(dx, dy, c.rotation);
                  const wx = c.x + r.x;
                  const wy = c.y + r.y;
                  
                  // Snap to grid to match pathfinding nodes
                  const gx = Math.round(wx / GRID_STEP) * GRID_STEP;
                  const gy = Math.round(wy / GRID_STEP) * GRID_STEP;
                  
                  obstacles.add(key(gx, gy));
              }
          }
      });
      return obstacles;
  }, []);

  // Trigger wire path recalculation when components move or rotate
  const lastLayoutHash = useRef('');
  
  useEffect(() => {
      // Only recalculate if physical layout changes (ignore simData updates)
      const layoutHash = components.map(c => `${c.id}:${c.x}:${c.y}:${c.rotation}`).join('|');
      if (layoutHash === lastLayoutHash.current) return;
      lastLayoutHash.current = layoutHash;

      const componentObstacles = getObstacles(components);
      setWires(prev => prev.map(w => {
          const cA = components.find(c => c.id === w.compAId);
          const cB = components.find(c => c.id === w.compBId);
          if (cA && cB) {
              const pA = getAbsPorts(cA).find(p => p.id === w.portAIndex)!;
              const pB = getAbsPorts(cB).find(p => p.id === w.portBIndex)!;
              
              const wireObstacles = new Set<string>();
              prev.forEach(otherW => {
                  if (otherW.id !== w.id) {
                      otherW.path.forEach(p => wireObstacles.add(`${Math.round(p.x)},${Math.round(p.y)}`));
                  }
              });

              return { ...w, path: findSmartPath(pA, pB, componentObstacles, undefined, wireObstacles) };
          }
          return w;
      }));
  }, [components, getAbsPorts, getObstacles]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (isSimulating) return; // Prevent editing during simulation
          if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
          if (e.key === 'r' || e.key === 'R') rotateSelected();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, rotateSelected, isSimulating]);

  const addComponent = (type: ComponentType, x: number, y: number, rotation: number, splitWire?: WireModel) => {
    const id = `comp_${Date.now()}`;
    
    // Automatic Naming
    let prefix = 'U';
    switch (type) {
        case ComponentType.Resistor: prefix = 'R'; break;
        case ComponentType.Capacitor: 
        case ComponentType.PolarizedCapacitor: prefix = 'C'; break;
        case ComponentType.Inductor: prefix = 'L'; break;
        case ComponentType.ACSource: prefix = 'V'; break;
        case ComponentType.Battery: prefix = 'V'; break;
        case ComponentType.Switch: 
        case ComponentType.PushButton: prefix = 'S'; break;
        case ComponentType.Diode: prefix = 'D'; break;
        case ComponentType.LED: prefix = 'D'; break;
        case ComponentType.Lamp: prefix = 'L'; break;
        case ComponentType.Junction: prefix = 'J'; break;
    }

    const existing = components.filter(c => c.props.name && c.props.name.startsWith(prefix));
    const usedNums = new Set(existing.map(c => {
        const match = c.props.name.match(new RegExp(`^${prefix}(\\d+)$`));
        return match ? parseInt(match[1]) : 0;
    }));

    let i = 1;
    while (usedNums.has(i)) i++;
    const name = `${prefix}${i}`;

    const newComp: ComponentModel = {
      id, type, x, y, rotation, state: false,
      props: { name },
      simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 }
    };
    if (type === ComponentType.Battery) { newComp.props.voltage = 9; newComp.props.capacity = 1000; }
    else if (type === ComponentType.Resistor) { newComp.props.resistance = 1000; }
    else if (type === ComponentType.Capacitor || type === ComponentType.PolarizedCapacitor) { newComp.props.capacitance = 10; newComp.props.capacitanceUnit = 'µF'; }
    else if (type === ComponentType.Inductor) { newComp.props.inductance = 100e-3; } // 100mH
    else if (type === ComponentType.ACSource) { newComp.props.amplitude = 10; newComp.props.frequency = 60; } // 10V 60Hz
    else if (type === ComponentType.Diode) { newComp.props.diodeType = 'rectifier'; }
    else if (type === ComponentType.LED) { 
        newComp.props.color = '#00e5ff'; 
        newComp.props.voltageDrop = 2.0; 
        newComp.props.maxCurrent = 0.02; 
    }
    else if (type === ComponentType.Lamp) { newComp.props.color = '#ffffaa'; newComp.props.resistance = 100; }
    
    const newPorts = getAbsPorts(newComp);
    let wireToSplit: WireModel | null = null;

    if (newPorts.length === 2) {
        for (const w of wires) {
            let p0OnWire = false;
            let p1OnWire = false;
            const threshold = 10;

            for (let i = 0; i < w.path.length - 1; i++) {
                const p1 = w.path[i];
                const p2 = w.path[i+1];
                if (!p0OnWire && distPointToSegment(newPorts[0], p1, p2) < threshold) p0OnWire = true;
                if (!p1OnWire && distPointToSegment(newPorts[1], p1, p2) < threshold) p1OnWire = true;
            }

            if (p0OnWire && p1OnWire) {
                wireToSplit = w;
                break;
            }
        }
    }

    if (wireToSplit) {
        const wireStart = wireToSplit.path[0];
        const dist0 = Math.hypot(newPorts[0].x - wireStart.x, newPorts[0].y - wireStart.y);
        const dist1 = Math.hypot(newPorts[1].x - wireStart.x, newPorts[1].y - wireStart.y);
        
        let firstPort = newPorts[0];
        let secondPort = newPorts[1];
        
        if (dist1 < dist0) {
            firstPort = newPorts[1];
            secondPort = newPorts[0];
        }

        const w1: WireModel = {
            id: `wire_${Date.now()}_1`,
            compAId: wireToSplit.compAId,
            portAIndex: wireToSplit.portAIndex,
            compBId: newComp.id,
            portBIndex: firstPort.id,
            anchor: null,
            path: [],
            selected: false,
            simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 },
            props: { ...wireToSplit.props }
        };

        const w2: WireModel = {
            id: `wire_${Date.now()}_2`,
            compAId: newComp.id,
            portAIndex: secondPort.id,
            compBId: wireToSplit.compBId,
            portBIndex: wireToSplit.portBIndex,
            anchor: null,
            path: [],
            selected: false,
            simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 },
            props: { ...wireToSplit.props }
        };

        setWires(prev => prev.filter(w => w.id !== wireToSplit!.id).concat([w1, w2]));
        setStatusMsg(`Added ${type} and split wire`);
    } else {
        setStatusMsg(`Added ${type}`);
    }

    setComponents(prev => [...prev, newComp]);
    setSelectedIds([id]); setPlacementMode(null);
    setShowProperties(true);
  };

  const addWire = (start: { compId: string; portId: number }, end: { compId: string; portId: number }) => {
    if (start.compId === end.compId) return;
    
    const cA = components.find(c => c.id === start.compId)!;
    const cB = components.find(c => c.id === end.compId)!;
    const pA = getAbsPorts(cA).find(p => p.id === start.portId)!;
    const pB = getAbsPorts(cB).find(p => p.id === end.portId)!;
    
    const obstacles = getObstacles(components);
    const path = findSmartPath(pA, pB, obstacles);

    const newWire: WireModel = {
      id: `wire_${Date.now()}`, compAId: start.compId, portAIndex: start.portId, compBId: end.compId, portBIndex: end.portId,
      anchor: null, path, selected: false,
      simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 },
      props: { name: 'Wire' }
    };
    setWires(prev => [...prev, newWire]); setConnectionStart(null);
  };

  const handleWireJoin = (wire: WireModel, point: {x: number, y: number}) => {
    if (!connectionStart) return;
    const jId = `junc_${Date.now()}`;
    const junction: ComponentModel = { id: jId, type: ComponentType.Junction, x: point.x, y: point.y, rotation: 0, state: false, props: { name: 'Junction' }, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 } };
    const wProps = { ...wire.props };
    const w1: WireModel = { id: `w_${Date.now()}_1`, compAId: wire.compAId, portAIndex: wire.portAIndex, compBId: jId, portBIndex: 0, anchor: null, path: [], selected: false, simData: { ...wire.simData }, props: wProps };
    const w2: WireModel = { id: `w_${Date.now()}_2`, compAId: jId, portAIndex: 0, compBId: wire.compBId, portBIndex: wire.portBIndex, anchor: null, path: [], selected: false, simData: { ...wire.simData }, props: wProps };
    const w3: WireModel = { id: `w_${Date.now()}_3`, compAId: connectionStart.compId, portAIndex: connectionStart.portId, compBId: jId, portBIndex: 0, anchor: null, path: [], selected: false, simData: { ...wire.simData }, props: { name: 'Wire' } };
    setComponents(prev => [...prev, junction]); setWires(prev => prev.filter(w => w.id !== wire.id).concat([w1, w2, w3])); setConnectionStart(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1a1a] select-none">
      <Sidebar onPlace={(type) => !isSimulating && setPlacementMode({ type, rotation: 0 })} isSimulating={isSimulating} />
      <div className="flex-1 relative h-full flex flex-col min-w-0">
        <CircuitCanvas ref={canvasRef} components={components} wires={wires} view={view} setView={setView} isSimulating={isSimulating} placementMode={placementMode} setPlacementMode={setPlacementMode} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onAddComponent={addComponent} onAddWire={addWire} onWireJoin={handleWireJoin} onRotateSelected={rotateSelected} connectionStart={connectionStart} setConnectionStart={setConnectionStart} setComponents={setComponents} setWires={setWires} getAbsPorts={getAbsPorts} onOpenProperties={() => setShowProperties(true)} onCloseProperties={() => setShowProperties(false)} appSettings={appSettings} />
        <div className="absolute top-6 right-6 z-10 flex items-center gap-2 bg-[#252525] border border-zinc-700 p-1.5 rounded-lg shadow-2xl">
            <div className="px-2 font-mono text-xs text-orange-500 font-bold">{simTime.toFixed(2)}s</div>
            <button onClick={resetSimulation} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400" title="Reset"><svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></button>
            <button onClick={() => { setIsSimulating(!isSimulating); if (!isSimulating) setShowProperties(false); }} className={`px-3 py-1.5 rounded font-bold text-[10px] uppercase ${isSimulating ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>{isSimulating ? 'Stop' : 'Run'}</button>
            <button onClick={() => setShowSettingsModal(!showSettingsModal)} className={`p-1.5 rounded ${showSettingsModal ? 'text-orange-500 bg-zinc-700' : 'text-zinc-400 hover:bg-zinc-700'}`} title="Settings"><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg></button>
        </div>
        {showSettingsModal && (
            <div className="absolute top-16 right-6 z-20 w-64 bg-[#252525] border border-zinc-700 rounded-lg shadow-2xl p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-zinc-400 uppercase font-bold">
                        <span>Simulation Speed</span>
                        <span>{(appSettings.visualFlowSpeed / 2000).toFixed(0)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        step="1"
                        value={appSettings.visualFlowSpeed / 2000} 
                        onChange={(e) => setAppSettings(prev => ({ ...prev, visualFlowSpeed: parseInt(e.target.value) * 2000 }))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                </div>
                <div className="flex flex-col gap-2 border-t border-zinc-700 pt-3">
                     <label className="flex items-center justify-between text-zinc-400 text-sm cursor-pointer hover:text-white">
                        <span>Show Grid</span>
                        <input type="checkbox" checked={appSettings.showGrid} onChange={e => setAppSettings(p => ({...p, showGrid: e.target.checked}))} className="accent-orange-500" />
                     </label>
                     <label className="flex items-center justify-between text-zinc-400 text-sm cursor-pointer hover:text-white">
                        <span>Show Labels</span>
                        <input type="checkbox" checked={appSettings.showLabels} onChange={e => setAppSettings(p => ({...p, showLabels: e.target.checked}))} className="accent-orange-500" />
                     </label>
                     <label className="flex items-center justify-between text-zinc-400 text-sm cursor-pointer hover:text-white">
                        <span>Show Current</span>
                        <input type="checkbox" checked={appSettings.showCurrent} onChange={e => setAppSettings(p => ({...p, showCurrent: e.target.checked}))} className="accent-orange-500" />
                     </label>
                </div>
            </div>
        )}
        {showProperties && selectedIds.length > 0 && <div className="absolute top-0 right-0 bottom-0 z-20"><PropertiesPanel target={components.find(c => c.id === selectedIds[0]) || wires.find(w => w.id === selectedIds[0])} onUpdateCompProps={(id, p) => setComponents(prev => prev.map(c => c.id === id ? { ...c, props: { ...c.props, ...p } } : c))} onUpdateWireProps={(id, p) => setWires(prev => prev.map(w => w.id === id ? { ...w, props: { ...w.props, ...p } } : w))} /></div>}
      </div>
    </div>
  );
};

export default App;
