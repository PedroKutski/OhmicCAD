
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ComponentType, ComponentModel, WireModel, ViewState, 
  Port, ComponentProps, AppSettings, THEME, GRID_STEP, Theme,
  PersistedComponentState, PersistedWireState, PersistedSettingsState
} from './types';
import { rotatePoint, findSmartPath, distPointToSegment, findIntersection, buildOrthogonalPath } from './utils/geometry';
import { formatUnit } from './utils/formatting';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { CircuitCanvas, CircuitCanvasHandle } from './components/CircuitCanvas';
import { CircuitSolver } from './services/Solver';
import { jsPDF } from "jspdf";
import jspdfAutotable from 'jspdf-autotable';
import { GraphPanel } from './components/GraphPanel';
import { CircuitLibraryModal } from './components/CircuitLibraryModal';

const VISUAL_SPEEDS = [0, 1, 5, 10, 100, 1000, 5000, 20000];
const GRAPH_MAX_HISTORY = 2000;

type GraphPoint = { time: number; voltage: number; current: number };

const App: React.FC = () => {
  const isObjectLike = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );

  const hasKeys = (value: unknown, keys: string[]): value is Record<string, unknown> => (
    isObjectLike(value) && keys.every((key) => key in value)
  );

  const isPersistedComponentState = (value: unknown): value is PersistedComponentState => (
    hasKeys(value, ['id', 'type', 'x', 'y', 'rotation', 'state', 'props', 'simData'])
  );

  const isPersistedWireState = (value: unknown): value is PersistedWireState => (
    hasKeys(value, ['id', 'compAId', 'portAIndex', 'compBId', 'portBIndex', 'anchor', 'path', 'selected', 'simData', 'props'])
    && Array.isArray((value as { path?: unknown }).path)
  );

  const isPersistedSettingsState = (value: unknown): value is PersistedSettingsState => (
    isObjectLike(value)
  );

  const loadInitialState = <T,>(key: string, def: T): T => {
    const saved = localStorage.getItem(key);
    if (!saved) return def;

    try {
      const parsed: unknown = JSON.parse(saved);

      if (Array.isArray(def)) {
        if (!Array.isArray(parsed)) return def;

        if (key === 'ohmic_components') {
          return parsed.filter(isPersistedComponentState) as T;
        }

        if (key === 'ohmic_wires') {
          return parsed.filter(isPersistedWireState) as T;
        }

        return parsed as T;
      }

      if (!isObjectLike(def) || !isObjectLike(parsed)) return def;

      if (key === 'ohmic_settings' && !isPersistedSettingsState(parsed)) {
        return def;
      }

      return { ...def, ...parsed } as T;
    } catch {
      return def;
    }
  };

  const [components, setComponents] = useState<ComponentModel[]>(() => loadInitialState('ohmic_components', []));
  const [wires, setWires] = useState<WireModel[]>(() => loadInitialState('ohmic_wires', []));
  const [view, setView] = useState<ViewState>({ x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [placementMode, setPlacementMode] = useState<{ type: ComponentType; rotation: number } | null>(null);
  const [connectionStart, setConnectionStart] = useState<{ compId: string; portId: number } | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadInitialState('ohmic_settings', {
      showGrid: true,
      showLabels: true,
      showCurrent: true,
      showDirectionArrows: true,
      currentFlowMode: 'conventional',
      smoothWires: false,
      timeStepMultiplier: 1.0,
      visualFlowSpeed: 1000
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
  const [showLibrary, setShowLibrary] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Ready.");

  // Context Menu & Graphs
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null);
  const [editPanel, setEditPanel] = useState<{ x: number, y: number, id: string } | null>(null);
  const [graphs, setGraphs] = useState<{ id: string, componentId: string, type: 'voltage' | 'current', color: string }[]>([]);
  const [graphData, setGraphData] = useState<Record<string, GraphPoint[]>>({});

  const [history, setHistory] = useState<{components: ComponentModel[], wires: WireModel[]}[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Save state to history
  const saveToHistory = useCallback((newComponents: ComponentModel[], newWires: WireModel[]) => {
      setHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push({ components: newComponents, wires: newWires });
          if (newHistory.length > 20) newHistory.shift(); // Limit history size
          return newHistory;
      });
      setHistoryIndex(prev => Math.min(prev + 1, 19));
  }, [historyIndex]);

  const undo = useCallback(() => {
      if (historyIndex > 0) {
          const prevState = history[historyIndex - 1];
          setComponents(prevState.components);
          setWires(prevState.wires);
          setHistoryIndex(historyIndex - 1);
      }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
      if (historyIndex < history.length - 1) {
          const nextState = history[historyIndex + 1];
          setComponents(nextState.components);
          setWires(nextState.wires);
          setHistoryIndex(historyIndex + 1);
      }
  }, [history, historyIndex]);

  // Initial history save
  useEffect(() => {
      if (history.length === 0 && components.length === 0 && wires.length === 0) {
           // Don't save empty initial state if it's truly empty
      } else if (history.length === 0) {
          setHistory([{ components, wires }]);
          setHistoryIndex(0);
      }
  }, []);

  // Wrap setComponents and setWires to save history when user interacts
  // We need a way to distinguish user actions from simulation updates
  // For now, we'll expose a helper to save history explicitly after actions
  
  const updateStateWithHistory = (newComponents: ComponentModel[], newWires: WireModel[]) => {
      setComponents(newComponents);
      setWires(newWires);
      saveToHistory(newComponents, newWires);
  };

  useEffect(() => {
    componentsRef.current = components;
    wiresRef.current = wires;
  }, [components, wires]);

  useEffect(() => {
    if (!isSimulating || isPaused) return;
    
    let animationFrameId: number;
    const dt = 0.001 * appSettings.timeStepMultiplier; // Physics step size (1ms)

    const loop = () => {
        const frameGraphSamples: Record<string, GraphPoint[]> = {};
        const activeComponentIds = new Set(graphs.map(g => g.componentId));

        // Determine steps based on speed setting
        // visualFlowSpeed is roughly "steps per second"
        // At 60fps (16ms), speed 1000 -> 16 steps.
        // Speed 20000 -> 333 steps.
        
        let stepsToRun = Math.round(appSettings.visualFlowSpeed / 60);
        if (stepsToRun < 1) stepsToRun = 1;
        
        // Cap max steps to prevent freezing, but allow enough for "Instant" feel
        // 200 steps * 1ms sim = 200ms sim per frame. @ 60fps = 12s sim per real second.
        const MAX_STEPS = 200; 
        if (stepsToRun > MAX_STEPS) stepsToRun = MAX_STEPS;

        const startTime = performance.now();
        const timeBudget = 12; // Max ms to spend on physics per frame (leave 4ms for rendering)

        for (let i = 0; i < stepsToRun; i++) {
            const result = CircuitSolver.solve(componentsRef.current, wiresRef.current, dt, simTimeRef.current);
            if (!result.ok) {
                setStatusMsg(result.error || 'Falha na simulação.');
                setIsPaused(true);
                break;
            }
            simTimeRef.current += dt;

            activeComponentIds.forEach((compId) => {
                const comp = componentsRef.current.find(c => c.id === compId);
                if (!comp) return;

                const voltage = comp.type === ComponentType.ACSource
                  ? (comp.props.amplitude || 20) * Math.sin(2 * Math.PI * (comp.props.frequency || 60) * simTimeRef.current)
                  : comp.simData.voltage;

                if (!frameGraphSamples[compId]) frameGraphSamples[compId] = [];
                frameGraphSamples[compId].push({
                  time: simTimeRef.current,
                  voltage,
                  current: comp.simData.current
                });
            });
            
            // Bail if we're taking too long
            if (performance.now() - startTime > timeBudget) break;
        }

        if (Object.keys(frameGraphSamples).length > 0) {
            setGraphData(prev => {
              const next: Record<string, GraphPoint[]> = { ...prev };

              Object.entries(frameGraphSamples).forEach(([compId, samples]) => {
                const merged = [...(next[compId] || []), ...samples];
                if (merged.length > GRAPH_MAX_HISTORY) {
                  merged.splice(0, merged.length - GRAPH_MAX_HISTORY);
                }
                next[compId] = merged;
              });

              Object.keys(next).forEach((compId) => {
                if (!activeComponentIds.has(compId)) {
                  delete next[compId];
                }
              });

              return next;
            });
        }

        setSimTime(simTimeRef.current);
        setComponents([...componentsRef.current]);
        setWires([...wiresRef.current]);

        animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating, isPaused, appSettings.timeStepMultiplier, appSettings.visualFlowSpeed, graphs]);

  useEffect(() => {
    if (isSimulating) return;
    setGraphData({});
  }, [isSimulating]);

  useEffect(() => {
    localStorage.setItem('ohmic_components', JSON.stringify(components));
    localStorage.setItem('ohmic_wires', JSON.stringify(wires));
    localStorage.setItem('ohmic_settings', JSON.stringify(appSettings));
  }, [components, wires, appSettings]);

  const resetSimulation = () => {
    setSimTime(0); simTimeRef.current = 0;
    setGraphData({});
    const reset = { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0, storedVoltage: 0, storedCurrent: 0 };
    setComponents(prev => prev.map(c => ({ ...c, state: false, simData: { ...reset } })));
    setWires(prev => prev.map(w => ({ ...w, simData: { ...reset } })));
    setIsSimulating(false); setIsPaused(false);
  };

  const getAbsPorts = useCallback((c: ComponentModel): Port[] => {
    if (c.type === ComponentType.Junction) return [{ id: 0, x: c.x, y: c.y, parentId: c.id }];
    if (c.type === ComponentType.VCC) {
      const terminal = rotatePoint(0, 40, c.rotation);
      return [{ id: 0, x: c.x + terminal.x, y: c.y + terminal.y, parentId: c.id }];
    }
    if (c.type === ComponentType.GND) {
      const terminal = rotatePoint(0, -40, c.rotation);
      return [{ id: 0, x: c.x + terminal.x, y: c.y + terminal.y, parentId: c.id }];
    }
    const basePorts = [{ id: 0, x: -40, y: 0 }, { id: 1, x: 40, y: 0 }];
    return basePorts.map(p => {
      const r = rotatePoint(p.x, p.y, c.rotation);
      return { id: p.id, x: c.x + r.x, y: c.y + r.y, parentId: c.id };
    });
  }, []);



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


  const createWirePath = useCallback((
      pA: Port,
      pB: Port,
      anchor: { x: number; y: number } | null,
      obstacles: Set<string>,
      softObstacles?: Set<string>
  ) => {
      if (anchor) {
          return buildOrthogonalPath(pA, pB, anchor);
      }
      return findSmartPath(pA, pB, obstacles, undefined, softObstacles);
  }, []);

  // Trigger wire path recalculation when components move or rotate
  const lastLayoutHash = useRef('');
  
  useEffect(() => {
      if (isSimulating) return;
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

              return { ...w, path: createWirePath(pA, pB, w.anchor, componentObstacles, wireObstacles) };
          }
          return w;
      }));
  }, [components, createWirePath, getAbsPorts, getObstacles, isSimulating]);



  // Re-implementing addComponent to support history correctly
  const addComponentWithHistory = (type: ComponentType, x: number, y: number, rotation: number) => {
     const id = `comp_${Date.now()}`;
     // ... naming logic ...
    let prefix = 'U';
    switch (type) {
        case ComponentType.Resistor: prefix = 'R'; break;
        case ComponentType.Capacitor: 
        case ComponentType.PolarizedCapacitor: prefix = 'C'; break;
        case ComponentType.Inductor: prefix = 'L'; break;
        case ComponentType.ACSource: prefix = 'V'; break;
        case ComponentType.Battery:
        case ComponentType.VCC: prefix = 'V'; break;
        case ComponentType.Switch: 
        case ComponentType.PushButton: prefix = 'S'; break;
        case ComponentType.Diode:
        case ComponentType.LED: prefix = 'D'; break;
        case ComponentType.Lamp: prefix = 'L'; break;
        case ComponentType.GND: prefix = 'G'; break;
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
    
    // Props init
    if (type === ComponentType.Battery) { newComp.props.voltage = 9; newComp.props.capacity = 1000; }
    else if (type === ComponentType.VCC) { newComp.props.voltage = 5; }
    else if (type === ComponentType.Resistor) { newComp.props.resistance = 1000; }
    else if (type === ComponentType.Capacitor || type === ComponentType.PolarizedCapacitor) { newComp.props.capacitance = 10; newComp.props.capacitanceUnit = 'µF'; }
    else if (type === ComponentType.Inductor) { newComp.props.inductance = 100e-3; }
    else if (type === ComponentType.ACSource) { newComp.props.amplitude = 20; newComp.props.frequency = 60; }
    else if (type === ComponentType.Diode) { newComp.props.diodeType = 'rectifier'; }
    else if (type === ComponentType.LED) { newComp.props.diodeType = 'led'; newComp.props.maxVoltage = 2.2; newComp.props.currentRating = 0.01; newComp.props.maxCurrentMa = 10; newComp.props.saturationCurrent = 2e-12; newComp.props.idealityFactor = 2; newComp.props.internalSeriesResistance = 2; newComp.props.ledSeriesResistance = 330; newComp.props.ledBrightnessFactor = 1; newComp.props.ledFailureMode = 'saturate'; newComp.props.ledColor = '#ff4d4d'; }
    else if (type === ComponentType.Lamp) { newComp.props.color = '#ffffaa'; newComp.props.resistance = 100; }

    let nextWires = [...wires];
    const newPorts = getAbsPorts(newComp);
    let wireToSplit: WireModel | null = null;

    if (newPorts.length === 2) {
        for (const w of nextWires) {
            let p0OnWire = false;
            let p1OnWire = false;
            const threshold = 10;

            for (let j = 0; j < w.path.length - 1; j++) {
                const p1 = w.path[j];
                const p2 = w.path[j+1];
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

        nextWires = nextWires.filter(w => w.id !== wireToSplit!.id).concat([w1, w2]);
        setStatusMsg(`Added ${type} and split wire`);
    } else {
        setStatusMsg(`Added ${type}`);
    }

    const nextComponents = [...components, newComp];
    updateStateWithHistory(nextComponents, nextWires);
    setSelectedIds([id]); 
    setPlacementMode(null);
    setShowProperties(true);
  };

  const addWireWithHistory = (start: { compId: string; portId: number }, end: { compId: string; portId: number }) => {
    if (start.compId === end.compId) return;
    
    const cA = components.find(c => c.id === start.compId)!;
    const cB = components.find(c => c.id === end.compId)!;
    const pA = getAbsPorts(cA).find(p => p.id === start.portId)!;
    const pB = getAbsPorts(cB).find(p => p.id === end.portId)!;
    
    const obstacles = getObstacles(components);
    const defaultAnchor = {
      x: Math.round(((pA.x + pB.x) / 2) / GRID_STEP) * GRID_STEP,
      y: Math.round(((pA.y + pB.y) / 2) / GRID_STEP) * GRID_STEP
    };
    const path = createWirePath(pA, pB, defaultAnchor, obstacles);

    // Check for intersections with existing wires
    let intersectionPoint: {x: number, y: number} | null = null;
    let intersectedWire: WireModel | null = null;
    let intersectedSegmentIndex = -1;
    let newWireSegmentIndex = -1;

    // Iterate segments of the new path
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];

        for (const w of wires) {
            // Skip if connected to same component (already handled by port check usually, but good safety)
            if (w.compAId === start.compId || w.compAId === end.compId || w.compBId === start.compId || w.compBId === end.compId) continue;

            for (let j = 0; j < w.path.length - 1; j++) {
                const p3 = w.path[j];
                const p4 = w.path[j+1];
                
                const inter = findIntersection(p1, p2, p3, p4);
                if (inter) {
                    // Snap to grid
                    const gx = Math.round(inter.x / GRID_STEP) * GRID_STEP;
                    const gy = Math.round(inter.y / GRID_STEP) * GRID_STEP;
                    
                    // Check if intersection is actually on the segments (findIntersection checks infinite lines? No, implementation checks segments)
                    // But we should avoid endpoints
                    const isEndpoint = (x: number, y: number) => 
                        (Math.abs(x - p1.x) < 1 && Math.abs(y - p1.y) < 1) ||
                        (Math.abs(x - p2.x) < 1 && Math.abs(y - p2.y) < 1) ||
                        (Math.abs(x - p3.x) < 1 && Math.abs(y - p3.y) < 1) ||
                        (Math.abs(x - p4.x) < 1 && Math.abs(y - p4.y) < 1);

                    if (!isEndpoint(gx, gy)) {
                        intersectionPoint = { x: gx, y: gy };
                        intersectedWire = w;
                        intersectedSegmentIndex = j;
                        newWireSegmentIndex = i;
                        break;
                    }
                }
            }
            if (intersectionPoint) break;
        }
        if (intersectionPoint) break;
    }

    if (intersectionPoint && intersectedWire) {
        // Create a junction at intersection
        const jId = `junc_${Date.now()}`;
        const junction: ComponentModel = { 
            id: jId, type: ComponentType.Junction, 
            x: intersectionPoint.x, y: intersectionPoint.y, rotation: 0, state: false, 
            props: { name: 'J' }, 
            simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 } 
        };

        // Split the existing wire
        const wProps = { ...intersectedWire.props };
        const w1: WireModel = { 
            id: `w_${Date.now()}_1`, 
            compAId: intersectedWire.compAId, portAIndex: intersectedWire.portAIndex, 
            compBId: jId, portBIndex: 0, 
            anchor: null, path: [], selected: false, simData: { ...intersectedWire.simData }, props: wProps 
        };
        const w2: WireModel = { 
            id: `w_${Date.now()}_2`, 
            compAId: jId, portAIndex: 0, 
            compBId: intersectedWire.compBId, portBIndex: intersectedWire.portBIndex, 
            anchor: null, path: [], selected: false, simData: { ...intersectedWire.simData }, props: wProps 
        };

        // Split the new wire into two parts connecting to the junction
        // Part 1: Start to Junction
        const wNew1: WireModel = {
            id: `wire_${Date.now()}_n1`, 
            compAId: start.compId, portAIndex: start.portId, 
            compBId: jId, portBIndex: 0,
            anchor: null, path: [], selected: false, 
            simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 },
            props: { name: 'Wire' }
        };

        // Part 2: Junction to End
        const wNew2: WireModel = {
            id: `wire_${Date.now()}_n2`, 
            compAId: jId, portAIndex: 0, 
            compBId: end.compId, portBIndex: end.portId,
            anchor: null, path: [], selected: false, 
            simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 },
            props: { name: 'Wire' }
        };

        const nextWires = wires.filter(w => w.id !== intersectedWire!.id).concat([w1, w2, wNew1, wNew2]);
        updateStateWithHistory([...components, junction], nextWires);
        setStatusMsg("Created junction at intersection");
    } else {
        const newWire: WireModel = {
          id: `wire_${Date.now()}`, compAId: start.compId, portAIndex: start.portId, compBId: end.compId, portBIndex: end.portId,
          anchor: defaultAnchor, path, selected: false,
          simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 },
          props: { name: 'Wire' }
        };
        updateStateWithHistory(components, [...wires, newWire]);
    }
    
    setConnectionStart(null);
  };

  const handleWireJoinWithHistory = (wire: WireModel, point: {x: number, y: number}) => {
    if (!connectionStart) return;
    const jId = `junc_${Date.now()}`;
    const junction: ComponentModel = { id: jId, type: ComponentType.Junction, x: point.x, y: point.y, rotation: 0, state: false, props: { name: 'Junction' }, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 } };
    const wProps = { ...wire.props };
    const w1: WireModel = { id: `w_${Date.now()}_1`, compAId: wire.compAId, portAIndex: wire.portAIndex, compBId: jId, portBIndex: 0, anchor: null, path: [], selected: false, simData: { ...wire.simData }, props: wProps };
    const w2: WireModel = { id: `w_${Date.now()}_2`, compAId: jId, portAIndex: 0, compBId: wire.compBId, portBIndex: wire.portBIndex, anchor: null, path: [], selected: false, simData: { ...wire.simData }, props: wProps };
    const w3: WireModel = { id: `w_${Date.now()}_3`, compAId: connectionStart.compId, portAIndex: connectionStart.portId, compBId: jId, portBIndex: 0, anchor: null, path: [], selected: false, simData: { ...wire.simData }, props: { name: 'Wire' } };
    
    updateStateWithHistory([...components, junction], wires.filter(w => w.id !== wire.id).concat([w1, w2, w3]));
    setConnectionStart(null);
  };
  
  const deleteSelectedWithHistory = () => {
      if (selectedIds.length === 0) return;
      
      const remainingComponents = components.filter(c => !selectedIds.includes(c.id));
      // Renumbering logic (simplified for brevity, keeping original logic would be better but it's long)
      // Actually, let's just keep the components as is for now to avoid complex re-indexing bugs in history
      
      const remainingWires = wires.filter(w => !selectedIds.includes(w.id) && !selectedIds.includes(w.compAId) && !selectedIds.includes(w.compBId));
      
      updateStateWithHistory(remainingComponents, remainingWires);
      setSelectedIds([]);
  };

  const rotateSelectedWithHistory = (id?: string) => {
      const targetIds = id ? [id] : selectedIds;
      if (targetIds.length === 0) return;
      
      const nextComponents = components.map(c => {
          if (targetIds.includes(c.id)) {
              return { ...c, rotation: (c.rotation + 1) % 4 };
          }
          return c;
      });
      
      // Wires update automatically via effect, but we should save the component state
      updateStateWithHistory(nextComponents, wires);
  };
  
  const handleDragEndWithHistory = (id: string) => {
    const comp = components.find(c => c.id === id);
    if (!comp) return;

    const ports = getAbsPorts(comp);
    let newWires = [...wires];
    let modified = false;
    let newComponents = [...components];

    // ... (same logic as before for splitting/joining) ...
    // To avoid code duplication, I should have extracted the logic. 
    // For now, I will copy the logic from handleDragEnd but use local variables
    
    // Check if any port lands on a wire (T-junction or inline split)
    if (ports.length === 2) {
        let wireToSplit: WireModel | null = null;
        for (const w of newWires) {
            if (w.compAId === comp.id || w.compBId === comp.id) continue;
            let p0OnWire = false;
            let p1OnWire = false;
            const threshold = 10;
            for (let i = 0; i < w.path.length - 1; i++) {
                const p1 = w.path[i];
                const p2 = w.path[i+1];
                if (!p0OnWire && distPointToSegment(ports[0], p1, p2) < threshold) p0OnWire = true;
                if (!p1OnWire && distPointToSegment(ports[1], p1, p2) < threshold) p1OnWire = true;
            }
            if (p0OnWire && p1OnWire) {
                wireToSplit = w;
                break;
            }
        }

        if (wireToSplit) {
            const wireStart = wireToSplit.path[0];
            const dist0 = Math.hypot(ports[0].x - wireStart.x, ports[0].y - wireStart.y);
            const dist1 = Math.hypot(ports[1].x - wireStart.x, ports[1].y - wireStart.y);
            let firstPort = ports[0];
            let secondPort = ports[1];
            if (dist1 < dist0) {
                firstPort = ports[1];
                secondPort = ports[0];
            }
            const w1: WireModel = { id: `wire_${Date.now()}_1`, compAId: wireToSplit.compAId, portAIndex: wireToSplit.portAIndex, compBId: comp.id, portBIndex: firstPort.id, anchor: null, path: [], selected: false, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 }, props: { ...wireToSplit.props } };
            const w2: WireModel = { id: `wire_${Date.now()}_2`, compAId: comp.id, portAIndex: secondPort.id, compBId: wireToSplit.compBId, portBIndex: wireToSplit.portBIndex, anchor: null, path: [], selected: false, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 }, props: { ...wireToSplit.props } };
            newWires = newWires.filter(w => w.id !== wireToSplit!.id).concat([w1, w2]);
            modified = true;
        }
    }

    if (!modified) {
        ports.forEach(port => {
             const threshold = 10;
             const targetWire = newWires.find(w => {
                if (w.compAId === comp.id && w.portAIndex === port.id) return false;
                if (w.compBId === comp.id && w.portBIndex === port.id) return false;
                for (let i = 0; i < w.path.length - 1; i++) {
                    const p1 = w.path[i];
                    const p2 = w.path[i+1];
                    if (distPointToSegment(port, p1, p2) < threshold) return true;
                }
                return false;
             });

             if (targetWire) {
                 const jId = `junc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                 const junction: ComponentModel = { id: jId, type: ComponentType.Junction, x: port.x, y: port.y, rotation: 0, state: false, props: { name: 'J' }, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 } };
                 newComponents.push(junction);
                 const wProps = { ...targetWire.props };
                 const w1: WireModel = { id: `w_${Date.now()}_1`, compAId: targetWire.compAId, portAIndex: targetWire.portAIndex, compBId: jId, portBIndex: 0, anchor: null, path: [], selected: false, simData: { ...targetWire.simData }, props: wProps };
                 const w2: WireModel = { id: `w_${Date.now()}_2`, compAId: jId, portAIndex: 0, compBId: targetWire.compBId, portBIndex: targetWire.portBIndex, anchor: null, path: [], selected: false, simData: { ...targetWire.simData }, props: wProps };
                 const w3: WireModel = { id: `w_${Date.now()}_3`, compAId: comp.id, portAIndex: port.id, compBId: jId, portBIndex: 0, anchor: null, path: [], selected: false, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 }, props: { name: 'Wire' } };
                 newWires = newWires.filter(w => w.id !== targetWire.id).concat([w1, w2, w3]);
                 modified = true;
             }
        });
    }

    if (modified) {
        updateStateWithHistory(newComponents, newWires);
    } else {
        // Just save the position change
        updateStateWithHistory(components, wires);
    }
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

          if (isSimulating) return; // Prevent editing during simulation
          if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedWithHistory();
          if (e.key === 'r' || e.key === 'R') rotateSelectedWithHistory();
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              if (e.shiftKey) redo();
              else undo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedWithHistory, rotateSelectedWithHistory, isSimulating, undo, redo]);

  const handleExport = () => {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const ensurePageSpace = (currentY: number, neededHeight: number, topMargin = 20) => {
          if (currentY + neededHeight <= pageHeight - 15) {
              return currentY;
          }
          doc.addPage();
          return topMargin;
      };

      const getDetailedCalculationNotebook = (component: ComponentModel) => {
          const fmt = (value: number, maxFractionDigits = 12) => {
              if (!Number.isFinite(value)) return '0';
              const normalized = Math.abs(value) < 1e-12 ? 0 : value;
              return normalized.toLocaleString('pt-BR', {
                  useGrouping: false,
                  maximumFractionDigits: maxFractionDigits
              });
          };

          const name = component.props.name || component.id.substring(0, 6);
          const V = component.simData.voltage || 0;
          const I = component.simData.current || 0;
          const P = component.simData.power || 0;

          const lines: string[] = [
              `Componente: ${name} (${component.type})`,
              `Dados da simulação: V = ${fmt(V)} V, I = ${fmt(I)} A, P = ${fmt(P)} W`
          ];

          if (component.type === ComponentType.Resistor) {
              const R = component.props.resistance || 0;
              const vFromOhm = I * R;
              const iFromOhm = R !== 0 ? V / R : 0;
              const pFromVI = V * I;
              const pFromI2R = I * I * R;
              const pFromV2R = R !== 0 ? (V * V) / R : 0;
              lines.push(
                  `1) Lei de Ohm (tensão): V = I × R`,
                  `   Substituindo: V = (${fmt(I)}) × (${fmt(R)})`,
                  `   Resultado: V = ${fmt(vFromOhm)} V`,
                  `2) Lei de Ohm (corrente): I = V / R`,
                  `   Substituindo: I = (${fmt(V)}) / (${fmt(R)})`,
                  `   Resultado: I = ${fmt(iFromOhm)} A`,
                  `3) Potência pela forma básica: P = V × I`,
                  `   Substituindo: P = (${fmt(V)}) × (${fmt(I)})`,
                  `   Resultado: P = ${fmt(pFromVI)} W`,
                  `4) Potência alternativa: P = I² × R`,
                  `   Substituindo: P = (${fmt(I)})² × (${fmt(R)})`,
                  `   Resultado: P = ${fmt(pFromI2R)} W`,
                  `5) Potência alternativa: P = V² / R`,
                  `   Substituindo: P = (${fmt(V)})² / (${fmt(R)})`,
                  `   Resultado: P = ${fmt(pFromV2R)} W`
              );
          } else if (component.type === ComponentType.Capacitor || component.type === ComponentType.PolarizedCapacitor) {
              const charge = (component.props.capacitance || 0) * V;
              lines.push(
                  `1) Estado transitório calculado pela engine canônica (engine/analysis/circuitEngine.ts).`,
                  `2) Carga estimada para referência visual: Q = C × V`,
                  `   Substituindo: Q = (${fmt(component.props.capacitance || 0)}) × (${fmt(V)})`,
                  `   Resultado: Q = ${fmt(charge)} C`,
                  `3) Potência instantânea monitorada: P = V × I = (${fmt(V)}) × (${fmt(I)}) = ${fmt(V * I)} W`
              );
          } else if (component.type === ComponentType.Inductor) {
              lines.push(
                  `1) Estado transitório calculado pela engine canônica (engine/analysis/circuitEngine.ts).`,
                  `2) Indutância configurada: L = ${fmt(component.props.inductance || 0)} H`,
                  `3) Potência instantânea monitorada: P = V × I = (${fmt(V)}) × (${fmt(I)}) = ${fmt(V * I)} W`
              );
          } else if (component.type === ComponentType.Battery || component.type === ComponentType.VCC || component.type === ComponentType.GND) {
              const sourceV = component.props.voltage || 0;
              const kind = component.type === ComponentType.Battery ? 'Fonte DC ideal' : `Pino ${component.type.toUpperCase()} (par de alimentação)`;
              lines.push(
                  `1) ${kind}: Vfonte = constante`,
                  `   Valor configurado: Vfonte = ${fmt(sourceV)} V`,
                  `2) Potência entregue/absorvida: P = V × I`,
                  `   Substituindo: P = (${fmt(V)}) × (${fmt(I)})`,
                  `   Resultado: P = ${fmt(V * I)} W`
              );
          } else if (component.type === ComponentType.ACSource) {
              const amplitude = component.props.amplitude || 0;
              const frequency = component.props.frequency || 0;
              const omega = 2 * Math.PI * frequency;
              const vrms = amplitude / Math.sqrt(2);
              lines.push(
                  `1) Fonte senoidal: v(t) = A × sen(ωt)`,
                  `   A = ${fmt(amplitude)} V, f = ${fmt(frequency)} Hz`,
                  `2) Frequência angular: ω = 2πf`,
                  `   Substituindo: ω = 2π × (${fmt(frequency)})`,
                  `   Resultado: ω = ${fmt(omega)} rad/s`,
                  `3) Tensão eficaz: Vrms = A/√2`,
                  `   Substituindo: Vrms = (${fmt(amplitude)})/√2`,
                  `   Resultado: Vrms = ${fmt(vrms)} V`,
                  `4) Potência instantânea no passo atual: P = V × I = (${fmt(V)}) × (${fmt(I)}) = ${fmt(V * I)} W`
              );
          } else if (component.type === ComponentType.Diode || component.type === ComponentType.LED) {
              const safeI = Math.abs(I) > 1e-12 ? I : 0;
              const rEq = safeI !== 0 ? V / safeI : Number.POSITIVE_INFINITY;
              if (component.type === ComponentType.LED) {
                  lines.push(
                      `1) LED modelado por Shockley + resistência série interna e resistor externo em série (engine/analysis/circuitEngine.ts).`,
                      `2) Queda medida no LED: ${fmt(V)} V`,
                      `3) Corrente medida no LED: ${fmt(I)} A`,
                      `4) Resistência equivalente no ponto de operação: ${Number.isFinite(rEq) ? `${fmt(rEq)} Ω` : '∞ Ω (bloqueado)'}`,
                      `5) Potência instantânea: P = V × I = (${fmt(V)}) × (${fmt(I)}) = ${fmt(V * I)} W`
                  );
              } else {
                  lines.push(
                      `1) Queda no diodo: Vd = V(anodo) - V(catodo) = ${fmt(V)} V`,
                      `2) Corrente no diodo: Id = ${fmt(I)} A`,
                      `3) Resistência equivalente no ponto de operação: R_eq = Vd/Id = ${Number.isFinite(rEq) ? `${fmt(rEq)} Ω` : '∞ Ω (bloqueado)'}`,
                      `4) Potência instantânea: P = V × I = (${fmt(V)}) × (${fmt(I)}) = ${fmt(V * I)} W`
                  );
              }
          } else {
              lines.push(
                  `1) Relação geral de potência: P = V × I`,
                  `   Substituindo: P = (${fmt(V)}) × (${fmt(I)})`,
                  `   Resultado: P = ${fmt(V * I)} W`
              );
          }

          return lines;
      };
      
      // 1. Title
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text("OhmicCAD Circuit Report", 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 26);

      // 2. Schematic Image (White Background)
      const LIGHT_THEME: Theme = {
          bg: '#ffffff',
          gridMajor: '#e0e0e0',
          gridMinor: '#f0f0f0',
          accent: '#ff9d00',
          selected: '#000000',
          wire: '#000000',
          wireSelected: '#000000',
          componentStroke: '#000000',
          componentFill: '#ffffff',
          text: '#000000',
          textSecondary: '#444444',
          background: '#ffffff'
      };

      const schematicDataUrl = canvasRef.current?.exportSchematic(LIGHT_THEME);
      let finalY = 30;

      if (schematicDataUrl) {
          const imgProps = doc.getImageProperties(schematicDataUrl);
          const imgWidth = pageWidth - 28;
          const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
          
          // Limit height to 40% of page
          const maxHeight = pageHeight * 0.4;
          let finalWidth = imgWidth;
          let finalHeight = imgHeight;
          
          if (finalHeight > maxHeight) {
              finalHeight = maxHeight;
              finalWidth = (imgProps.width * finalHeight) / imgProps.height;
          }
          
          doc.addImage(schematicDataUrl, 'PNG', 14, 35, finalWidth, finalHeight);
          finalY = 35 + finalHeight + 10;
      }

      // 3. Circuit Statistics
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Simulation Statistics", 14, finalY);
      
      jspdfAutotable(doc, {
          startY: finalY + 5,
          head: [['Metric', 'Value']],
          body: [
              ['Simulation Time', `${simTime.toFixed(6)} s`],
              ['Time Step (dt)', `${((1/1000) * appSettings.timeStepMultiplier).toExponential(2)} s`],
              ['Total Components', components.length.toString()],
              ['Total Wires', wires.length.toString()],
              ['Junctions', components.filter(c => c.type === ComponentType.Junction).length.toString()]
          ],
          theme: 'striped',
          headStyles: { fillColor: [60, 60, 60] },
          styles: { fontSize: 10, cellPadding: 3 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }
      });
      
      finalY = (doc as any).lastAutoTable.finalY + 15;

      // 4. Component Tables by Type
      const groupedComponents: Record<string, ComponentModel[]> = {};
      components.forEach(c => {
          if (c.type === ComponentType.Junction) return;
          if (!groupedComponents[c.type]) groupedComponents[c.type] = [];
          groupedComponents[c.type].push(c);
      });

      const typeLabels: Record<string, string> = {
          [ComponentType.Resistor]: 'Resistors',
          [ComponentType.Capacitor]: 'Capacitors',
          [ComponentType.Inductor]: 'Inductors',
          [ComponentType.Battery]: 'DC Sources',
          [ComponentType.ACSource]: 'AC Sources',
          [ComponentType.Diode]: 'Diodes',
          [ComponentType.LED]: 'LEDs',
          [ComponentType.Switch]: 'Switches',
          [ComponentType.Lamp]: 'Lamps'
      };

      Object.entries(groupedComponents).forEach(([type, comps]) => {
          if (comps.length === 0) return;

          // Check for page break
          if (finalY > pageHeight - 40) {
              doc.addPage();
              finalY = 20;
          }

          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          doc.text(typeLabels[type] || type, 14, finalY);

          let head = [['Name', 'Properties', 'Voltage (V)', 'Current (A)', 'Power (W)', 'Formula']];
          let body = comps.map(c => {
              const voltage = formatUnit(c.simData.voltage, 'V');
              const current = formatUnit(c.simData.current, 'A');
              const power = formatUnit(c.simData.power, 'W');
              
              let props = '';
              let formula = '';

              if (c.type === ComponentType.Resistor) {
                  props = `R = ${formatUnit(c.props.resistance || 0, 'Ω')}`;
                  formula = 'V = I × R\nP = V × I';
              } else if (c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) {
                  props = `C = ${formatUnit(c.props.capacitance || 0, 'F')}`;
                  formula = 'Transitório via engine\nP = V × I';
              } else if (c.type === ComponentType.Inductor) {
                  props = `L = ${formatUnit(c.props.inductance || 0, 'H')}`;
                  formula = 'Transitório via engine\nP = V × I';
              } else if (c.type === ComponentType.Battery) {
                  props = `V = ${formatUnit(c.props.voltage || 0, 'V')}`;
                  formula = 'Source';
              } else if (c.type === ComponentType.ACSource) {
                  props = `${formatUnit(c.props.amplitude || 0, 'V')} @ ${formatUnit(c.props.frequency || 0, 'Hz')}`;
                  formula = 'V(t) = A sin(wt)';
              } else if (c.type === ComponentType.Diode) {
                  props = c.props.diodeType || 'Rectifier';
                  formula = 'Shockley Eq.';
              } else if (c.type === ComponentType.LED) {
                  props = `Vmax = ${formatUnit(c.props.maxVoltage ?? c.props.voltageDrop ?? 2.2, 'V')} / If = ${formatUnit(c.props.currentRating ?? 0.01, 'A')} / Rserie = ${formatUnit(c.props.ledSeriesResistance ?? 330, 'Ω')}`;
                  formula = 'Modelo não linear via engine (V e I calculados pelo circuito)';
              }

              return [
                  c.props.name || c.id.substring(0, 6),
                  props,
                  voltage,
                  current,
                  power,
                  formula
              ];
          });

          jspdfAutotable(doc, {
              startY: finalY + 5,
              head: head,
              body: body,
              theme: 'grid',
              headStyles: { fillColor: [41, 128, 185], halign: 'center' },
              styles: { fontSize: 9, cellPadding: 4, valign: 'middle', halign: 'center' },
              columnStyles: {
                  0: { fontStyle: 'bold', halign: 'left' }, // Name
                  1: { halign: 'left' }, // Properties
                  5: { fontStyle: 'italic', textColor: [100, 100, 100] } // Formula
              }
          });

          finalY = (doc as any).lastAutoTable.finalY + 15;
      });

      // 5. Caderno de cálculos detalhado (passo a passo)
      doc.addPage();
      finalY = 20;
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Caderno de Cálculos (detalhado)', 14, finalY);
      finalY += 8;

      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      const intro = 'Nesta seção cada componente apresenta substituição numérica e resultado intermediário, em formato conta a conta.';
      const introLines = doc.splitTextToSize(intro, pageWidth - 28);
      doc.text(introLines, 14, finalY);
      finalY += introLines.length * 5 + 6;

      const reportableComponents = components.filter(c => c.type !== ComponentType.Junction);
      reportableComponents.forEach((component, index) => {
          const notebookLines = getDetailedCalculationNotebook(component);

          const estimatedHeight = 12 + notebookLines.length * 5;
          finalY = ensurePageSpace(finalY, estimatedHeight, 20);

          doc.setFontSize(12);
          doc.setTextColor(20, 20, 20);
          doc.text(`${index + 1}. ${component.props.name || component.id.substring(0, 6)}`, 14, finalY);
          finalY += 6;

          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          notebookLines.forEach((line) => {
              const wrapped = doc.splitTextToSize(line, pageWidth - 28);
              finalY = ensurePageSpace(finalY, wrapped.length * 5 + 1, 20);
              doc.text(wrapped, 14, finalY);
              finalY += wrapped.length * 5;
          });

          finalY += 4;
      });
      
      doc.save(`ohmic_report_${Date.now()}.pdf`);
  };

  const handleContextMenu = (x: number, y: number, id: string) => {
      setContextMenu({ x, y, id });
      setEditPanel(null); // Close edit panel if open
  };

  const handleEditClick = () => {
      if (contextMenu) {
          setEditPanel({ x: contextMenu.x, y: contextMenu.y, id: contextMenu.id });
          setContextMenu(null);
      }
  };

  const handleAddGraph = (type: 'voltage' | 'current') => {
      if (editPanel) {
          const color = type === 'voltage' ? '#00e5ff' : '#ff9d00';
          setGraphs(prev => [...prev, { 
              id: Date.now().toString(), 
              componentId: editPanel.id, 
              type, 
              color 
          }]);
          setEditPanel(null);
      }
  };

  const handleLoadCircuit = (id: string, data?: () => { components: ComponentModel[]; wires: WireModel[] }, usageHint?: string) => {
      if (data) {
          const circuit = data(); // Assuming data is a generator function
          updateStateWithHistory(circuit.components, circuit.wires);
          const hint = usageHint ? ` Dica: ${usageHint}` : '';
          setStatusMsg(`Loaded example: ${id}.${hint}`);
          setShowLibrary(false);
          resetSimulation();
      } else {
          setStatusMsg(`Example '${id}' not implemented yet.`);
      }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1a1a] select-none" onClick={() => { setContextMenu(null); if (!editPanel) setEditPanel(null); }}>
      <Sidebar onPlace={(type) => !isSimulating && setPlacementMode({ type, rotation: 0 })} isSimulating={isSimulating} />
      <div className="flex-1 relative h-full flex flex-col min-w-0">
        
        {/* Top Bar */}
        <div className="absolute top-4 left-4 z-40 flex gap-2 pointer-events-auto">
             <button 
                onClick={() => setShowLibrary(true)}
                className="px-3 py-2 bg-[#252525] border border-zinc-700 hover:bg-zinc-700 text-white text-xs font-bold rounded shadow-lg flex items-center gap-2 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                Circuits
            </button>
        </div>

        <CircuitCanvas 
            ref={canvasRef} 
            components={components} 
            wires={wires} 
            view={view} 
            setView={setView} 
            isSimulating={isSimulating} 
            placementMode={placementMode} 
            setPlacementMode={setPlacementMode} 
            selectedIds={selectedIds} 
            setSelectedIds={setSelectedIds} 
            onAddComponent={addComponentWithHistory} 
            onAddWire={addWireWithHistory} 
            onWireJoin={handleWireJoinWithHistory} 
            onRotateSelected={rotateSelectedWithHistory} 
            onDragEnd={handleDragEndWithHistory} 
            connectionStart={connectionStart} 
            setConnectionStart={setConnectionStart} 
            setComponents={setComponents} 
            setWires={setWires} 
            getAbsPorts={getAbsPorts} 
            onOpenProperties={() => setShowProperties(true)} 
            onCloseProperties={() => setShowProperties(false)} 
            onContextMenu={handleContextMenu}
            isPaused={isPaused}
            appSettings={appSettings} 
        />
        
        {/* Context Menu */}
        {contextMenu && (
            <div 
                className="absolute z-50 bg-[#252525] border border-zinc-700 rounded shadow-xl py-1 min-w-[120px]"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onClick={(e) => e.stopPropagation()}
            >
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    onClick={handleEditClick}
                >
                    Edit
                </button>
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    onClick={() => { rotateSelectedWithHistory(contextMenu.id); setContextMenu(null); }}
                >
                    Rotate
                </button>
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 hover:text-red-300"
                    onClick={() => { deleteSelectedWithHistory(); setContextMenu(null); }}
                >
                    Delete
                </button>
            </div>
        )}

        {/* Edit Panel (Tab) */}
        {editPanel && (
            <div 
                className="absolute z-50 bg-[#252525] border border-zinc-700 rounded shadow-xl p-2 flex flex-col gap-2"
                style={{ top: editPanel.y, left: editPanel.x + 20 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">Add Graph</div>
                <button 
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 text-xs rounded border border-zinc-700"
                    onClick={() => handleAddGraph('voltage')}
                >
                    Voltage Graph
                </button>
                <button 
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-orange-400 text-xs rounded border border-zinc-700"
                    onClick={() => handleAddGraph('current')}
                >
                    Current Graph
                </button>
                <button 
                    className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
                    onClick={() => setEditPanel(null)}
                >
                    Close
                </button>
            </div>
        )}

        {/* Graph Panel */}
        <GraphPanel 
            graphs={graphs} 
            components={components} 
            graphData={graphData}
            onRemoveGraph={(id) => setGraphs(prev => prev.filter(g => g.id !== id))}
        />

        <div className="absolute top-6 right-6 z-10 flex items-center gap-2 bg-[#252525] border border-zinc-700 p-1.5 rounded-lg shadow-2xl">
            <div className="flex items-center gap-1 mr-2 border-r border-zinc-700 pr-2">
                <button onClick={undo} disabled={historyIndex <= 0} className={`p-1.5 rounded ${historyIndex > 0 ? 'text-zinc-400 hover:bg-zinc-700 hover:text-white' : 'text-zinc-700 cursor-not-allowed'}`} title="Undo (Ctrl+Z)">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                </button>
                <button onClick={redo} disabled={historyIndex >= history.length - 1} className={`p-1.5 rounded ${historyIndex < history.length - 1 ? 'text-zinc-400 hover:bg-zinc-700 hover:text-white' : 'text-zinc-700 cursor-not-allowed'}`} title="Redo (Ctrl+Shift+Z)">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
                </button>
            </div>
            <div className="px-2 font-mono text-xs text-orange-500 font-bold">{simTime.toFixed(2)}s</div>
            <button onClick={resetSimulation} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400" title="Reset"><svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></button>
            <button 
                onClick={() => {
                    if (!isSimulating) {
                        setIsSimulating(true);
                        setIsPaused(false);
                        setShowProperties(false);
                        return;
                    }
                    setIsPaused(prev => !prev);
                }}
                className={`px-3 py-1.5 rounded font-bold text-[10px] uppercase ${!isSimulating ? 'bg-green-500/10 text-green-500' : isPaused ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'}`}
            >
                {!isSimulating ? 'Run' : (isPaused ? 'Resume' : 'Pause')}
            </button>
            <button onClick={() => setShowSettingsModal(!showSettingsModal)} className={`p-1.5 rounded ${showSettingsModal ? 'text-orange-500 bg-zinc-700' : 'text-zinc-400 hover:bg-zinc-700'}`} title="Settings"><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg></button>
        </div>
        {showSettingsModal && (
            <div className="absolute top-16 right-6 z-20 w-64 bg-[#252525] border border-zinc-700 rounded-lg shadow-2xl p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-zinc-400 uppercase font-bold">
                        <span>Simulation Speed</span>
                        <span>{appSettings.visualFlowSpeed >= 20000 ? 'Instant (Real-time)' : `${(appSettings.visualFlowSpeed / 2000).toFixed(1)}x`}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        step="1"
                        value={appSettings.visualFlowSpeed >= 20000 ? 10 : appSettings.visualFlowSpeed / 2000} 
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setAppSettings(prev => ({ ...prev, visualFlowSpeed: val === 10 ? 20000 : val * 2000 }));
                        }}
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
                     <label className="flex items-center justify-between text-zinc-400 text-sm cursor-pointer hover:text-white">
                        <span>Direction Arrows</span>
                        <input type="checkbox" checked={!!appSettings.showDirectionArrows} onChange={e => setAppSettings(p => ({...p, showDirectionArrows: e.target.checked}))} className="accent-orange-500" />
                     </label>
                     <label className="flex items-center justify-between text-zinc-400 text-sm cursor-pointer hover:text-white gap-3">
                        <span>Current Mode</span>
                        <select
                            value={appSettings.currentFlowMode}
                            onChange={e => setAppSettings(p => ({ ...p, currentFlowMode: e.target.value as AppSettings['currentFlowMode'] }))}
                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-orange-500"
                        >
                            <option value="conventional">Conventional</option>
                            <option value="real">Real (electrons)</option>
                        </select>
                     </label>
                     <label className="flex items-center justify-between text-zinc-400 text-sm cursor-pointer hover:text-white">
                        <span>Smooth Wires</span>
                        <input type="checkbox" checked={!!appSettings.smoothWires} onChange={e => setAppSettings(p => ({...p, smoothWires: e.target.checked}))} className="accent-orange-500" />
                     </label>
                </div>
                <div className="border-t border-zinc-700 pt-3">
                    <button onClick={handleExport} className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold uppercase rounded transition-colors flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Export Schematic & Data
                    </button>
                </div>
            </div>
        )}
        {showLibrary && (
            <CircuitLibraryModal 
                onClose={() => setShowLibrary(false)} 
                onLoadCircuit={handleLoadCircuit} 
            />
        )}
        {showProperties && selectedIds.length > 0 && <div className="absolute top-0 right-0 bottom-0 z-20"><PropertiesPanel target={components.find(c => c.id === selectedIds[0]) || wires.find(w => w.id === selectedIds[0])} onUpdateCompProps={(id, p) => setComponents(prev => prev.map(c => c.id === id ? { ...c, props: { ...c.props, ...p } } : c))} onUpdateWireProps={(id, p) => setWires(prev => prev.map(w => w.id === id ? { ...w, props: { ...w.props, ...p } } : w))} /></div>}
      </div>
    </div>
  );
};

export default App;
