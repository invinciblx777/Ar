'use client';

import { useState } from 'react';
import type { MapNode, MapSection } from './MapBuilder';
import type { NavigationNode } from '@/lib/mapData';

interface PathSimulatorProps {
  nodes: MapNode[];
  sections: MapSection[];
  simulatedPath: NavigationNode[] | null;
  simulatedDistance: number;
  onSimulate: (startNodeId: string, targetSectionId: string) => void;
  onClear: () => void;
}

export default function PathSimulator({
  nodes,
  sections,
  simulatedPath,
  simulatedDistance,
  onSimulate,
  onClear,
}: PathSimulatorProps) {
  const [startNodeId, setStartNodeId] = useState('');
  const [targetSectionId, setTargetSectionId] = useState('');

  function handleSimulate() {
    if (startNodeId && targetSectionId) {
      onSimulate(startNodeId, targetSectionId);
    }
  }

  const entranceNodes = nodes.filter((n) => n.type === 'entrance');
  const allNodes = nodes;
  const hasEnoughNodes = nodes.length >= 2;
  const hasSections = sections.length > 0;
  const canSimulate = startNodeId && targetSectionId && hasEnoughNodes;

  // Empty state
  if (nodes.length === 0) {
    return (
      <div className="h-12 bg-[#0d0d18] border-t border-white/10 flex items-center px-4 gap-4 shrink-0">
        <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium shrink-0">
          Path Sim
        </span>
        <span className="text-[11px] text-white/20 italic">
          Add nodes to enable path simulation
        </span>
      </div>
    );
  }

  return (
    <div className="h-12 bg-[#0d0d18] border-t border-white/10 flex items-center px-4 gap-4 shrink-0">
      <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium shrink-0">
        Path Sim
      </span>

      {/* Start node */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-white/40 shrink-0">From:</label>
        <select
          value={startNodeId}
          onChange={(e) => setStartNodeId(e.target.value)}
          className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[11px] text-white/70 outline-none focus:border-accent/40 min-w-[140px] appearance-none cursor-pointer"
        >
          <option value="">Select start node</option>
          {entranceNodes.length > 0 && (
            <optgroup label="Entrances">
              {entranceNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label || `Entrance (${n.x.toFixed(1)}, ${n.z.toFixed(1)})`}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="All Nodes">
            {allNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label || `${n.type} (${n.x.toFixed(1)}, ${n.z.toFixed(1)})`}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Target section */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-white/40 shrink-0">To:</label>
        <select
          value={targetSectionId}
          onChange={(e) => setTargetSectionId(e.target.value)}
          className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[11px] text-white/70 outline-none focus:border-accent/40 min-w-[140px] appearance-none cursor-pointer"
        >
          <option value="">
            {hasSections ? 'Select section' : 'No sections — mark a node as Section first'}
          </option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Simulate button */}
      <button
        onClick={handleSimulate}
        disabled={!canSimulate}
        className="px-4 py-1 rounded-lg text-[11px] font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title={
          !hasEnoughNodes
            ? 'Add at least 2 nodes to simulate'
            : !hasSections
              ? 'Create sections to set destinations'
              : !startNodeId || !targetSectionId
                ? 'Select start and destination'
                : 'Run A* pathfinding simulation'
        }
      >
        Simulate
      </button>

      {/* Clear button */}
      {simulatedPath && (
        <button
          onClick={onClear}
          className="px-3 py-1 rounded-lg text-[11px] font-medium text-white/40 border border-white/10 hover:bg-white/5 transition-colors"
        >
          Clear
        </button>
      )}

      {/* Path info */}
      {simulatedPath && (
        <div className="flex items-center gap-3 ml-auto text-[11px] text-white/50">
          <span>
            {simulatedPath.length} waypoints
          </span>
          <span className="text-accent font-medium">
            {simulatedDistance.toFixed(1)}m
          </span>
        </div>
      )}
    </div>
  );
}
