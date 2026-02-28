
import React, { useState, useEffect } from 'react';
import { ComponentModel, WireModel, ComponentType } from '../types';

interface PropertiesPanelProps {
  target: ComponentModel | WireModel | undefined;
  onUpdateCompProps: (id: string, props: any) => void;
  onUpdateWireProps: (id: string, props: any) => void;
}

const RESISTOR_COLORS = [
  { name: 'Black', hex: '#000000', val: 0, text: '#fff' },
  { name: 'Brown', hex: '#8B4513', val: 1, text: '#fff' },
  { name: 'Red', hex: '#FF0000', val: 2, text: '#fff' },
  { name: 'Orange', hex: '#FFA500', val: 3, text: '#000' },
  { name: 'Yellow', hex: '#FFFF00', val: 4, text: '#000' },
  { name: 'Green', hex: '#008000', val: 5, text: '#fff' },
  { name: 'Blue', hex: '#0000FF', val: 6, text: '#fff' },
  { name: 'Violet', hex: '#EE82EE', val: 7, text: '#000' },
  { name: 'Grey', hex: '#808080', val: 8, text: '#fff' },
  { name: 'White', hex: '#FFFFFF', val: 9, text: '#000' },
];

const MULTIPLIERS = [
  ...RESISTOR_COLORS,
  { name: 'Gold', hex: '#FFD700', val: -1, text: '#000' },
  { name: 'Silver', hex: '#C0C0C0', val: -2, text: '#000' },
];

const TOLERANCES = [
  { name: 'Brown', hex: '#8B4513', val: 1 },
  { name: 'Red', hex: '#FF0000', val: 2 },
  { name: 'Green', hex: '#008000', val: 0.5 },
  { name: 'Blue', hex: '#0000FF', val: 0.25 },
  { name: 'Violet', hex: '#EE82EE', val: 0.1 },
  { name: 'Grey', hex: '#808080', val: 0.05 },
  { name: 'Gold', hex: '#FFD700', val: 5 },
  { name: 'Silver', hex: '#C0C0C0', val: 10 },
];

