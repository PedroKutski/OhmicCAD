import { ComponentModel, WireModel, ComponentType, Theme, AppSettings } from '../types';
import { formatUnit } from '../utils/formatting';

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
            ctx.strokeStyle = theme.accent; ctx.lineWidth = 1.5;
            ctx.beginPath(); 
            ctx.moveTo(-15, -15); ctx.lineTo(-9, -15); 
            ctx.moveTo(-12, -18); ctx.lineTo(-12, -12); 
            ctx.stroke();
            ctx.strokeStyle = isSelected ? theme.selected : theme.componentStroke;
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
        // We are already transformed/rotated
        const currentDir = Math.sign(c.simData.current);
        const distance = visualTime * Math.abs(c.simData.current);
        
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

    ctx.beginPath();
    if (w.path.length > 0) {
        ctx.moveTo(w.path[0].x, w.path[0].y);

        if (shouldSmoothWire) {
            for (let i = 1; i < w.path.length - 1; i++) {
                const p = w.path[i];
                const next = w.path[i + 1];
                const midX = (p.x + next.x) / 2;
                const midY = (p.y + next.y) / 2;
                ctx.quadraticCurveTo(p.x, p.y, midX, midY);
            }

            const end = w.path[w.path.length - 1];
            ctx.lineTo(end.x, end.y);
        } else {
            w.path.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        }
    }
    ctx.stroke();
    
    if (isSimulating && appSettings.showCurrent && Math.abs(w.simData.current) > 1e-6) {
        const currentDir = Math.sign(w.simData.current);
        // visualTimeRef already accumulates (dt * visualFlowSpeed)
        // So we just multiply by current to get distance
        const distance = visualTime * Math.abs(w.simData.current);
        
        const flowPath: { x: number; y: number }[] = [];
        if (shouldSmoothWire) {
            const start = w.path[0];
            flowPath.push({ x: start.x, y: start.y });

            for (let i = 1; i < w.path.length - 1; i++) {
                const p0 = w.path[i - 1];
                const p1 = w.path[i];
                const p2 = w.path[i + 1];
                const curveStart = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
                const curveEnd = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                const subdivisions = 8;

                for (let s = 1; s <= subdivisions; s++) {
                    const t = s / subdivisions;
                    const oneMinusT = 1 - t;
                    flowPath.push({
                        x: (oneMinusT * oneMinusT * curveStart.x) + (2 * oneMinusT * t * p1.x) + (t * t * curveEnd.x),
                        y: (oneMinusT * oneMinusT * curveStart.y) + (2 * oneMinusT * t * p1.y) + (t * t * curveEnd.y),
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
};
