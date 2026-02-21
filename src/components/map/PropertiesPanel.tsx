'use client';

import { useState, useEffect } from 'react';
import type { MapNode, MapSection, NodeType } from './MapBuilder';

interface PropertiesPanelProps {
  selectedNode: MapNode | null;
  selectedSection: MapSection | null;
  onUpdateType: (nodeId: string, type: NodeType) => void;
  onUpdateLabel: (nodeId: string, label: string) => void;
  onCreateSection: (
    nodeId: string,
    name: string,
    metadata?: { icon?: string; description?: string; category?: string }
  ) => void;
  onDeleteSection: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

const SECTION_CATEGORIES = [
  'general',
  'billing',
  'electronics',
  'groceries',
  'clothing',
  'services',
  'food',
  'health',
];

const SECTION_ICONS = [
  '📍', '💳', '📱', '🛒', '👕', '🔧', '🍕', '💊',
  '🏪', '🎮', '📚', '🧴', '🏠', '🎵', '⚡', '🌿',
];

export default function PropertiesPanel({
  selectedNode,
  selectedSection,
  onUpdateType,
  onUpdateLabel,
  onCreateSection,
  onDeleteSection,
  onDeleteNode,
}: PropertiesPanelProps) {
  const [label, setLabel] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [sectionIcon, setSectionIcon] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');
  const [sectionCategory, setSectionCategory] = useState('general');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Sync label with selected node
  useEffect(() => {
    setLabel(selectedNode?.label || '');
    setShowConfirmDelete(false);
  }, [selectedNode?.id, selectedNode?.label]);

  // Sync section fields
  useEffect(() => {
    setSectionName(selectedSection?.name || '');
    setSectionIcon(selectedSection?.icon || '');
    setSectionDescription(selectedSection?.description || '');
    setSectionCategory(selectedSection?.category || 'general');
  }, [selectedSection?.name, selectedSection?.icon, selectedSection?.description, selectedSection?.category, selectedNode?.id]);

  if (!selectedNode) {
    return (
      <aside className="w-[260px] bg-[#0d0d18] border-l border-white/10 flex flex-col items-center justify-center shrink-0">
        <div className="text-center px-4">
          <svg className="mx-auto mb-3 text-white/10" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs text-white/20">Select a node to edit</p>
          <p className="text-[10px] text-white/10 mt-1">Click on any node in the map</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[260px] bg-[#0d0d18] border-l border-white/10 flex flex-col shrink-0 overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Header */}
        <div>
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Node Properties
          </h3>
          <p className="text-[10px] text-white/25 mt-1 font-mono truncate">
            {selectedNode.id.slice(0, 20)}...
          </p>
        </div>

        {/* Position */}
        <div>
          <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-2">
            Position (meters)
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="text-[9px] text-white/30">X</span>
              <div className="mt-0.5 px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-white/70 font-mono">
                {selectedNode.x.toFixed(2)}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-[9px] text-white/30">Z</span>
              <div className="mt-0.5 px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-white/70 font-mono">
                {selectedNode.z.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-2">
            Type
          </label>
          <select
            value={selectedNode.type}
            onChange={(e) =>
              onUpdateType(selectedNode.id, e.target.value as NodeType)
            }
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 outline-none focus:border-accent/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="normal">Normal</option>
            <option value="entrance">Entrance</option>
            <option value="section">Section</option>
            <option value="qr_anchor">QR Anchor</option>
          </select>
        </div>

        {/* Label */}
        <div>
          <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-2">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => onUpdateLabel(selectedNode.id, label)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onUpdateLabel(selectedNode.id, label);
            }}
            placeholder="Optional label"
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder-white/20 outline-none focus:border-accent/40 transition-colors"
          />
        </div>

        {/* QR Anchor info */}
        {selectedNode.type === 'qr_anchor' && (
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <p className="text-xs text-purple-400 font-medium">QR Anchor Node</p>
            <p className="text-[10px] text-white/40 mt-1">
              Generate a QR code for this node in the QR Manager page. Users scan this to calibrate their position.
            </p>
          </div>
        )}

        {/* Section config (visible for section-type nodes) */}
        {selectedNode.type === 'section' && (
          <div className="pt-3 border-t border-white/10 space-y-3">
            <label className="block text-[10px] text-white/40 uppercase tracking-wider">
              Section Details
            </label>

            {/* Name */}
            <div>
              <label className="block text-[9px] text-white/30 mb-1">Name</label>
              <input
                type="text"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="e.g. Electronics"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder-white/20 outline-none focus:border-accent/40 transition-colors"
              />
            </div>

            {/* Icon */}
            <div>
              <label className="block text-[9px] text-white/30 mb-1">Icon</label>
              <div className="flex gap-1 flex-wrap">
                {SECTION_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setSectionIcon(icon)}
                    className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-all ${
                      sectionIcon === icon
                        ? 'bg-accent/20 border border-accent/40 scale-110'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[9px] text-white/30 mb-1">Category</label>
              <select
                value={sectionCategory}
                onChange={(e) => setSectionCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 outline-none focus:border-accent/40 appearance-none cursor-pointer capitalize"
              >
                {SECTION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[9px] text-white/30 mb-1">Description</label>
              <textarea
                value={sectionDescription}
                onChange={(e) => setSectionDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder-white/20 outline-none focus:border-accent/40 transition-colors resize-none"
              />
            </div>

            {/* Save / Delete */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (sectionName.trim()) {
                    onCreateSection(selectedNode.id, sectionName.trim(), {
                      icon: sectionIcon,
                      description: sectionDescription,
                      category: sectionCategory,
                    });
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-accent/15 text-accent text-xs font-medium border border-accent/30 hover:bg-accent/25 transition-colors"
              >
                {selectedSection ? 'Update Section' : 'Create Section'}
              </button>
            </div>

            {selectedSection && (
              <button
                onClick={() => onDeleteSection(selectedNode.id)}
                className="w-full text-[10px] text-red-400/60 hover:text-red-400 transition-colors text-center py-1"
              >
                Remove section
              </button>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/10" />

        {/* Delete node */}
        {showConfirmDelete ? (
          <div className="space-y-2">
            <p className="text-xs text-red-400/80 text-center">Delete this node?</p>
            <div className="flex gap-2">
              <button
                onClick={() => onDeleteNode(selectedNode.id)}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white/40 border border-white/10 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="w-full py-2 rounded-lg text-xs font-medium text-red-400/70 border border-red-400/20 hover:bg-red-400/10 hover:text-red-400 transition-colors"
          >
            Delete Node
          </button>
        )}
      </div>
    </aside>
  );
}
