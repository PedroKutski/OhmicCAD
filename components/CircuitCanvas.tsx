
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { 
  ComponentModel, WireModel, ViewState, ComponentType, 
  THEME, GRID_SIZE, GRID_STEP, Port, AppSettings, SimData
} from '../types';
import { rotatePoint, distPointToSegment, findSmartPath } from '../utils/geometry';
import { formatUnit } from '../utils/formatting';
import { drawComponent, drawWire } from './CircuitRenderer';

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
  onDragEnd: (id: string) => void;
  connectionStart: { compId: string; portId: number } | null;
  setConnectionStart: React.Dispatch<React.SetStateAction<{ compId: string; portId: number } | null>>;
  setComponents: React.Dispatch<React.SetStateAction<ComponentModel[]>>;
  setWires: React.Dispatch<React.SetStateAction<WireModel[]>>;
  getAbsPorts: (c: ComponentModel) => Port[];
  onOpenProperties: () => void;
  onCloseProperties: () => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  appSettings: AppSettings;
}

export interface CircuitCanvasHandle {
  exportImage: () => string | null;
  exportSchematic: (theme: any) => string | null;
}

export const CircuitCanvas = forwardRef<CircuitCanvasHandle, CircuitCanvasProps>(({
  components, wires, view, setView, placementMode, setPlacementMode,
  selectedIds, setSelectedIds, onAddComponent, onAddWire, onWireJoin, onRotateSelected, onDragEnd, connectionStart, setConnectionStart,
  setComponents, setWires, getAbsPorts, onOpenProperties, onCloseProperties, onContextMenu, isSimulating, appSettings
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
    exportImage: () => canvasRef.current?.toDataURL('image/png') || null,
    exportSchematic: (theme: any) => {
        // Create a temporary canvas to render the schematic with the given theme
        const tempCanvas = document.createElement('canvas');
        // Calculate bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (components.length === 0 && wires.length === 0) return null;
        
        components.forEach(c => {
            minX = Math.min(minX, c.x - 50);
            minY = Math.min(minY, c.y - 50);
            maxX = Math.max(maxX, c.x + 50);
            maxY = Math.max(maxY, c.y + 50);
        });
        wires.forEach(w => w.path.forEach(p => {
            minX = Math.min(minX, p.x - 10);
            minY = Math.min(minY, p.y - 10);
            maxX = Math.max(maxX, p.x + 10);
            maxY = Math.max(maxY, p.y + 10);
        }));

        const width = maxX - minX + 100;
        const height = maxY - minY + 100;
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return null;

        // Fill background
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, width, height);

        // Translate to center content
        ctx.translate(-minX + 50, -minY + 50);

        // Draw wires
        wires.forEach(w => {
            drawWire(ctx, w, theme, false, false, appSettings, 0);
        });

        // Draw components
        components.forEach(c => {
            drawComponent(ctx, c, theme, false, false, appSettings, 0);
        });

        return tempCanvas.toDataURL('image/png');
    }
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
        drawWire(ctx, w, THEME, selectedIds.includes(w.id), isSimulating, appSettings, visualTimeRef.current);
    });

    components.forEach(c => {
        drawComponent(ctx, c, THEME, selectedIds.includes(c.id), isSimulating, appSettings, visualTimeRef.current);
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
        ctx.globalAlpha = 0.5; 
        drawComponent(ctx, { ...placementMode, id: 'ghost', x: grid.x, y: grid.y, state: false, props: {}, simData: {} } as any, THEME, false, false, appSettings, 0); 
        ctx.globalAlpha = 1.0;
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
            
            if ('type' in target && (target as ComponentModel).type === ComponentType.Inductor) {
                 lines.push(`Vd = ${formatUnit(target.simData.voltage, 'V')}`);
                 if ((target as ComponentModel).props.inductance !== undefined) {
                     lines.push(`L = ${formatUnit((target as ComponentModel).props.inductance!, 'H')}`);
                 }
            } else {
                 // Voltage Drop
                 lines.push(`V = ${formatUnit(target.simData.voltage, 'V')}`);
            }
            
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

        const comp = components.find(c => Math.hypot(c.x - world.x, c.y - world.y) < 30);
        if (comp) {
            setSelectedIds([comp.id]);
            onContextMenu(e.clientX, e.clientY, comp.id);
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
            onDragEnd(draggingCompId);
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
