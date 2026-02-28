
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { 
  ComponentModel, WireModel, ViewState, ComponentType, 
  THEME, GRID_SIZE, GRID_STEP, Port, AppSettings, SimData
} from '../types';
import { rotatePoint, distPointToSegment, findSmartPath } from '../utils/geometry';
import { formatUnit } from '../utils/formatting';

interface CircuitCanvasProps {
  components: ComponentModel[];
  wires: WireModel[];
  view: ViewState;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  isSimulating: boolean;
  placementMode: { type: ComponentType; rotation: number } | null;
  setPlacementMode: React.Dispatch<React.SetStateAction<{ type: ComponentType; rotation: number } | null>>;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  onAddComponent: (type: ComponentType, x: number, y: number, rotation: number, splitWire?: WireModel) => void;
  onAddWire: (start: { compId: string; portId: number }, end: { compId: string; portId: number }) => void;
  onWireJoin: (wire: WireModel, point: {x: number, y: number}) => void;
  onRotateSelected: (id?: string) => void;
  connectionStart: { compId: string; portId: number } | null;
  setConnectionStart: React.Dispatch<React.SetStateAction<{ compId: string; portId: number } | null>>;
  setComponents: React.Dispatch<React.SetStateAction<ComponentModel[]>>;
  setWires: React.Dispatch<React.SetStateAction<WireModel[]>>;
  getAbsPorts: (c: ComponentModel) => Port[];
  onOpenProperties: () => void;
  onCloseProperties: () => void;
  appSettings: AppSettings;
}

export interface CircuitCanvasHandle {
  exportImage: () => string | null;
}