const CAPACITOR_UNITS = ['mF', 'µF', 'nF', 'pF'];

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ target, onUpdateCompProps, onUpdateWireProps }) => {
  if (!target) return null;

  const isComp = 'type' in target;

  // -- Resistor Helpers --
  const getResistorBands = (r: number) => {
    // Basic 4-band implementation (2 significant digits + multiplier)
    let ohms = r;
    let multiplier = 0;
    
    if (ohms === 0) return [0, 0, 0]; // Black Black Black

    if (ohms < 1) {
        if (ohms < 0.1) {
            while (ohms < 10) { ohms *= 10; multiplier--; }
        } else {
             while (ohms < 10 && Number.isInteger(ohms) === false) { ohms *= 10; multiplier--; }
        }
    } else {
        while (ohms >= 100) {
            ohms /= 10;
            multiplier++;
        }
    }
    
    const sig = Math.round(ohms); 
    const d1 = Math.floor(sig / 10);
    const d2 = sig % 10;
    
    return [d1, d2, multiplier];
  };

  const getSMDCode = (r: number) => {
      if (r === 0) return "000";
      if (r < 10 && r % 1 !== 0) return r.toString().replace('.', 'R'); // 4.7 -> 4R7
      
      let str = r.toString();
      if (r >= 10) {
        let m = 0;
        let val = r;
        while (val >= 100 && val % 10 === 0) {
            val /= 10;
            m++;
        }
        return `${val}${m}`; 
      }
      return str; 
  };

  const calculateResFromBands = (b1: number, b2: number, mult: number) => {
    return (b1 * 10 + b2) * Math.pow(10, mult);
  };

  const parseSMD = (code: string) => {
      const upper = code.toUpperCase();
      if (upper.includes('R')) {
          return parseFloat(upper.replace('R', '.'));
      }
      const match = upper.match(/^(\d+)(\d)$/);
      if (match) {
          const base = parseInt(match[1]);
          const mult = parseInt(match[2]);
          return base * Math.pow(10, mult);
      }
      return parseFloat(code);
  };

  // -- Renderers --

  const renderGenericInput = (key: string, value: any, onChange: (val: any) => void) => {
      if (key === 'flowDir') return null;
      if (key === 'tolerance') return null; // Handled specially
      if (key === 'capacitanceUnit') return null; // Handled specially
      if (key === 'material') return null; // Handled specially for wires
      if (key === 'plot') return null; // Legacy property
      
      const step = typeof value === 'number' ? 'any' : undefined;

      return (
        <div key={key} className="mb-4">
          <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">{key}</label>
          {typeof value === 'boolean' ? (
            <input 
              type="checkbox"
              checked={value}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 bg-zinc-800 border-zinc-700 rounded text-orange-500 cursor-pointer"
            />
          ) : key === 'color' ? (
            <div className="flex gap-2">
                 <input 
                    type="color"
                    value={value as string}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-8 h-8 bg-zinc-800 border-zinc-700 rounded cursor-pointer"
                />
                <span className="text-xs text-zinc-400 self-center">{value}</span>
            </div>
          ) : (
            <input 
              type={typeof value === 'number' ? 'number' : 'text'}
              value={value === undefined ? '' : value}
              step={step}
              onChange={(e) => {
                const raw = e.target.value;
                if (typeof value === 'number') {
                    if (raw === '') {
                        onChange(undefined);
                    } else {
                        const val = parseFloat(raw);
                        onChange(val);
                    }
                } else {
                    onChange(raw);
                }
              }}
              className="w-full bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none transition-colors"
            />
          )}
        </div>
      );
  };

  const renderWireProps = () => {
    const wire = target as WireModel;

    return (
        <div className="space-y-4">
            <div className="mb-2 text-[10px] text-zinc-500 uppercase font-bold">Wire Settings</div>
            
            {renderGenericInput('name', wire.props.name, (v) => onUpdateWireProps(wire.id, { name: v }))}
        </div>
    );
  };

  const renderResistorProps = () => {
      const comp = target as ComponentModel;
      const r = comp.props.resistance || 0;
      const tol = comp.props.tolerance ?? 5;

      const [b1, b2, mult] = getResistorBands(r);
      const smd = getSMDCode(r);

      const updateRes = (newR: number) => onUpdateCompProps(comp.id, { resistance: newR });
      const updateTol = (newT: number) => onUpdateCompProps(comp.id, { tolerance: newT });

      return (
          <div className="space-y-4">
               {/* Main Value */}
               <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Resistance (Ω)</label>
                  <input 
                      type="number" 
                      value={r} 
                      onChange={(e) => updateRes(parseFloat(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none"
                  />
               </div>

               {/* Tolerance Input */}
               <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Tolerance (±%)</label>
                  <select 
                      value={tol} 
                      onChange={(e) => updateTol(parseFloat(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none"
                  >
                     {TOLERANCES.map(t => <option key={t.name} value={t.val}>±{t.val}% ({t.name})</option>)}
                  </select>
               </div>

               {/* SMD Code */}
               <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">SMD Code</label>
                  <input 
                      type="text" 
                      defaultValue={smd}
                      key={smd} 
                      onBlur={(e) => {
                          const val = parseSMD(e.target.value);
                          if (!isNaN(val)) updateRes(val);
                      }}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseSMD(e.currentTarget.value);
                            if (!isNaN(val)) updateRes(val);
                          }
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 text-orange-400 p-2 rounded text-xs font-mono focus:border-orange-500 outline-none uppercase"
                  />
                  <div className="text-[9px] text-zinc-600 mt-1">Ex: 103 = 10k, 4R7 = 4.7Ω</div>
               </div>

               {/* Color Bands Visual */}
               <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-2">Color Code</label>
                  <div className="relative w-full h-16 flex items-center justify-center">
                    <div className="absolute w-full h-0.5 bg-zinc-500"></div>
                    <div className="relative w-48 h-10 bg-[#e3cbb1] rounded-full border border-[#c4a477] shadow-lg flex items-center px-6 z-10 overflow-hidden box-border">
                        <div className="relative group w-3 h-full mr-3" style={{ backgroundColor: RESISTOR_COLORS[b1]?.hex }}>
                             <select 
                                value={b1} 
                                onChange={(e) => updateRes(calculateResFromBands(parseInt(e.target.value), b2, mult))}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                             >
                                {RESISTOR_COLORS.map(c => <option key={c.name} value={c.val}>{c.name}</option>)}
                             </select>
                             <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] text-white bg-black/80 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                {RESISTOR_COLORS[b1]?.name}
                             </div>
                        </div>
                        <div className="relative group w-3 h-full mr-3" style={{ backgroundColor: RESISTOR_COLORS[b2]?.hex }}>
                             <select 
                                value={b2} 
                                onChange={(e) => updateRes(calculateResFromBands(b1, parseInt(e.target.value), mult))}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                             >
                                {RESISTOR_COLORS.map(c => <option key={c.name} value={c.val}>{c.name}</option>)}
                             </select>
                             <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] text-white bg-black/80 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                {RESISTOR_COLORS[b2]?.name}
                             </div>
                        </div>
                        <div className="relative group w-3 h-full" style={{ backgroundColor: MULTIPLIERS.find(m => m.val === mult)?.hex || '#000' }}>
                             <select 
                                value={mult} 
                                onChange={(e) => updateRes(calculateResFromBands(b1, b2, parseInt(e.target.value)))}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                             >
                                {MULTIPLIERS.map(c => <option key={c.name} value={c.val}>{c.name}</option>)}
                             </select>
                             <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] text-white bg-black/80 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                {MULTIPLIERS.find(m => m.val === mult)?.name}
                             </div>
                        </div>
                        <div className="flex-1"></div>
                        <div className="relative group w-3 h-full mr-1" style={{ backgroundColor: TOLERANCES.find(t => t.val === tol)?.hex || '#FFD700' }}>
                             <select 
                                value={tol} 
                                onChange={(e) => updateTol(parseFloat(e.target.value))}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                             >
                                {TOLERANCES.map(t => <option key={t.name} value={t.val}>{t.name}</option>)}
                             </select>
                             <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] text-white bg-black/80 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                {TOLERANCES.find(t => t.val === tol)?.name}
                             </div>
                        </div>
                    </div>
                  </div>
               </div>
          </div>
      );
  };

  const renderCapacitorProps = () => {
    const comp = target as ComponentModel;
    return (
        <div className="space-y-4">
             <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Capacitance</label>
             <div className="flex gap-2">
                 <input 
                    type="number"
                    value={comp.props.capacitance || 0}
                    onChange={(e) => onUpdateCompProps(comp.id, { capacitance: parseFloat(e.target.value) })}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none"
                 />
                 <select
                    value={comp.props.capacitanceUnit || 'µF'}
                    onChange={(e) => onUpdateCompProps(comp.id, { capacitanceUnit: e.target.value })}
                    className="w-20 bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none"
                 >
                    {CAPACITOR_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                 </select>
             </div>
             {renderGenericInput('name', comp.props.name, (v) => onUpdateCompProps(comp.id, { name: v }))}
        </div>
    );
  };

  const renderGenericComponentProps = () => {
     const comp = target as ComponentModel;
     return (
         <div className="space-y-4">
            {Object.keys(comp.props).map(key => {
                if (comp.type === ComponentType.Battery && key === 'capacity') return null;
                return renderGenericInput(key, (comp.props as any)[key], (val) => onUpdateCompProps(comp.id, { [key]: val }));
            })}
         </div>
     );
  };

  const renderDiodeProps = () => {
      const comp = target as ComponentModel;
      return (
          <div className="space-y-4">
              <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Diode Type</label>
                  <select 
                      value={comp.props.diodeType || 'rectifier'} 
                      onChange={(e) => onUpdateCompProps(comp.id, { diodeType: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none"
                  >
                      <option value="rectifier">Rectifier</option>
                      <option value="zener">Zener</option>
                      <option value="schottky">Schottky</option>
                  </select>
              </div>
              
              {comp.props.diodeType === 'zener' && (
                  <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Zener Voltage (V)</label>
                      <input 
                          type="number" 
                          value={comp.props.zenerVoltage || 5.6} 
                          onChange={(e) => onUpdateCompProps(comp.id, { zenerVoltage: parseFloat(e.target.value) })}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white p-2 rounded text-xs font-mono focus:border-orange-500 outline-none"
                      />
                  </div>
              )}
              
              {renderGenericInput('name', comp.props.name, (v) => onUpdateCompProps(comp.id, { name: v }))}
          </div>
      );
  };

  const renderLightProps = () => {
      const comp = target as ComponentModel;
      return (
          <div className="space-y-4">
              {renderGenericInput('color', comp.props.color || '#ff0000', (v) => onUpdateCompProps(comp.id, { color: v }))}
              
              {comp.type === ComponentType.LED && (
                  <>
                    {renderGenericInput('voltageDrop', comp.props.voltageDrop || 2.0, (v) => onUpdateCompProps(comp.id, { voltageDrop: parseFloat(v) }))}
                    {renderGenericInput('maxCurrent', comp.props.maxCurrent || 0.02, (v) => onUpdateCompProps(comp.id, { maxCurrent: parseFloat(v) }))}
                  </>
              )}

              {comp.type === ComponentType.Lamp && (
                  renderGenericInput('resistance', comp.props.resistance || 100, (v) => onUpdateCompProps(comp.id, { resistance: parseFloat(v) }))
              )}
              {renderGenericInput('name', comp.props.name, (v) => onUpdateCompProps(comp.id, { name: v }))}
          </div>
      );
  };

  const renderContent = () => {
    if (!isComp) return renderWireProps();
    const type = (target as ComponentModel).type;
    if (type === ComponentType.Resistor) return renderResistorProps();
    if (type === ComponentType.Capacitor) return renderCapacitorProps();
    if (type === ComponentType.Diode) return renderDiodeProps();
    if (type === ComponentType.LED || type === ComponentType.Lamp) return renderLightProps();
    return renderGenericComponentProps();
  };

  return (
    <div className="w-64 bg-[#252525] border-l border-zinc-800 flex flex-col z-20 shadow-2xl h-full animate-in slide-in-from-right-10 duration-200">
      <div className="p-4 border-b border-zinc-800 bg-[#2a2a2a]">
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Properties</div>
        <div className="text-sm font-bold text-white truncate">{target.props.name || (isComp ? (target as ComponentModel).type : 'Wire')}</div>
        <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{target.id}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
         {renderContent()}
      </div>
    </div>
  );
};
