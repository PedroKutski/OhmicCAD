import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ComponentModel } from '../types';

interface GraphConfig {
  id: string;
  componentId: string;
  type: 'voltage' | 'current';
  color: string;
}

interface GraphPanelProps {
  graphs: GraphConfig[];
  components: ComponentModel[];
  onRemoveGraph: (id: string) => void;
  isSimulating: boolean;
  simTime: number;
}

const MAX_HISTORY = 2000;
const MIN_VISIBLE_POINTS = 20;

export const GraphPanel: React.FC<GraphPanelProps> = ({ graphs, components, onRemoveGraph, isSimulating, simTime }) => {
  // Store history per component: Record<componentId, points[]>
  const [data, setData] = useState<Record<string, { time: number, voltage?: number, current?: number }[]>>({});
  const [visiblePoints, setVisiblePoints] = useState(100);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!isSimulating) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 50) return; // Throttle to 20fps
    lastUpdateRef.current = now;

    setData(prev => {
      const next = { ...prev };
      
      // Identify active components that have at least one graph
      const activeComponentIds = new Set<string>(graphs.map(g => g.componentId));

      activeComponentIds.forEach((compId: string) => {
        const comp = components.find(c => c.id === compId);
        if (!comp) return;

        const points = next[compId] || [];
        const newPoint = { 
            time: simTime, 
            voltage: comp.simData.voltage, 
            current: comp.simData.current 
        };
        
        const newPoints = [...points, newPoint];
        if (newPoints.length > MAX_HISTORY) newPoints.shift();
        next[compId] = newPoints;
      });
      
      return next;
    });
  }, [isSimulating, simTime, graphs, components]);

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 10 : -10;
      setVisiblePoints(prev => {
          const next = prev + delta;
          if (next < MIN_VISIBLE_POINTS) return MIN_VISIBLE_POINTS;
          if (next > MAX_HISTORY) return MAX_HISTORY;
          return next;
      });
  };

  // Group graphs by component
  const groupedGraphs = graphs.reduce((acc: Record<string, GraphConfig[]>, g) => {
      if (!acc[g.componentId]) acc[g.componentId] = [];
      acc[g.componentId].push(g);
      return acc;
  }, {});

  if (graphs.length === 0) return null;

  return (
    <div 
        className="absolute bottom-0 left-0 right-0 h-48 bg-[#1a1a1a] border-t border-zinc-700 flex overflow-x-auto z-30"
        onWheel={handleWheel}
    >
      {Object.entries(groupedGraphs).map(([compId, componentGraphs]: [string, GraphConfig[]]) => {
        const comp = components.find(c => c.id === compId);
        const name = comp ? (comp.props.name || comp.type) : 'Unknown';
        const allPoints = data[compId] || [];
        const points = allPoints.slice(-visiblePoints);
        
        const hasVoltage = componentGraphs.some(g => g.type === 'voltage');
        const hasCurrent = componentGraphs.some(g => g.type === 'current');

        return (
          <div key={compId} className="flex-1 min-w-[400px] h-full border-r border-zinc-800 relative group">
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
                <span className="text-xs font-bold text-zinc-300 bg-black/50 px-2 py-1 rounded">{name}</span>
            </div>
            
            {/* Legend / Remove Controls */}
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
                {componentGraphs.map(g => (
                    <div key={g.id} className="flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-[10px] text-zinc-300 uppercase">{g.type}</span>
                        <button 
                            onClick={() => onRemoveGraph(g.id)}
                            className="ml-1 text-zinc-500 hover:text-red-500 font-bold"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" hide />
                
                {/* Voltage Axis (Left) */}
                {hasVoltage && (
                    <YAxis 
                        yAxisId="voltage"
                        orientation="left"
                        stroke="#00e5ff" 
                        fontSize={10} 
                        width={40} 
                        tickFormatter={(val) => val.toExponential(1)}
                    />
                )}
                
                {/* Current Axis (Right) */}
                {hasCurrent && (
                    <YAxis 
                        yAxisId="current"
                        orientation="right"
                        stroke="#ff9d00" 
                        fontSize={10} 
                        width={40} 
                        tickFormatter={(val) => val.toExponential(1)}
                    />
                )}

                <Tooltip 
                  contentStyle={{ backgroundColor: '#252525', border: '1px solid #444', color: '#fff' }}
                  labelStyle={{ color: '#888' }}
                  formatter={(value: number, name: string) => [value.toExponential(3), name === 'voltage' ? 'Voltage (V)' : 'Current (A)']}
                  labelFormatter={(label: number) => `t=${label.toFixed(2)}s`}
                />
                
                {componentGraphs.map(g => (
                    <Line 
                        key={g.id}
                        yAxisId={g.type}
                        type="monotone" 
                        dataKey={g.type} 
                        stroke={g.color} 
                        strokeWidth={2} 
                        dot={false} 
                        isAnimationActive={false} 
                    />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
};