export const CircuitCanvas = forwardRef<CircuitCanvasHandle, CircuitCanvasProps>(({
  components, wires, view, setView, placementMode, setPlacementMode,
  selectedIds, setSelectedIds, onAddComponent, onAddWire, onWireJoin, onRotateSelected, connectionStart, setConnectionStart,
  setComponents, setWires, getAbsPorts, onOpenProperties, onCloseProperties, isSimulating, appSettings
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseWorldRef = useRef({ x: 0, y: 0 });
  const dragStartMouseRef = useRef({ x: 0, y: 0 });
  const dragStartPosRef = useRef<Map<string, {x: number, y: number}>>(new Map());
  const [isPanning, setIsPanning] = useState(false);
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ start: { x: number, y: number }, end: { x: number, y: number } } | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const viewRef = useRef(view);
  const visualTimeRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [activeButtonId, setActiveButtonId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
      if (activeButtonId) {
          const handleUp = () => {
              setComponents(prev => prev.map(c => c.id === activeButtonId ? { ...c, props: { ...c.props, closed: false } } : c));
              setActiveButtonId(null);
          };
          window.addEventListener('mouseup', handleUp);
          return () => window.removeEventListener('mouseup', handleUp);
      }
  }, [activeButtonId, setComponents]);

  useImperativeHandle(ref, () => ({
    exportImage: () => canvasRef.current?.toDataURL('image/png') || null
  }));

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === 'Space' && setIsSpacePressed(true);
    const up = (e: KeyboardEvent) => e.code === 'Space' && setIsSpacePressed(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (sx - rect.left - viewRef.current.x) / viewRef.current.scale, 
      y: (sy - rect.top - viewRef.current.y) / viewRef.current.scale
    };
  }, []);

  const worldToGrid = useCallback((x: number, y: number) => ({
    x: Math.round(x / GRID_STEP) * GRID_STEP, y: Math.round(y / GRID_STEP) * GRID_STEP
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const updateSize = () => {
        canvas.width = parent.clientWidth; canvas.height = parent.clientHeight;
    };
    const obs = new ResizeObserver(() => window.requestAnimationFrame(updateSize));
    obs.observe(parent);
    updateSize();
    return () => obs.disconnect();
  }, []);

  const findPortAt = useCallback((wx: number, wy: number) => {
    for (const c of components) {
      const ports = getAbsPorts(c);
      for (const p of ports) if (Math.hypot(wx - p.x, wy - p.y) < 15) return { compId: c.id, portId: p.id, x: p.x, y: p.y };
    }
    return null;
  }, [components, getAbsPorts]);

  const findWireAt = (wx: number, wy: number) => {
    for (const w of wires) {
        if (w.path.length < 2) continue;
        for (let i = 0; i < w.path.length - 1; i++) {
            const p1 = w.path[i], p2 = w.path[i+1];
            if (distPointToSegment({x: wx, y: wy}, p1, p2) < 10) return { wire: w, point: p1 };
        }
    }
    return null;
  };

  const drawComponent = (ctx: CanvasRenderingContext2D, c: ComponentModel, isSel: boolean) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((c.rotation * Math.PI) / 2);
    
    ctx.strokeStyle = isSel ? THEME.selected : THEME.componentStroke;
    ctx.lineWidth = isSel ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (c.type) {
      case ComponentType.Battery:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-5, 0); ctx.moveTo(40, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(-5, 10); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, -20); ctx.lineTo(5, 20); ctx.stroke();
        // Plus sign
        ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, -12); ctx.lineTo(14, -12); ctx.moveTo(12, -14); ctx.lineTo(12, -10); ctx.stroke();
        ctx.strokeStyle = isSel ? THEME.selected : THEME.componentStroke;
        break;

      case ComponentType.Resistor:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-24, 0);
        for (let i = 0; i < 6; i++) ctx.lineTo(-18 + i * 7.2, i % 2 === 0 ? -10 : 10);
        ctx.lineTo(24, 0); ctx.lineTo(40, 0); ctx.stroke();
        break;

      case ComponentType.Capacitor:
      case ComponentType.PolarizedCapacitor:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-5, 0); ctx.moveTo(40, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(-5, 15); ctx.stroke();
        if (c.type === ComponentType.PolarizedCapacitor) {
            // Curved plate (negative) - concave towards the flat plate
            ctx.beginPath(); ctx.arc(18, 0, 15, Math.PI * 0.75, Math.PI * 1.25); ctx.stroke();
            // Plus sign near the positive terminal
            ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.5;
            ctx.beginPath(); 
            ctx.moveTo(-15, -15); ctx.lineTo(-9, -15); 
            ctx.moveTo(-12, -18); ctx.lineTo(-12, -12); 
            ctx.stroke();
            ctx.strokeStyle = isSel ? THEME.selected : THEME.componentStroke;
        } else {
            ctx.beginPath(); ctx.moveTo(5, -15); ctx.lineTo(5, 15); ctx.stroke();
        }
        break;

      case ComponentType.Inductor:
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-20, 0);
        // Draw loops
        for (let i = 0; i < 4; i++) {
            ctx.arc(-15 + i * 10, 0, 5, Math.PI, 0); 
        }
        ctx.moveTo(20, 0); ctx.lineTo(40, 0);
        ctx.stroke();
        break;

      case ComponentType.ACSource:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); ctx.moveTo(40, 0); ctx.lineTo(15, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
        // Sine wave
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.bezierCurveTo(-4, -8, 0, 8, 4, 0);
        ctx.bezierCurveTo(6, -4, 8, 0, 8, 0); // Simplified
        ctx.stroke();
        break;

      case ComponentType.Switch:
        // Terminals
        ctx.beginPath(); 
        ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); 
        ctx.moveTo(40, 0); ctx.lineTo(15, 0); 
        ctx.stroke();
        
        // Dots
        ctx.beginPath(); 
        ctx.arc(-15, 0, 3, 0, Math.PI * 2); 
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(15, 0, 3, 0, Math.PI * 2); 
        ctx.stroke();
        
        // Lever
        ctx.beginPath();
        if (c.props.closed) {
            ctx.moveTo(-15, 0);
            ctx.lineTo(15, 0);
        } else {
            ctx.moveTo(-15, 0);
            ctx.lineTo(12, -18);
        }
        ctx.stroke();
        break;

      case ComponentType.PushButton:
        // Terminals
        ctx.beginPath(); 
        ctx.moveTo(-40, 0); ctx.lineTo(-10, 0); 
        ctx.moveTo(40, 0); ctx.lineTo(10, 0); 
        ctx.stroke();
        
        // Dots
        ctx.beginPath(); 
        ctx.arc(-10, 0, 3, 0, Math.PI * 2); 
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(10, 0, 3, 0, Math.PI * 2); 
        ctx.stroke();
        
        // Bridge
        const yOff = c.props.closed ? 0 : -8;
        ctx.beginPath();
        ctx.moveTo(-10, yOff);
        ctx.lineTo(10, yOff);
        ctx.moveTo(0, yOff);
        ctx.lineTo(0, yOff - 12);
        ctx.stroke();
        break;

      case ComponentType.Junction:
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        break;

      case ComponentType.Diode:
      case ComponentType.LED:
        // Terminals
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); ctx.moveTo(40, 0); ctx.lineTo(15, 0); ctx.stroke();
        
        // Triangle
        ctx.beginPath();
        ctx.moveTo(-15, -15);
        ctx.lineTo(-15, 15);
        ctx.lineTo(15, 0);
        ctx.closePath();
        ctx.stroke();
        
        // Cathode Line
        ctx.beginPath();
        if (c.props.diodeType === 'zener') {
            ctx.moveTo(15, -15); ctx.lineTo(15, 15);
            ctx.moveTo(15, -15); ctx.lineTo(10, -20); // Z wing
            ctx.moveTo(15, 15); ctx.lineTo(20, 20);   // Z wing
        } else if (c.props.diodeType === 'schottky') {
            ctx.moveTo(15, -15); ctx.lineTo(15, 15);
            ctx.moveTo(15, -15); ctx.lineTo(20, -15); ctx.lineTo(20, -10); // S wing
            ctx.moveTo(15, 15); ctx.lineTo(10, 15); ctx.lineTo(10, 10);   // S wing
        } else {
            // Rectifier / LED
            ctx.moveTo(15, -15); ctx.lineTo(15, 15);
        }
        ctx.stroke();

        // LED Arrows
        if (c.type === ComponentType.LED) {
            const color = c.props.color || '#00e5ff'; // Default light blue
            ctx.strokeStyle = color;
            
            // Calculate intensity based on current
            const current = isSimulating ? Math.max(0, c.simData.current) : 0;
            const maxCurrent = c.props.maxCurrent || 0.02; 
            const threshold = 1e-4; // 0.1mA to start visible glow
            
            let intensity = 0;
            if (current > threshold) {
                 intensity = Math.min(1, (current - threshold) / (maxCurrent - threshold));
            }

            // Fill the triangle for LED
            ctx.beginPath();
            ctx.moveTo(-15, -15);
            ctx.lineTo(-15, 15);
            ctx.lineTo(15, 0);
            ctx.closePath();
            
            if (intensity > 0) {
                ctx.fillStyle = color;
                // Use globalAlpha to simulate dimming
                ctx.globalAlpha = 0.4 + (0.6 * intensity);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                
                ctx.shadowColor = color;
                ctx.shadowBlur = 5 + (25 * intensity);
            } else {
                ctx.fillStyle = '#222'; // Dark fill when off
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            
            ctx.beginPath();
            ctx.moveTo(5, -20); ctx.lineTo(15, -30);
            ctx.moveTo(15, -30); ctx.lineTo(10, -30);
            ctx.moveTo(15, -30); ctx.lineTo(15, -25);
            
            ctx.moveTo(10, -15); ctx.lineTo(20, -25);
            ctx.moveTo(20, -25); ctx.lineTo(15, -25);
            ctx.moveTo(20, -25); ctx.lineTo(20, -20);
            ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isSel ? THEME.selected : THEME.componentStroke;
        }
        break;

      case ComponentType.Lamp:
        // Terminals
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-20, 0); ctx.moveTo(40, 0); ctx.lineTo(20, 0); ctx.stroke();
        
        // Circle
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); 
        if (isSimulating && Math.abs(c.simData.power) > 0.01) { // Glow if power > 10mW
            const intensity = Math.min(1, Math.abs(c.simData.power) * 5);
            ctx.fillStyle = `rgba(255, 255, 200, ${intensity})`;
            ctx.shadowColor = '#ffffaa';
            ctx.shadowBlur = 20 * intensity;
            ctx.fill();
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // X
        ctx.beginPath();
        const r = 14; // radius * 0.707
        ctx.moveTo(-r, -r); ctx.lineTo(r, r);
        ctx.moveTo(r, -r); ctx.lineTo(-r, r);
        ctx.stroke();
        break;
    }
    ctx.restore();
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = Date.now();
    const dt = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;
    if (isSimulating) visualTimeRef.current += dt * appSettings.visualFlowSpeed;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    if (appSettings.showGrid) {
        const left = -view.x / view.scale, top = -view.y / view.scale;
        const right = (canvas.width - view.x) / view.scale, bottom = (canvas.height - view.y) / view.scale;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.floor(left / GRID_SIZE) * GRID_SIZE; x < right; x += GRID_SIZE) {
            ctx.strokeStyle = x % (GRID_SIZE * 5) === 0 ? THEME.gridMajor : THEME.gridMinor;
            ctx.moveTo(x, top); ctx.lineTo(x, bottom);
        }
        for (let y = Math.floor(top / GRID_SIZE) * GRID_SIZE; y < bottom; y += GRID_SIZE) {
            ctx.strokeStyle = y % (GRID_SIZE * 5) === 0 ? THEME.gridMajor : THEME.gridMinor;
            ctx.moveTo(left, y); ctx.lineTo(right, y);
        }
        ctx.stroke();
    }

    wires.forEach(w => {
        const isSelected = selectedIds.includes(w.id);
        ctx.strokeStyle = isSelected ? THEME.wireSelected : THEME.wire;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath(); w.path.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
        if (isSimulating && appSettings.showCurrent && Math.abs(w.simData.current) > 1e-6) {
            const currentDir = Math.sign(w.simData.current);
            // visualTimeRef already accumulates (dt * visualFlowSpeed)
            // So we just multiply by current to get distance
            const distance = visualTimeRef.current * Math.abs(w.simData.current);
            
            ctx.fillStyle = '#ff0000'; // Red dots
            for (let i = 0; i < w.path.length - 1; i++) {
                const p1 = w.path[i], p2 = w.path[i+1];
                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const step = 20;
                for (let d = distance % step; d < segLen; d += step) {
                    const t = currentDir > 0 ? d / segLen : 1 - (d / segLen);
                    ctx.beginPath(); ctx.arc(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, 1.5, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
    });

    components.forEach(c => {
        drawComponent(ctx, c, selectedIds.includes(c.id));

        // Current Flow Visualization inside Component
        if (isSimulating && appSettings.showCurrent && Math.abs(c.simData.current) > 1e-6) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate((c.rotation * Math.PI) / 2);

            const currentDir = Math.sign(c.simData.current);
            const distance = visualTimeRef.current * Math.abs(c.simData.current);
            
            let path: {x: number, y: number}[] = [];
            
            // Define internal paths for current flow
            if (c.type === ComponentType.Resistor || c.type === ComponentType.Battery || 
                c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) {
                path = [{x: -40, y: 0}, {x: 40, y: 0}];
            } else if ((c.type === ComponentType.Switch || c.type === ComponentType.PushButton) && c.props.closed) {
                 path = [{x: -40, y: 0}, {x: 40, y: 0}];
            }

            if (path.length > 0) {
                ctx.fillStyle = '#ff0000'; 
                const p1 = path[0], p2 = path[1];
                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const step = 20;
                
                for (let d = distance % step; d < segLen; d += step) {
                    const t = currentDir > 0 ? d / segLen : 1 - (d / segLen);
                    ctx.beginPath(); 
                    ctx.arc(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, 1.5, 0, Math.PI * 2); 
                    ctx.fill();
                }
            }
            ctx.restore();
        }

        // Draw Labels
        if (appSettings.showLabels && c.type !== ComponentType.Junction) {
            ctx.save();
            ctx.translate(c.x, c.y);
            // We do NOT rotate here so text stays upright relative to the screen
            
            ctx.fillStyle = '#aaaaaa';
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            
            let label = c.props.name || '';
            let valueStr = '';
            
            if (c.type === ComponentType.Resistor && c.props.resistance !== undefined) {
                valueStr = formatUnit(c.props.resistance, 'Ω');
            } else if (c.type === ComponentType.Battery && c.props.voltage !== undefined) {
                valueStr = formatUnit(c.props.voltage, 'V');
            } else if ((c.type === ComponentType.Capacitor || c.type === ComponentType.PolarizedCapacitor) && c.props.capacitance !== undefined) {
                const unit = c.props.capacitanceUnit || 'µF';
                let mult = 1e-6;
                if (unit === 'mF') mult = 1e-3;
                if (unit === 'nF') mult = 1e-9;
                if (unit === 'pF') mult = 1e-12;
                valueStr = formatUnit(c.props.capacitance * mult, 'F');
            } else if (c.type === ComponentType.Inductor && c.props.inductance !== undefined) {
                valueStr = formatUnit(c.props.inductance, 'H');
            } else if (c.type === ComponentType.ACSource) {
                if (c.props.amplitude !== undefined) valueStr += formatUnit(c.props.amplitude, 'V');
                if (c.props.frequency !== undefined) valueStr += ` ${formatUnit(c.props.frequency, 'Hz')}`;
            }
            
            const text = `${label}   ${valueStr}`.trim();
            if (text) {
                // Smart positioning based on rotation
                if (c.rotation % 2 === 0) {
                    // Horizontal (0 or 180 deg) - Place label above
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(text, 0, -20);
                } else {
                    // Vertical (90 or 270 deg) - Place label to the right
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, 20, 0);
                }
            }
            ctx.restore();
        }
    });

    if (connectionStart) {
        ctx.strokeStyle = THEME.selected; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        const startComp = components.find(c => c.id === connectionStart.compId)!;
        const startPort = getAbsPorts(startComp).find(p => p.id === connectionStart.portId)!;
        ctx.beginPath(); ctx.moveTo(startPort.x, startPort.y); ctx.lineTo(mouseWorldRef.current.x, mouseWorldRef.current.y); ctx.stroke();
        ctx.setLineDash([]);
    }

    if (placementMode) {
        const grid = worldToGrid(mouseWorldRef.current.x, mouseWorldRef.current.y);
        ctx.globalAlpha = 0.5; drawComponent(ctx, { ...placementMode, id: 'ghost', x: grid.x, y: grid.y, state: false, props: {}, simData: {} } as any, false); ctx.globalAlpha = 1.0;
    }

    if (selectionRect) {
        ctx.strokeStyle = THEME.selected;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            selectionRect.start.x, 
            selectionRect.start.y, 
            selectionRect.end.x - selectionRect.start.x, 
            selectionRect.end.y - selectionRect.start.y
        );
        ctx.fillStyle = 'rgba(0, 229, 255, 0.1)';
        ctx.fillRect(
            selectionRect.start.x, 
            selectionRect.start.y, 
            selectionRect.end.x - selectionRect.start.x, 
            selectionRect.end.y - selectionRect.start.y
        );
        ctx.setLineDash([]);
    }

    if ((hoveredId || selectedIds.length === 1) && isSimulating) {
        const targetId = hoveredId || selectedIds[0];
        const target = components.find(c => c.id === targetId) || wires.find(w => w.id === targetId);
        if (target) {
            const x = 'x' in target ? target.x : (target as WireModel).path[0].x;
            const y = 'y' in target ? target.y : (target as WireModel).path[0].y;
            
            const lines: string[] = [];
            // Name / Type
            lines.push(target.props.name || ('type' in target ? (target as ComponentModel).type : 'Wire'));
            
            // Current
            lines.push(`I = ${formatUnit(target.simData.current, 'A')}`);
            
            // Voltage Drop
            lines.push(`V = ${formatUnit(target.simData.voltage, 'V')}`);
            
            if ('type' in target && (target as ComponentModel).type === ComponentType.ACSource) {
                 const amp = (target as ComponentModel).props.amplitude || 0;
                 lines.push(`Vpk = ${formatUnit(amp, 'V')}`);
                 lines.push(`Vrms = ${formatUnit(amp / Math.sqrt(2), 'V')}`);
            }

            // Resistance (if applicable)
            
            // Resistance (if applicable)
            if ('type' in target) {
                if ('resistance' in target.props && typeof target.props.resistance === 'number') {
                    lines.push(`R = ${formatUnit(target.props.resistance, 'Ω')}`);
                }
                // Power
                lines.push(`P = ${formatUnit(target.simData.power, 'W')}`);
            }

            const lineHeight = 16;
            const padding = 12;
            const boxHeight = lines.length * lineHeight + padding * 2;
            const boxWidth = 140;

            // Draw tooltip box above the component
            const boxX = x + 15;
            const boxY = y - boxHeight - 15;

            ctx.fillStyle = 'rgba(10, 10, 10, 0.9)'; 
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fff'; 
            ctx.font = '11px JetBrains Mono';
            ctx.textBaseline = 'top';
            
            lines.forEach((line, i) => {
                ctx.fillStyle = i === 0 ? '#888' : '#fff'; // Dim the name slightly
                ctx.fillText(line, boxX + padding, boxY + padding + i * lineHeight);
            });
        }
    }

    ctx.restore();
    // Remove requestAnimationFrame(render) from here, let useEffect handle the loop
  }, [components, wires, view, selectedIds, connectionStart, placementMode, isSimulating, appSettings, worldToGrid, findPortAt, getAbsPorts, selectionRect, draggingCompId, isPanning]);

  useEffect(() => {
    let animationFrameId: number;
    
    const loop = () => {
        render();
        animationFrameId = requestAnimationFrame(loop);
    };
    
    loop();
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [render]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (placementMode && (e.key === 'r' || e.key === 'R')) {
            setPlacementMode(prev => prev ? { ...prev, rotation: (prev.rotation + 1) % 4 } : null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placementMode, setPlacementMode]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    
    // Middle mouse button (button 1 or which 2) or Space + Left click
    if (isSpacePressed || e.button === 1 || e.nativeEvent.which === 2) { 
        e.preventDefault();
        setIsPanning(true); 
        return; 
    }
    
    if (e.button === 2) {
        if (placementMode) {
            e.preventDefault();
            setPlacementMode(prev => prev ? { ...prev, rotation: (prev.rotation + 1) % 4 } : null);
            return;
        }

        if (isSimulating) return; // Prevent context menu/rotation during simulation

        const comp = components.find(c => Math.hypot(c.x - world.x, c.y - world.y) < 30);
        if (comp) {
            setSelectedIds([comp.id]);
            onRotateSelected(comp.id);
            onOpenProperties();
        }
        return;
    }

    const port = findPortAt(world.x, world.y);
    if (port) { 
        if (!isSimulating) setConnectionStart(port); 
        return; 
    }
    
    const comp = components.find(c => Math.hypot(c.x - world.x, c.y - world.y) < 30);
    if (comp) {
        if (!selectedIds.includes(comp.id)) {
            setSelectedIds([comp.id]);
        }
        if (isSimulating) {
            // Allow interaction with switches/buttons during simulation
            if (comp.type === ComponentType.Switch || comp.type === ComponentType.PushButton) {
                if (comp.type === ComponentType.Switch) {
                    setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, props: { ...c.props, closed: !c.props.closed } } : c));
                } else {
                    setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, props: { ...c.props, closed: true } } : c));
                    setActiveButtonId(comp.id);
                }
            }
            // Do not allow dragging or opening properties during simulation
            return;
        } else { 
            setDraggingCompId(comp.id); 
            dragStartMouseRef.current = world;
            const targets = selectedIds.includes(comp.id) 
                ? components.filter(c => selectedIds.includes(c.id))
                : [comp];
            dragStartPosRef.current.clear();
            targets.forEach(t => dragStartPosRef.current.set(t.id, {x: t.x, y: t.y}));
            onOpenProperties();
        }
        return;
    }
    
    const wire = findWireAt(world.x, world.y);
    if (wire) { 
        setSelectedIds([wire.wire.id]); 
        onCloseProperties();
        return; 
    }
    
    // If nothing hit, start selection box
    if (e.button === 0) {
        setSelectionRect({ start: world, end: world });
    }
    
    setSelectedIds([]);
    onCloseProperties();
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - lastMouseRef.current.x;
            const dy = e.clientY - lastMouseRef.current.y;
            setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        } else if (draggingCompId) {
            const world = screenToWorld(e.clientX, e.clientY);
            
            const dx = world.x - dragStartMouseRef.current.x;
            const dy = world.y - dragStartMouseRef.current.y;
            
            const snappedDx = Math.round(dx / GRID_STEP) * GRID_STEP;
            const snappedDy = Math.round(dy / GRID_STEP) * GRID_STEP;

            setComponents(prev => prev.map(c => {
                if (dragStartPosRef.current.has(c.id)) {
                    const start = dragStartPosRef.current.get(c.id)!;
                    return { ...c, x: start.x + snappedDx, y: start.y + snappedDy };
                }
                return c;
            }));

            setWires(prev => prev.map(w => {
                const isA = dragStartPosRef.current.has(w.compAId);
                const isB = dragStartPosRef.current.has(w.compBId);
                
                if (isA || isB) {
                    let cA = components.find(c => c.id === w.compAId);
                    if (!cA) return w; // Safety check

                    if (isA) {
                        const start = dragStartPosRef.current.get(w.compAId)!;
                        cA = { ...cA, x: start.x + snappedDx, y: start.y + snappedDy };
                    }
                    
                    let cB = components.find(c => c.id === w.compBId);
                    if (!cB) return w; // Safety check

                    if (isB) {
                        const start = dragStartPosRef.current.get(w.compBId)!;
                        cB = { ...cB, x: start.x + snappedDx, y: start.y + snappedDy };
                    }

                    const pA = getAbsPorts(cA).find(p => p.id === w.portAIndex);
                    const pB = getAbsPorts(cB).find(p => p.id === w.portBIndex);
                    
                    if (!pA || !pB) return w; // Safety check

                    return { ...w, path: findSmartPath(pA, pB, new Set()) };
                }
                return w;
            }));
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
        } else if (selectionRect) {
            const world = screenToWorld(e.clientX, e.clientY);
            setSelectionRect(prev => prev ? { ...prev, end: world } : null);
        }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
        if (selectionRect) {
            const x1 = Math.min(selectionRect.start.x, selectionRect.end.x);
            const y1 = Math.min(selectionRect.start.y, selectionRect.end.y);
            const x2 = Math.max(selectionRect.start.x, selectionRect.end.x);
            const y2 = Math.max(selectionRect.start.y, selectionRect.end.y);

            if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
                const selected: string[] = [];
                
                // Select components whose center is within the box (plus a small margin)
                components.forEach(c => {
                    if (c.x >= x1 - 20 && c.x <= x2 + 20 && c.y >= y1 - 20 && c.y <= y2 + 20) {
                        selected.push(c.id);
                    }
                });

                // Select wires if any of their path points are within the box
                wires.forEach(w => {
                    const hit = w.path.some(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
                    if (hit) selected.push(w.id);
                });

                if (selected.length > 0) {
                    setSelectedIds(selected);
                    onOpenProperties();
                } else {
                    setSelectedIds([]);
                    onCloseProperties();
                }
            }
            setSelectionRect(null);
        }

        if (draggingCompId) {
            // Final snap is already handled in move, just clear state
            setDraggingCompId(null);
            dragStartPosRef.current.clear();
        }

        setIsPanning(false);
    };

    if (isPanning || draggingCompId || selectionRect) {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, draggingCompId, selectionRect, setView, screenToWorld, worldToGrid, setComponents, setWires, components, getAbsPorts, selectedIds, setSelectedIds, onOpenProperties, onCloseProperties]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    mouseWorldRef.current = world;
    
    if (isPanning || draggingCompId || placementMode || selectionRect) {
        setHoveredId(null);
        return;
    }
    
    const port = findPortAt(world.x, world.y);
    if (port) { setHoveredId(null); return; }
    
    const comp = components.find(c => Math.hypot(c.x - world.x, c.y - world.y) < 30);
    if (comp) {
        setHoveredId(comp.id);
        return;
    }
    
    const wire = findWireAt(world.x, world.y);
    if (wire) {
        setHoveredId(wire.wire.id);
        return;
    }
    
    setHoveredId(null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click triggers actions

    if (connectionStart) {
        const port = findPortAt(mouseWorldRef.current.x, mouseWorldRef.current.y);
        if (port) onAddWire(connectionStart, port);
        else {
            const wire = findWireAt(mouseWorldRef.current.x, mouseWorldRef.current.y);
            if (wire) onWireJoin(wire.wire, worldToGrid(mouseWorldRef.current.x, mouseWorldRef.current.y));
        }
    }
    if (placementMode) {
        const grid = worldToGrid(mouseWorldRef.current.x, mouseWorldRef.current.y);
        onAddComponent(placementMode.type, grid.x, grid.y, placementMode.rotation);
    }
    setIsPanning(false); setDraggingCompId(null); setConnectionStart(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = Math.exp(-e.deltaY * 0.001);
    const newScale = Math.max(0.2, Math.min(3, view.scale * zoom));
    const world = screenToWorld(e.clientX, e.clientY);
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setView(v => ({ ...v, scale: newScale, x: cx - world.x * newScale, y: cy - world.y * newScale }));
  };

  return <canvas 
    ref={canvasRef} 
    className={`w-full h-full outline-none ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`} 
    onMouseDown={handleMouseDown} 
    onMouseMove={handleMouseMove} 
    onMouseUp={handleMouseUp} 
    onWheel={handleWheel} 
    onContextMenu={(e) => e.preventDefault()} 
  />;
});
