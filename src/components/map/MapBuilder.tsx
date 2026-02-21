'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { findPath } from '@/ar/pathfinding';
import type { NavigationNode, NavigationGraph, Neighbor } from '@/lib/mapData';
import MapCanvas from './MapCanvas';
import Toolbar from './Toolbar';
import PropertiesPanel from './PropertiesPanel';
import PathSimulator from './PathSimulator';

// ── Types ────────────────────────────────────────────────────

export interface MapNode {
  id: string;
  x: number;
  z: number;
  floor_id: string;
  type: 'normal' | 'entrance' | 'section';
  label: string | null;
}

export interface MapEdge {
  id: string;
  nodeA: string;
  nodeB: string;
}

export interface MapSection {
  id: string;
  name: string;
  node_id: string;
  floor_id: string;
}

interface FloorData {
  id: string;
  name: string;
  level_number: number;
  store_version_id: string | null;
  floorplan_image_url: string | null;
}

export type Tool = 'select' | 'addNode' | 'connect' | 'delete';
export type NodeType = 'normal' | 'entrance' | 'section';

interface MapBuilderProps {
  storeId?: string;
  versionId?: string;
}

// ── Component ────────────────────────────────────────────────

export default function MapBuilder({ storeId: propStoreId, versionId: propVersionId }: MapBuilderProps = {}) {
  // Memoize Supabase client so it's created once per component lifecycle
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  // Data
  const [floor, setFloor] = useState<FloorData | null>(null);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [sections, setSections] = useState<MapSection[]>([]);
  const [storeName, setStoreName] = useState('');
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

  // UI
  const [tool, setTool] = useState<Tool>('select');
  const [nodeType, setNodeType] = useState<NodeType>('normal');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [pixelsPerMeter] = useState(40);

  // Path simulation
  const [simPath, setSimPath] = useState<NavigationNode[] | null>(null);
  const [simDistance, setSimDistance] = useState(0);

  // Status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Ref to track if initial load has happened
  const loadedRef = useRef(false);

  // ── Data Loading ─────────────────────────────────────────────

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propStoreId, propVersionId]);

  async function loadData() {
    setLoading(true);
    try {
      if (propVersionId) {
        // ── Version-based loading (from store detail page) ──
        console.log('[MapBuilder] Loading with versionId:', propVersionId, 'storeId:', propStoreId);

        if (propStoreId) {
          const { data: store } = await supabase
            .from('stores')
            .select('name')
            .eq('id', propStoreId)
            .single();
          if (store) setStoreName(store.name);
        }

        setCurrentVersionId(propVersionId);

        // Get floor for this version
        let { data: floors } = await supabase
          .from('floors')
          .select('*')
          .eq('store_version_id', propVersionId)
          .order('level_number')
          .limit(1);

        if (!floors || floors.length === 0) {
          // Create a default floor for this version
          console.log('[MapBuilder] No floor found, creating default floor for version:', propVersionId);
          const { data: newFloor, error: floorError } = await supabase
            .from('floors')
            .insert({
              name: 'Ground Floor',
              level_number: 0,
              store_version_id: propVersionId,
            })
            .select()
            .single();
          if (floorError) {
            console.error('[MapBuilder] Failed to create floor:', floorError);
            setStatusMsg(`Failed to create floor: ${floorError.message}`);
            setLoading(false);
            return;
          }
          if (newFloor) floors = [newFloor];
        }

        if (floors && floors.length > 0) {
          const currentFloor: FloorData = {
            id: floors[0].id,
            name: floors[0].name,
            level_number: floors[0].level_number,
            store_version_id: floors[0].store_version_id,
            floorplan_image_url: floors[0].floorplan_image_url,
          };
          setFloor(currentFloor);
          await loadFloorData(currentFloor.id);
        }
      } else {
        // ── Legacy mode: auto-create store → version → floor chain ──
        console.log('[MapBuilder] Loading in legacy mode (no versionId provided)');
        await loadLegacyData();
      }
    } catch (err) {
      console.error('[MapBuilder] Failed to load map data:', err);
      setStatusMsg('Failed to load data');
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }

  async function loadFloorData(floorId: string) {
    console.log('[MapBuilder] Loading floor data for floorId:', floorId);

    try {
      const res = await fetch('/api/admin/map-builder-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loadFloorData', floorId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error('[MapBuilder] Load floor data failed:', data.error);
        setStatusMsg(`Failed to load floor data: ${data.error || 'Unknown error'}`);
        return;
      }

      // Transform nodes
      const loadedNodes: MapNode[] = (data.nodes || []).map((n: Record<string, unknown>) => ({
        id: n.id as string,
        x: n.x as number,
        z: n.z as number,
        floor_id: n.floor_id as string,
        type: ((n.type as string) || 'normal') as MapNode['type'],
        label: n.label as string | null,
      }));
      setNodes(loadedNodes);

      // Deduplicate edges
      const seenEdgePairs = new Set<string>();
      const loadedEdges: MapEdge[] = [];
      for (const e of data.edges || []) {
        const key = [e.from_node, e.to_node].sort().join('|');
        if (!seenEdgePairs.has(key)) {
          seenEdgePairs.add(key);
          loadedEdges.push({
            id: e.id,
            nodeA: e.from_node,
            nodeB: e.to_node,
          });
        }
      }
      setEdges(loadedEdges);

      // Sections
      const loadedSections: MapSection[] = (data.sections || []).map(
        (s: Record<string, unknown>) => ({
          id: s.id as string,
          name: s.name as string,
          node_id: s.node_id as string,
          floor_id: (s.floor_id as string) || floorId,
        })
      );
      setSections(loadedSections);

      console.log('[MapBuilder] Loaded:', {
        nodes: loadedNodes.length,
        edges: loadedEdges.length,
        sections: loadedSections.length,
        floor_id: floorId,
      });
      setStatusMsg(`Loaded ${loadedNodes.length} nodes, ${loadedEdges.length} edges`);
    } catch (err) {
      console.error('[MapBuilder] Load floor data failed:', err);
      setStatusMsg('Failed to load floor data — check console');
    }
  }

  async function loadLegacyData() {
    // Use server-side API to create store/version/floor chain
    // This bypasses RLS policies using the service role key
    console.log('[MapBuilder] Initializing via server-side API...');
    setStatusMsg('Initializing map data...');

    try {
      const res = await fetch('/api/admin/map-builder-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[MapBuilder] Init API failed:', errData);
        setStatusMsg(`Initialization failed: ${errData.error || res.statusText}`);
        return;
      }

      const data = await res.json();
      console.log('[MapBuilder] Init API response:', data);

      if (!data.success || !data.floor) {
        setStatusMsg('Failed to initialize map data');
        return;
      }

      setStoreName(data.storeName || 'My Store');
      setCurrentVersionId(data.versionId);

      const currentFloor: FloorData = {
        id: data.floor.id,
        name: data.floor.name,
        level_number: data.floor.level_number,
        store_version_id: data.floor.store_version_id,
        floorplan_image_url: data.floor.floorplan_image_url,
      };

      setFloor(currentFloor);
      console.log('[MapBuilder] Using floor:', currentFloor.id);
      await loadFloorData(currentFloor.id);
    } catch (err) {
      console.error('[MapBuilder] Legacy init failed:', err);
      setStatusMsg('Failed to initialize — check console for details');
    }
  }

  // ── Save ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!floor) return;
    setSaving(true);
    setStatusMsg('Saving...');

    try {
      const res = await fetch('/api/admin/map-builder-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          floorId: floor.id,
          nodes: nodes.map((n) => ({ id: n.id, x: n.x, z: n.z, type: n.type, label: n.label })),
          edges: edges.map((e) => ({ nodeA: e.nodeA, nodeB: e.nodeB })),
          sections: sections.map((s) => ({ id: s.id, name: s.name, node_id: s.node_id })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }

      setDirty(false);
      setStatusMsg('Saved successfully ✓');
      console.log('[MapBuilder] Saved:', { nodes: nodes.length, edges: edges.length, sections: sections.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MapBuilder] Save failed:', err);
      setStatusMsg(`Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Floor Plan Upload ────────────────────────────────────────

  async function handleUploadFloorPlan(file: File) {
    if (!floor) return;
    setStatusMsg('Uploading floor plan...');

    try {
      const filePath = `${floor.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('floorplans')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('floorplans').getPublicUrl(filePath);

      await supabase
        .from('floors')
        .update({ floorplan_image_url: publicUrl })
        .eq('id', floor.id);

      setFloor((prev) =>
        prev ? { ...prev, floorplan_image_url: publicUrl } : prev
      );
      setStatusMsg('Floor plan uploaded ✓');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MapBuilder] Upload failed:', err);
      setStatusMsg(`Upload failed: ${message}`);
    }
  }

  // ── Canvas Event Handlers ───────────────────────────────────

  const handleCanvasClick = useCallback(
    async (meterX: number, meterZ: number) => {
      if (tool !== 'addNode' || !floor) return;

      let x = meterX;
      let z = meterZ;
      if (snapToGrid) {
        x = Math.round(x * 2) / 2;
        z = Math.round(z * 2) / 2;
      }

      // Enforce single entrance per floor
      let updatedNodes = nodes;
      if (nodeType === 'entrance') {
        updatedNodes = nodes.map((n) =>
          n.type === 'entrance' ? { ...n, type: 'normal' as const } : n
        );
      }

      const tempId = crypto.randomUUID();
      const newNode: MapNode = {
        id: tempId,
        x,
        z,
        floor_id: floor.id,
        type: nodeType,
        label: null,
      };

      // Optimistic update
      const newNodes = [...updatedNodes, newNode];
      setNodes(newNodes);
      setSelectedNodeId(tempId);
      setDirty(true);

      // Insert via server-side API (bypasses RLS)
      const res = await fetch('/api/admin/map-builder-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addNode',
          id: tempId,
          x,
          z,
          floorId: floor.id,
          type: nodeType,
          label: null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Roll back
        console.error('[MapBuilder] Node insert failed, rolling back:', data.error);
        setNodes((prev) => prev.filter((n) => n.id !== tempId));
        setSelectedNodeId(null);
        setStatusMsg(`Failed to add node: ${data.error || 'Unknown error'}`);
      } else {
        console.log('[MapBuilder] Node inserted:', tempId);
      }
    },
    [tool, nodeType, floor, snapToGrid, nodes]
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (tool === 'select') {
        setSelectedNodeId(nodeId);
      } else if (tool === 'connect') {
        if (!connectFromId) {
          setConnectFromId(nodeId);
        } else if (connectFromId !== nodeId) {
          const exists = edges.some(
            (e) =>
              (e.nodeA === connectFromId && e.nodeB === nodeId) ||
              (e.nodeA === nodeId && e.nodeB === connectFromId)
          );
          if (!exists) {
            const edgeId = crypto.randomUUID();
            const newEdge: MapEdge = { id: edgeId, nodeA: connectFromId, nodeB: nodeId };

            // Optimistic update
            setEdges((prev) => [...prev, newEdge]);
            setDirty(true);

            // Insert via server-side API (bypasses RLS)
            if (floor) {
              const insertEdges = async () => {
                const res = await fetch('/api/admin/map-builder-data', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'addEdge',
                    nodeA: connectFromId,
                    nodeB: nodeId,
                    floorId: floor.id,
                  }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                  console.error('[MapBuilder] Edge insert failed, rolling back:', data.error);
                  setEdges((prev) => prev.filter((e) => e.id !== edgeId));
                  setStatusMsg(`Failed to add edge: ${data.error || 'Unknown error'}`);
                } else {
                  console.log('[MapBuilder] Edge inserted:', connectFromId, '↔', nodeId);
                }
              };
              insertEdges();
            }
          }
          setConnectFromId(null);
        }
      } else if (tool === 'delete') {
        // Delete node and its edges/sections
        const deleteNode = async () => {
          setNodes((prev) => prev.filter((n) => n.id !== nodeId));
          setEdges((prev) =>
            prev.filter((e) => e.nodeA !== nodeId && e.nodeB !== nodeId)
          );
          setSections((prev) => prev.filter((s) => s.node_id !== nodeId));
          if (selectedNodeId === nodeId) setSelectedNodeId(null);
          if (connectFromId === nodeId) setConnectFromId(null);
          setDirty(true);

          // Delete via server-side API (bypasses RLS)
          const res = await fetch('/api/admin/map-builder-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'deleteNode',
              nodeId,
              floorId: floor?.id,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            console.error('[MapBuilder] Node delete failed:', data.error);
            setStatusMsg(`Delete failed: ${data.error || 'Unknown error'}`);
          }
        };
        deleteNode();
      }
    },
    [tool, connectFromId, edges, selectedNodeId, floor]
  );

  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      if (tool === 'delete') {
        const edge = edges.find((e) => e.id === edgeId);
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
        setDirty(true);

        // Delete via server-side API (bypasses RLS)
        if (edge && floor) {
          const deleteEdge = async () => {
            await fetch('/api/admin/map-builder-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'deleteEdge',
                nodeA: edge.nodeA,
                nodeB: edge.nodeB,
                floorId: floor.id,
              }),
            });
          };
          deleteEdge();
        }
      }
    },
    [tool, edges, floor]
  );

  const handleNodeDrag = useCallback(
    (nodeId: string, newX: number, newZ: number) => {
      let x = newX;
      let z = newZ;
      if (snapToGrid) {
        x = Math.round(x * 2) / 2;
        z = Math.round(z * 2) / 2;
      }
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, x, z } : n))
      );
      setDirty(true);
    },
    [snapToGrid]
  );

  // ── Properties Panel Handlers ───────────────────────────────

  function handleUpdateNodeType(nodeId: string, newType: NodeType) {
    if (newType === 'entrance') {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) return { ...n, type: newType };
          if (n.type === 'entrance') return { ...n, type: 'normal' };
          return n;
        })
      );
    } else {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, type: newType } : n))
      );
      if (newType !== 'section') {
        setSections((prev) => prev.filter((s) => s.node_id !== nodeId));
      }
    }
    setDirty(true);
  }

  function handleUpdateNodeLabel(nodeId: string, label: string) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, label: label || null } : n
      )
    );
    setDirty(true);
  }

  function handleCreateSection(nodeId: string, name: string) {
    if (!floor) return;
    const filtered = sections.filter((s) => s.node_id !== nodeId);
    filtered.push({
      id: crypto.randomUUID(),
      name,
      node_id: nodeId,
      floor_id: floor.id,
    });
    setSections(filtered);
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, type: 'section' as const } : n
      )
    );
    setDirty(true);
  }

  function handleDeleteSection(nodeId: string) {
    setSections((prev) => prev.filter((s) => s.node_id !== nodeId));
    setDirty(true);
  }

  // ── Path Simulation ─────────────────────────────────────────

  function handleSimulate(startNodeId: string, targetSectionId: string) {
    const section = sections.find((s) => s.id === targetSectionId);
    if (!section) {
      setSimPath(null);
      setStatusMsg('Section not found');
      return;
    }

    const graph = buildGraphFromState();
    const result = findPath(graph, startNodeId, section.node_id);

    if (result.found) {
      setSimPath(result.waypoints);
      setSimDistance(result.totalDistance);
      setStatusMsg(
        `Path found: ${result.waypoints.length} waypoints, ${result.totalDistance.toFixed(1)}m`
      );
    } else {
      setSimPath(null);
      setSimDistance(0);
      setStatusMsg('No path found — ensure nodes are connected with edges');
    }
  }

  function handleClearSimulation() {
    setSimPath(null);
    setSimDistance(0);
  }

  function buildGraphFromState(): NavigationGraph {
    const nodeMap = new Map<string, NavigationNode>();
    for (const n of nodes) {
      nodeMap.set(n.id, {
        id: n.id,
        x: n.x,
        z: n.z,
        floor_id: n.floor_id,
        walkable: true,
        label: n.label,
        type: n.type,
      });
    }

    const graphEdges: { id: string; from_node: string; to_node: string; distance: number }[] = [];
    for (const e of edges) {
      const a = nodeMap.get(e.nodeA);
      const b = nodeMap.get(e.nodeB);
      if (a && b) {
        const dist = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
        graphEdges.push(
          { id: `${e.id}-ab`, from_node: e.nodeA, to_node: e.nodeB, distance: dist },
          { id: `${e.id}-ba`, from_node: e.nodeB, to_node: e.nodeA, distance: dist }
        );
      }
    }

    const adjacency = new Map<string, Neighbor[]>();
    for (const [id] of nodeMap) {
      adjacency.set(id, []);
    }
    for (const edge of graphEdges) {
      adjacency.get(edge.from_node)?.push({
        nodeId: edge.to_node,
        distance: edge.distance,
      });
    }

    const entrance = nodes.find((n) => n.type === 'entrance');

    return {
      nodes: nodeMap,
      edges: graphEdges,
      adjacency,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        node_id: s.node_id,
        icon: null,
      })),
      floors: floor
        ? [{ id: floor.id, name: floor.name, level_number: floor.level_number }]
        : [],
      entranceNodeId: entrance?.id || nodes[0]?.id || '',
    };
  }

  // ── Auto-Generate Grid ──────────────────────────────────────

  async function handleAutoGenerateGrid() {
    if (!floor) return;

    const gridSize = 5; // 5x5 grid
    const spacing = 2; // 2 meters apart
    const startX = -((gridSize - 1) * spacing) / 2;
    const startZ = 0;

    const newNodes: MapNode[] = [];
    const newEdges: MapEdge[] = [];

    // Generate nodes
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const nodeId = crypto.randomUUID();
        let type: MapNode['type'] = 'normal';
        let label: string | null = null;

        // Mark center bottom as entrance
        if (row === 0 && col === Math.floor(gridSize / 2)) {
          type = 'entrance';
          label = 'Entrance';
        }

        newNodes.push({
          id: nodeId,
          x: startX + col * spacing,
          z: startZ + row * spacing,
          floor_id: floor.id,
          type,
          label,
        });
      }
    }

    // Generate edges (horizontal + vertical)
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col;
        // Connect right
        if (col < gridSize - 1) {
          newEdges.push({
            id: crypto.randomUUID(),
            nodeA: newNodes[idx].id,
            nodeB: newNodes[idx + 1].id,
          });
        }
        // Connect down
        if (row < gridSize - 1) {
          newEdges.push({
            id: crypto.randomUUID(),
            nodeA: newNodes[idx].id,
            nodeB: newNodes[idx + gridSize].id,
          });
        }
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setSections([]);
    setDirty(true);
    setStatusMsg(`Generated ${newNodes.length} nodes and ${newEdges.length} edges`);
  }

  // ── Clear All ───────────────────────────────────────────────

  async function handleClearAll() {
    if (!floor) return;
    const confirmed = window.confirm(
      `Clear all ${nodes.length} nodes and ${edges.length} edges? This cannot be undone until you save.`
    );
    if (!confirmed) return;

    setNodes([]);
    setEdges([]);
    setSections([]);
    setSelectedNodeId(null);
    setConnectFromId(null);
    setSimPath(null);
    setSimDistance(0);
    setDirty(true);
    setStatusMsg('Cleared all nodes and edges');
  }

  // ── Tool Change Handler ──────────────────────────────────────

  function handleToolChange(newTool: Tool) {
    setTool(newTool);
    setConnectFromId(null);
    if (newTool !== 'select') {
      setSelectedNodeId(null);
    }
  }

  // ── Back Navigation ─────────────────────────────────────────

  function handleBack() {
    if (propStoreId) {
      router.push(`/admin/stores/${propStoreId}`);
    } else {
      router.push('/admin/dashboard');
    }
  }

  // ── Render ───────────────────────────────────────────────────

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedSection =
    selectedNode
      ? sections.find((s) => s.node_id === selectedNode.id) || null
      : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050508]">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner" />
          <p className="text-white/50 text-sm">Loading map data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a12] text-white overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-[#0d0d18] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-white/40 hover:text-white/70 transition-colors mr-1"
            title="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold tracking-wide text-white/90">
            Map Builder
          </h1>
          {storeName && (
            <span className="text-xs text-white/30">
              {storeName}
            </span>
          )}
          <span className="text-xs text-white/30">
            {floor?.name || 'No floor'}
          </span>

          {/* Live node/edge counts */}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
              {nodes.length} nodes
            </span>
            <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
              {edges.length} edges
            </span>
            {sections.length > 0 && (
              <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
                {sections.length} sections
              </span>
            )}
          </div>

          {dirty && (
            <span className="text-xs text-amber-400/80">Unsaved changes</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {statusMsg && (
            <span className="text-xs text-white/40 max-w-xs truncate">
              {statusMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <Toolbar
          tool={tool}
          nodeType={nodeType}
          showGrid={showGrid}
          snapToGrid={snapToGrid}
          onToolChange={handleToolChange}
          onNodeTypeChange={setNodeType}
          onToggleGrid={() => setShowGrid((v) => !v)}
          onToggleSnap={() => setSnapToGrid((v) => !v)}
          onUploadFloorPlan={handleUploadFloorPlan}
          onAutoGenerateGrid={handleAutoGenerateGrid}
          onClearAll={handleClearAll}
          nodeCount={nodes.length}
        />

        {/* Canvas */}
        <div className="flex-1 relative">
          {nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="text-center">
                <p className="text-white/25 text-sm mb-1">No nodes on this floor</p>
                <p className="text-white/15 text-xs">
                  Select the <strong>Add Node (+)</strong> tool and click on the grid, or use <strong>Auto Grid</strong>
                </p>
              </div>
            </div>
          )}
          <MapCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            connectFromId={connectFromId}
            showGrid={showGrid}
            pixelsPerMeter={pixelsPerMeter}
            tool={tool}
            floorPlanUrl={floor?.floorplan_image_url || null}
            simulatedPath={simPath}
            onCanvasClick={handleCanvasClick}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onNodeDrag={handleNodeDrag}
            onDeselect={() => {
              setSelectedNodeId(null);
              setConnectFromId(null);
            }}
          />
        </div>

        {/* Properties Panel */}
        <PropertiesPanel
          selectedNode={selectedNode}
          selectedSection={selectedSection}
          onUpdateType={handleUpdateNodeType}
          onUpdateLabel={handleUpdateNodeLabel}
          onCreateSection={handleCreateSection}
          onDeleteSection={handleDeleteSection}
          onDeleteNode={(nodeId) => {
            setNodes((prev) => prev.filter((n) => n.id !== nodeId));
            setEdges((prev) =>
              prev.filter((e) => e.nodeA !== nodeId && e.nodeB !== nodeId)
            );
            setSections((prev) => prev.filter((s) => s.node_id !== nodeId));
            setSelectedNodeId(null);
            setDirty(true);

            // Delete from Supabase
            supabase
              .from('navigation_nodes')
              .delete()
              .eq('id', nodeId)
              .then(({ error }) => {
                if (error) console.error('[MapBuilder] Delete node failed:', error);
              });
          }}
        />
      </div>

      {/* Path Simulator */}
      <PathSimulator
        nodes={nodes}
        sections={sections}
        simulatedPath={simPath}
        simulatedDistance={simDistance}
        onSimulate={handleSimulate}
        onClear={handleClearSimulation}
      />
    </div>
  );
}
