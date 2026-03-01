import React, { useState } from 'react';
import { CIRCUIT_LIBRARY, CircuitCategory, CircuitItem } from '../data/circuitLibrary';

interface CircuitLibraryModalProps {
    onClose: () => void;
    onLoadCircuit: (id: string, data?: any) => void;
}

export const CircuitLibraryModal: React.FC<CircuitLibraryModalProps> = ({ onClose, onLoadCircuit }) => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Basics']));
    const [searchQuery, setSearchQuery] = useState('');

    const normalizedQuery = searchQuery.trim().toLowerCase();

    const toggleCategory = (name: string) => {
        const next = new Set(expandedCategories);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setExpandedCategories(next);
    };

    const filterNode = (item: CircuitItem | CircuitCategory): CircuitItem | CircuitCategory | null => {
        if (!normalizedQuery) return item;

        if ('items' in item) {
            const filteredChildren = item.items
                .map(filterNode)
                .filter((child): child is CircuitItem | CircuitCategory => child !== null);

            if (item.name.toLowerCase().includes(normalizedQuery) || filteredChildren.length > 0) {
                return { ...item, items: filteredChildren };
            }

            return null;
        }

        return item.name.toLowerCase().includes(normalizedQuery) ? item : null;
    };

    const renderItem = (item: CircuitItem | CircuitCategory, depth = 0) => {
        const isCategory = 'items' in item;
        const paddingLeft = `${depth * 12}px`;

        if (isCategory) {
            const cat = item as CircuitCategory;
            const isExpanded = normalizedQuery ? true : expandedCategories.has(cat.name);
            return (
                <div key={cat.name}>
                    <div 
                        className="flex items-center py-1 px-2 cursor-pointer hover:bg-zinc-800 text-zinc-300 text-xs font-bold select-none"
                        style={{ paddingLeft }}
                        onClick={() => toggleCategory(cat.name)}
                    >
                        <span className="mr-1 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                        {cat.name}
                    </div>
                    {isExpanded && (
                        <div>
                            {cat.items.map(sub => renderItem(sub, depth + 1))}
                        </div>
                    )}
                </div>
            );
        } else {
            const circuit = item as CircuitItem;
            return (
                <div 
                    key={circuit.id}
                    className="py-1 px-2 cursor-pointer hover:bg-orange-500/20 hover:text-orange-400 text-zinc-400 text-xs transition-colors"
                    style={{ paddingLeft: `${depth * 12 + 16}px` }}
                    onClick={() => onLoadCircuit(circuit.id, circuit.data)}
                >
                    {circuit.name}
                </div>
            );
        }
    };

    const filteredLibrary = CIRCUIT_LIBRARY
        .map(filterNode)
        .filter((cat): cat is CircuitCategory => cat !== null);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-[#1e1e1e] border border-zinc-700 rounded-lg shadow-2xl w-[600px] h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-[#252525]">
                    <h2 className="text-white font-bold text-sm uppercase tracking-wider">Circuit Library</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-3 border-b border-zinc-700 bg-[#222222]">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search circuits and categories..."
                        className="w-full px-3 py-2 rounded bg-zinc-900 text-zinc-100 placeholder-zinc-500 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {filteredLibrary.map(cat => renderItem(cat))}

                    {normalizedQuery && filteredLibrary.length === 0 && (
                        <div className="text-center text-zinc-500 text-xs py-8">
                            No circuits found for "{searchQuery.trim()}".
                        </div>
                    )}
                </div>
                <div className="p-3 border-t border-zinc-700 bg-[#252525] text-[10px] text-zinc-500 text-center">
                    Select a circuit to load. Note: Many examples are placeholders.
                </div>
            </div>
        </div>
    );
};
