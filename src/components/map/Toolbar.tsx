'use client';

import { useRef } from 'react';
import type { Tool, NodeType } from './MapBuilder';

interface ToolbarProps {
  tool: Tool;
  nodeType: NodeType;
  showGrid: boolean;
  snapToGrid: boolean;
  onToolChange: (tool: Tool) => void;
  onNodeTypeChange: (type: NodeType) => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onUploadFloorPlan: (file: File) => void;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: 'S' },
  { id: 'addNode', label: 'Add Node', icon: '+' },
  { id: 'connect', label: 'Connect', icon: 'C' },
  { id: 'delete', label: 'Delete', icon: 'X' },
];

const NODE_TYPES: { id: NodeType; label: string; color: string }[] = [
  { id: 'normal', label: 'Normal', color: '#00f0ff' },
  { id: 'entrance', label: 'Entrance', color: '#00ff88' },
  { id: 'section', label: 'Section', color: '#ff8800' },
  { id: 'qr_anchor', label: 'QR Anchor', color: '#ff00ff' },
];

export default function Toolbar({
  tool,
  nodeType,
  showGrid,
  snapToGrid,
  onToolChange,
  onNodeTypeChange,
  onToggleGrid,
  onToggleSnap,
  onUploadFloorPlan,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFloorPlan(file);
      e.target.value = '';
    }
  }

  return (
    <aside className="w-[72px] bg-[#0d0d18] border-r border-white/10 flex flex-col items-center py-4 gap-1 shrink-0">
      {/* Tool buttons */}
      <div className="flex flex-col gap-1 w-full px-2">
        <span className="text-[9px] text-white/30 uppercase tracking-wider text-center mb-1">
          Tools
        </span>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            className={`w-full h-10 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
              tool === t.id
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80 border border-transparent'
            }`}
            title={t.label}
          >
            <span className="text-sm font-bold">{t.icon}</span>
          </button>
        ))}
      </div>

      {/* Node type selector (visible when addNode tool is active) */}
      {tool === 'addNode' && (
        <div className="flex flex-col gap-1 w-full px-2 mt-3 pt-3 border-t border-white/10">
          <span className="text-[9px] text-white/30 uppercase tracking-wider text-center mb-1">
            Type
          </span>
          {NODE_TYPES.map((nt) => (
            <button
              key={nt.id}
              onClick={() => onNodeTypeChange(nt.id)}
              className={`w-full h-8 rounded-lg flex items-center justify-center gap-1 text-[10px] font-medium transition-all ${
                nodeType === nt.id
                  ? 'border border-white/30 bg-white/10'
                  : 'text-white/40 hover:bg-white/5 border border-transparent'
              }`}
              title={nt.label}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: nt.color }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="w-full px-3 my-2">
        <div className="h-px bg-white/10" />
      </div>

      {/* Grid & Snap toggles */}
      <div className="flex flex-col gap-1 w-full px-2">
        <span className="text-[9px] text-white/30 uppercase tracking-wider text-center mb-1">
          View
        </span>
        <button
          onClick={onToggleGrid}
          className={`w-full h-8 rounded-lg flex items-center justify-center text-[10px] font-medium transition-all ${
            showGrid
              ? 'bg-white/10 text-white/80 border border-white/20'
              : 'text-white/40 hover:bg-white/5 border border-transparent'
          }`}
          title="Toggle Grid"
        >
          Grid
        </button>
        <button
          onClick={onToggleSnap}
          className={`w-full h-8 rounded-lg flex items-center justify-center text-[10px] font-medium transition-all ${
            snapToGrid
              ? 'bg-white/10 text-white/80 border border-white/20'
              : 'text-white/40 hover:bg-white/5 border border-transparent'
          }`}
          title="Snap to Grid"
        >
          Snap
        </button>
      </div>

      {/* Divider */}
      <div className="w-full px-3 my-2">
        <div className="h-px bg-white/10" />
      </div>

      {/* Floor plan upload */}
      <div className="flex flex-col gap-1 w-full px-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-10 rounded-lg flex items-center justify-center text-[10px] font-medium text-white/40 hover:bg-white/5 hover:text-white/80 border border-transparent transition-all"
          title="Upload Floor Plan"
        >
          Image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </aside>
  );
}
