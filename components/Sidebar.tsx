
import React from 'react';
import { ComponentType } from '../types';

interface SidebarProps {
  onPlace: (type: ComponentType) => void;
  isSimulating?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onPlace, isSimulating = false }) => {
  const categories = [
    {
      name: "Basic Components",
      items: [
        { type: ComponentType.Battery, label: "DC Battery", icon: <><path d="M5,20 L17,20 M23,20 L35,20" /><path d="M17,15 L17,25" strokeWidth="3"/><path d="M23,10 L23,30" strokeWidth="1"/><path d="M26,12 L30,12 M28,10 L28,14" strokeWidth="1" stroke="#F27D26"/></> },
        { type: ComponentType.Switch, label: "Switch", icon: <><path d="M5,20 L12,20 M28,20 L35,20" /><path d="M12,20 L26,12" /><circle cx="12" cy="20" r="2"/><circle cx="28" cy="20" r="2"/></> },
        { type: ComponentType.PushButton, label: "Push Button", icon: <><path d="M5,25 L12,25 M28,25 L35,25 M12,25 L12,22 M28,25 L28,22" /><path d="M10,18 L30,18 M20,18 L20,12" /><circle cx="12" cy="25" r="2"/><circle cx="28" cy="25" r="2"/></> },
        { type: ComponentType.Resistor, label: "Resistor", icon: <path d="M5,20 L12,20 L14,14 L18,26 L22,14 L26,26 L28,20 L35,20" /> },
        { type: ComponentType.Capacitor, label: "Capacitor", icon: <><path d="M5,20 L18,20 M22,20 L35,20" /><path d="M18,10 L18,30" /><path d="M22,10 L22,30" /></> },
        { type: ComponentType.PolarizedCapacitor, label: "Cap (Pol)", icon: <><path d="M5,20 L17.5,20 M22.5,20 L35,20" /><path d="M17.5,12 L17.5,28" /><path d="M23.7,25.3 A7.5,7.5 0 0 1 23.7,14.7" fill="none" stroke="currentColor"/><path d="M11,12 L15,12 M13,10 L13,14" strokeWidth="1" stroke="#F27D26"/></> },
        { type: ComponentType.Inductor, label: "Inductor", icon: <path d="M5,20 L10,20 Q12.5,10 15,20 Q17.5,10 20,20 Q22.5,10 25,20 Q27.5,10 30,20 L35,20" fill="none" /> },
        { type: ComponentType.ACSource, label: "AC Source", icon: <><circle cx="20" cy="20" r="10" /><path d="M15,20 Q17.5,15 20,20 T25,20" /></> },
      ]
    },
    {
      name: "Semiconductors & Output",
      items: [
        { type: ComponentType.Diode, label: "Diode", icon: <><path d="M5,20 L15,20 M25,20 L35,20" /><path d="M15,10 L15,30 L25,20 Z" fill="currentColor" /><path d="M25,10 L25,30" /></> },
        { type: ComponentType.LED, label: "LED", icon: <><path d="M5,20 L15,20 M25,20 L35,20" /><path d="M15,10 L15,30 L25,20 Z" fill="currentColor" /><path d="M25,10 L25,30" /><path d="M20,10 L25,5 M25,12 L30,7" strokeWidth="1" /></> },
        { type: ComponentType.Lamp, label: "Lamp", icon: <><path d="M5,20 L12,20 M28,20 L35,20" /><circle cx="20" cy="20" r="8" /><path d="M16,16 L24,24 M16,24 L24,16" /></> },
      ]
    }
  ];

  return (
    <div className="w-72 bg-[#252525] border-r border-zinc-800 flex flex-col z-50 shadow-2xl overflow-hidden">
      <div className="p-6 text-2xl font-black tracking-tight border-b border-zinc-800 bg-gradient-to-r from-[#252525] to-[#2a2a2a] flex items-baseline">
        Ohmic<span className="text-orange-500">CAD</span>
        <span className="text-xs text-zinc-600 font-normal ml-2">v1.2.0</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {categories.map(cat => (
          <div key={cat.name}>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">{cat.name}</div>
            <div className="grid grid-cols-2 gap-2">
              {cat.items.map(item => (
                <button key={item.type} onClick={() => !isSimulating && onPlace(item.type)} disabled={isSimulating} className={`flex flex-col items-center justify-center h-20 bg-zinc-800 border border-zinc-700 rounded transition-all group p-2 ${isSimulating ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:border-orange-500 hover:text-white'}`}>
                  <svg viewBox="0 0 40 40" className="w-8 h-8 stroke-current fill-none stroke-2 group-hover:scale-110 transition-transform">{item.icon}</svg>
                  <span className="text-[10px] mt-2 text-center text-zinc-400 group-hover:text-white leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
