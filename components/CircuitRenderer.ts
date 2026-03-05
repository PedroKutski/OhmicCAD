import { ComponentModel, WireModel, ComponentType, Theme, AppSettings } from '../types';
import { formatUnit } from '../utils/formatting';

const drawDirectionArrow = (
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string
) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;

    const ux = dx / len;
    const uy = dy / len;
    const size = 8;
    const width = 4.5;

    const tip = to;
    const baseX = tip.x - ux * size;
    const baseY = tip.y - uy * size;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(baseX + -uy * width, baseY + ux * width);
    ctx.lineTo(baseX - -uy * width, baseY - ux * width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
};

export const drawComponent = (
  ctx: CanvasRenderingContext2D, 
  c: ComponentModel, 
  theme: Theme, 
  isSelected: boolean, 
  isSimulating: boolean, 
  appSettings: AppSettings, 
  visualTime: number
) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((c.rotation * Math.PI) / 2);
    
    ctx.strokeStyle = isSelected ? theme.selected : theme.componentStroke;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (c.type) {
      case ComponentType.Battery:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-5, 0); ctx.moveTo(40, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(-5, 10); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, -20); ctx.lineTo(5, 20); ctx.stroke();
        // Plus sign
        ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, -12); ctx.lineTo(14, -12); ctx.moveTo(12, -14); ctx.lineTo(12, -10); ctx.stroke();
        ctx.strokeStyle = isSelected ? theme.selected : theme.componentStroke;
        break;


      case ComponentType.VCC:
        ctx.beginPath();
        ctx.moveTo(0, 40); ctx.lineTo(0, 12);
        ctx.moveTo(-10, 12); ctx.lineTo(0, -2); ctx.lineTo(10, 12);
        ctx.moveTo(-14, 40); ctx.lineTo(14, 40);
        ctx.stroke();
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(14, -12); ctx.lineTo(20, -12);
        ctx.moveTo(17, -15); ctx.lineTo(17, -9);
        ctx.stroke();
        ctx.strokeStyle = isSelected ? theme.selected : theme.componentStroke;
        ctx.lineWidth = isSelected ? 3 : 2;
        break;

      case ComponentType.GND:
        ctx.beginPath();
        ctx.moveTo(0, -40); ctx.lineTo(0, -10);
        ctx.moveTo(-16, -10); ctx.lineTo(16, -10);
        ctx.moveTo(-11, -4); ctx.lineTo(11, -4);
        ctx.moveTo(-6, 2); ctx.lineTo(6, 2);
        ctx.stroke();
        break;
      case ComponentType.Resistor:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-24, 0);
        for (let i = 0; i < 6; i++) ctx.lineTo(-18 + i * 7.2, i % 2 === 0 ? -10 : 10);
        ctx.lineTo(24, 0); ctx.lineTo(40, 0); ctx.stroke();
        break;

      case ComponentType.Capacitor:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-5, 0); ctx.moveTo(40, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(-5, 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -15); ctx.lineTo(5, 15); ctx.stroke();
        break;

      case ComponentType.ACSource:
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); ctx.moveTo(40, 0); ctx.lineTo(15, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
        // Sine wave (one clean period centered in the source symbol)
        const waveHalfWidth = 9;
        const waveAmplitude = 5;
        const waveSamples = 40;
        ctx.beginPath();
        for (let i = 0; i <= waveSamples; i++) {
            const t = i / waveSamples;
            const x = -waveHalfWidth + (2 * waveHalfWidth * t);
            const y = -Math.sin(t * Math.PI * 2) * waveAmplitude;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
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
            // Rectifier
            ctx.moveTo(15, -15); ctx.lineTo(15, 15);
        }
        ctx.stroke();
        break;



      case ComponentType.LED:
        // Terminals
        ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-15, 0); ctx.moveTo(40, 0); ctx.lineTo(15, 0); ctx.stroke();

        // Diode body
        ctx.beginPath();
        ctx.moveTo(-15, -15);
        ctx.lineTo(-15, 15);
        ctx.lineTo(15, 0);
        ctx.closePath();
        ctx.stroke();

        // Cathode line
        ctx.beginPath();
        ctx.moveTo(15, -15); ctx.lineTo(15, 15);
        ctx.stroke();

        // Light arrows
        ctx.beginPath();
        ctx.moveTo(20, -10); ctx.lineTo(30, -20); ctx.moveTo(27, -20); ctx.lineTo(30, -20); ctx.lineTo(30, -17);
        ctx.moveTo(20, 10); ctx.lineTo(30, 0); ctx.moveTo(27, 0); ctx.lineTo(30, 0); ctx.lineTo(30, 3);
        ctx.stroke();

        if (isSimulating) {
            const brightness = Math.max(0, Math.min(1, c.simData.brightness ?? 0));
            if (brightness > 0.001) {
                const glowColor = c.props.ledColor || '#ff4d4d';
                ctx.save();
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 12 + (28 * brightness);
                ctx.fillStyle = `${glowColor}${Math.round(120 + brightness * 100).toString(16).padStart(2, '0')}`;
                ctx.beginPath();
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
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
    
    // Current Flow Visualization inside Component
    if (isSimulating && appSettings.showCurrent && Math.abs(c.simData.current) > 1e-6) {
        // We are already transformed/rotated.
        // Component current sign from solver follows port orientation (0 -> 1).
        // Conventional flow in the symbol is rendered opposite to that sign.
        const baseDirection = -Math.sign(c.simData.current);
        // Solver sign is aligned with electron flow in this visualization pipeline.
        // So conventional and real modes must invert against each other here.
        const flowModeSign = appSettings.currentFlowMode === 'conventional' ? -1 : 1;
        const currentDir = baseDirection * flowModeSign;
        const distance = visualTime * Math.abs(c.simData.current);
        
        let path: {x: number, y: number}[] = [];
        
        // Define internal paths for current flow
        if (c.type === ComponentType.Resistor || c.type === ComponentType.Battery || 
            c.type === ComponentType.Capacitor || c.type === ComponentType.LED || c.type === ComponentType.Diode) {
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
    }

    ctx.restore();
    
    // Draw Labels
    if (appSettings.showLabels && c.type !== ComponentType.Junction) {
        ctx.save();
        ctx.translate(c.x, c.y);
        // We do NOT rotate here so text stays upright relative to the screen
        
        ctx.fillStyle = theme.textSecondary;
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        
        let label = c.props.name || '';
        let valueStr = '';
        
        if (c.type === ComponentType.Resistor && c.props.resistance !== undefined) {
            valueStr = formatUnit(c.props.resistance, 'Ω');
        } else if (c.type === ComponentType.Battery && c.props.voltage !== undefined) {
            valueStr = formatUnit(c.props.voltage, 'V');
        } else if (c.type === ComponentType.Capacitor && c.props.capacitance !== undefined) {
            const unit = c.props.capacitanceUnit || 'µF';
            let mult = 1e-6;
            if (unit === 'mF') mult = 1e-3;
            if (unit === 'nF') mult = 1e-9;
            if (unit === 'pF') mult = 1e-12;
            valueStr = formatUnit(c.props.capacitance * mult, 'F');
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
};

export const drawWire = (
    ctx: CanvasRenderingContext2D, 
    w: WireModel, 
    theme: Theme, 
    isSelected: boolean, 
    isSimulating: boolean, 
    appSettings: AppSettings, 
    visualTime: number
) => {
    ctx.strokeStyle = isSelected ? theme.wireSelected : theme.wire;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const shouldSmoothWire = !!appSettings.smoothWires && w.path.length > 2;
    const cornerRadius = 8;

    ctx.beginPath();
    if (w.path.length > 0) {
        ctx.moveTo(w.path[0].x, w.path[0].y);

        if (shouldSmoothWire) {
            for (let i = 1; i < w.path.length - 1; i++) {
                const prev = w.path[i - 1];
                const current = w.path[i];
                const next = w.path[i + 1];

                const inDx = current.x - prev.x;
                const inDy = current.y - prev.y;
                const outDx = next.x - current.x;
                const outDy = next.y - current.y;
                const inLen = Math.hypot(inDx, inDy);
                const outLen = Math.hypot(outDx, outDy);

                if (inLen < 1e-6 || outLen < 1e-6) {
                    ctx.lineTo(current.x, current.y);
                    continue;
                }

                const isCorner = (inDx !== 0 && outDy !== 0) || (inDy !== 0 && outDx !== 0);
                if (!isCorner) {
                    ctx.lineTo(current.x, current.y);
                    continue;
                }

                const radius = Math.min(cornerRadius, inLen / 2, outLen / 2);
                const start = {
                    x: current.x - (inDx / inLen) * radius,
                    y: current.y - (inDy / inLen) * radius,
                };
                const end = {
                    x: current.x + (outDx / outLen) * radius,
                    y: current.y + (outDy / outLen) * radius,
                };

                ctx.lineTo(start.x, start.y);
                ctx.quadraticCurveTo(current.x, current.y, end.x, end.y);
            }

            const end = w.path[w.path.length - 1];
            ctx.lineTo(end.x, end.y);
        } else {
            w.path.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        }
    }
    ctx.stroke();
    
    if (isSimulating && appSettings.showCurrent && Math.abs(w.simData.current) > 1e-6) {
        // Wire current sign is computed along the wire path (point A -> point B).
        // Solver sign is aligned with electron flow in this visualization pipeline.
        // So conventional and real modes must invert against each other here.
        const baseDirection = Math.sign(w.simData.current);
        const flowModeSign = appSettings.currentFlowMode === 'conventional' ? -1 : 1;
        const currentDir = baseDirection * flowModeSign;
        // visualTimeRef already accumulates (dt * visualFlowSpeed)
        // So we just multiply by current to get distance
        const distance = visualTime * Math.abs(w.simData.current);
        
        const flowPath: { x: number; y: number }[] = [];
        if (shouldSmoothWire) {
            const cornerRadius = 8;
            const start = w.path[0];
            flowPath.push({ x: start.x, y: start.y });

            for (let i = 1; i < w.path.length - 1; i++) {
                const prev = w.path[i - 1];
                const current = w.path[i];
                const next = w.path[i + 1];

                const inDx = current.x - prev.x;
                const inDy = current.y - prev.y;
                const outDx = next.x - current.x;
                const outDy = next.y - current.y;
                const inLen = Math.hypot(inDx, inDy);
                const outLen = Math.hypot(outDx, outDy);

                if (inLen < 1e-6 || outLen < 1e-6) {
                    flowPath.push({ x: current.x, y: current.y });
                    continue;
                }

                const isCorner = (inDx !== 0 && outDy !== 0) || (inDy !== 0 && outDx !== 0);
                if (!isCorner) {
                    flowPath.push({ x: current.x, y: current.y });
                    continue;
                }

                const radius = Math.min(cornerRadius, inLen / 2, outLen / 2);
                const curveStart = {
                    x: current.x - (inDx / inLen) * radius,
                    y: current.y - (inDy / inLen) * radius,
                };
                const curveEnd = {
                    x: current.x + (outDx / outLen) * radius,
                    y: current.y + (outDy / outLen) * radius,
                };

                flowPath.push(curveStart);
                const subdivisions = 8;
                for (let s = 1; s <= subdivisions; s++) {
                    const t = s / subdivisions;
                    const oneMinusT = 1 - t;
                    flowPath.push({
                        x: (oneMinusT * oneMinusT * curveStart.x) + (2 * oneMinusT * t * current.x) + (t * t * curveEnd.x),
                        y: (oneMinusT * oneMinusT * curveStart.y) + (2 * oneMinusT * t * current.y) + (t * t * curveEnd.y),
                    });
                }
            }

            const end = w.path[w.path.length - 1];
            flowPath.push({ x: end.x, y: end.y });
        } else {
            flowPath.push(...w.path);
        }

        ctx.fillStyle = '#ff0000'; // Red dots
        const step = 20;
        let accumulatedLen = 0;

        for (let i = 0; i < flowPath.length - 1; i++) {
            const p1 = flowPath[i], p2 = flowPath[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (segLen < 1e-6) continue;

            const initial = (step - ((distance + accumulatedLen) % step)) % step;
            for (let d = initial; d < segLen; d += step) {
                const t = currentDir > 0 ? d / segLen : 1 - (d / segLen);
                ctx.beginPath();
                ctx.arc(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }

            accumulatedLen += segLen;
        }
    }

    if (isSimulating && appSettings.showCurrent && !!appSettings.showDirectionArrows && Math.abs(w.simData.current) > 1e-6) {
        const baseDirection = Math.sign(w.simData.current);
        const flowModeSign = appSettings.currentFlowMode === 'conventional' ? -1 : 1;
        const currentDir = baseDirection * flowModeSign;

        const arrowSpacing = 90;
        let remaining = arrowSpacing / 2;

        for (let i = 0; i < w.path.length - 1; i++) {
            const p1 = w.path[i];
            const p2 = w.path[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (segLen < 1e-6) continue;

            while (remaining <= segLen) {
                const t = remaining / segLen;
                const cx = p1.x + (p2.x - p1.x) * t;
                const cy = p1.y + (p2.y - p1.y) * t;
                const half = 7;

                if (currentDir > 0) {
                    drawDirectionArrow(ctx, { x: cx + ((p2.x - p1.x) / segLen) * half, y: cy + ((p2.y - p1.y) / segLen) * half }, { x: cx - ((p2.x - p1.x) / segLen) * half, y: cy - ((p2.y - p1.y) / segLen) * half }, '#ff4d4d');
                } else {
                    drawDirectionArrow(ctx, { x: cx - ((p2.x - p1.x) / segLen) * half, y: cy - ((p2.y - p1.y) / segLen) * half }, { x: cx + ((p2.x - p1.x) / segLen) * half, y: cy + ((p2.y - p1.y) / segLen) * half }, '#ff4d4d');
                }

                remaining += arrowSpacing;
            }

            remaining -= segLen;
        }
    }
};
