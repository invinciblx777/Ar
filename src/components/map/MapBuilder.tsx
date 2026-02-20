'use client';

import { useState, useEffect, useCallback } from 'react';
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
  store_id: string | null;
  floorplan_image_url: string | null;
}

export type Tool = 'select' | 'addNode' | 'connect' | 'delete';
export type NodeType = 'normal' | 'entrance' | 'section';

// ── Component ────────────────────────────────────────────────

export default function MapBuilder() {
  const supabase = createSupabaseBrowserClient();

  // Data
  const [storeId, setStoreId] = useState<string | null>(null);
  const [floor, setFloor] = useState<FloorData | null>(null);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [sections, setSections] = useState<MapSection[]>([]);

  // UI
  const [tool, setTool] = useState<Tool>('select');
  const [nodeType, setNodeType] = useState<NodeType>('normal');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(40);

  // Path simulation
  const [simPath, setSimPath] = useState<NavigationNode[] | null>(null);
  const [simDistance, setSimDistance] = useState(0);

  // Status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // ── Data Loading ─────────────────────────────────────────────

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Get or create store
      let { data: stores } = await supabase
        .from('stores')
        .select('*')
        .limit(1);

      let currentStoreId: string;
      if (!stores || stores.length === 0) {
        const { data: newStore } = await supabase
          .from('stores')
          .insert({ name: 'My Store' })
          .select()
          .single();
        currentStoreId = newStore!.id;
      } else {
        currentStoreId = stores[0].id;
      }
      setStoreId(currentStoreId);

      // Get or create floor
      let { data: floors } = await supabase
        .from('floors')
        .select('*')
        .eq('store_id', currentStoreId)
        .order('level_number')
        .limit(1);

      let currentFloor: FloorData;
      if (!floors || floors.length === 0) {
        // Check for floors without store_id (legacy data)
        const { data: legacyFloors } = await supabase
          .from('floors')
          .select('*')
          .is('store_id', null)
          .order('level_number')
          .limit(1);

        if (legacyFloors && legacyFloors.length > 0) {
          // Adopt legacy floor
          await supabase
            .from('floors')
            .update({ store_id: currentStoreId })
            .eq('id', legacyFloors[0].id);
          currentFloor = { ...legacyFloors[0], store_id: currentStoreId };
        } else {
          const { data: newFloor } = await supabase
            .from('floors')
            .insert({
              name: 'Ground Floor',
              level_number: 0,
              store_id: currentStoreId,
            })
            .select()
            .single();
          currentFloor = newFloor!;
        }
      } else {
        currentFloor = floors[0];
      }
      setFloor(currentFloor);

      // Load navigation data for this floor
      const [nodesRes, edgesRes, sectionsRes] = await Promise.all([
        supabase
          .from('navigation_nodes')
          .select('*')
          .eq('floor_id', currentFloor.id),
        supabase
          .from('navigation_edges')
          .select('*')
          .eq('floor_id', currentFloor.id),
        supabase
          .from('sections')
          .select('*')
          .eq('floor_id', currentFloor.id),
      ]);

      // Transform nodes
      const loadedNodes: MapNode[] = (nodesRes.data || []).map((n: any) => ({
        id: n.id,
        x: n.x,
        z: n.z,
        floor_id: n.floor_id,
        type: n.type || 'normal',
        label: n.label,
      }));
      setNodes(loadedNodes);

      // Deduplicate edges (DB stores bidirectional, builder uses undirected)
      const seenEdgePairs = new Set<string>();
      const loadedEdges: MapEdge[] = [];
      for (const e of edgesRes.data || []) {
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
      const loadedSections: MapSection[] = (sectionsRes.data || []).map(
        (s: any) => ({
          id: s.id,
          name: s.name,
          node_id: s.node_id,
          floor_id: s.floor_id || currentFloor.id,
        })
      );
      setSections(loadedSections);

      setStatusMsg(`Loaded ${loadedNodes.length} nodes, ${loadedEdges.length} edges`);
    } catch (err) {
      console.error('Failed to load map data:', err);
      setStatusMsg('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // ── Save ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!floor) return;
    setSaving(true);
    setStatusMsg('Saving...');

    try {
      const floorId = floor.id;

      // 1. Upsert all current nodes
      if (nodes.length > 0) {
        const { error: nodesErr } = await supabase
          .from('navigation_nodes')
          .upsert(
            nodes.map((n) => ({
              id: n.id,
              x: n.x,
              z: n.z,
              floor_id: floorId,
              type: n.type,
              label: n.label,
              walkable: true,
            }))
          );
        if (nodesErr) throw nodesErr;
      }

      // 2. Delete nodes removed from builder
      const { data: dbNodes } = await supabase
        .from('navigation_nodes')
        .select('id')
        .eq('floor_id', floorId);

      const currentNodeIds = new Set(nodes.map((n) => n.id));
      const removedNodeIds = (dbNodes || [])
        .filter((n: any) => !currentNodeIds.has(n.id))
        .map((n: any) => n.id);

      if (removedNodeIds.length > 0) {
        await supabase
          .from('navigation_nodes')
          .delete()
          .in('id', removedNodeIds);
      }

      // 3. Replace all edges for this floor
      await supabase
        .from('navigation_edges')
        .delete()
        .eq('floor_id', floorId);

      if (edges.length > 0) {
        const edgeRows = edges.flatMap((e) => [
          { from_node: e.nodeA, to_node: e.nodeB, floor_id: floorId },
          { from_node: e.nodeB, to_node: e.nodeA, floor_id: floorId },
        ]);
        const { error: edgesErr } = await supabase
          .from('navigation_edges')
          .insert(edgeRows);
        if (edgesErr) throw edgesErr;
      }

      // 4. Replace all sections for this floor
      await supabase.from('sections').delete().eq('floor_id', floorId);

      if (sections.length > 0) {
        const { error: secErr } = await supabase.from('sections').insert(
          sections.map((s) => ({
            id: s.id,
            name: s.name,
            node_id: s.node_id,
            floor_id: floorId,
          }))
        );
        if (secErr) throw secErr;
      }

      setDirty(false);
      setStatusMsg('Saved successfully');
    } catch (err: any) {
      console.error('Save failed:', err);
      setStatusMsg(`Save failed: ${err.message || 'Unknown error'}`);
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
      setStatusMsg('Floor plan uploaded');
    } catch (err: any) {
      console.error('Upload failed:', err);
      setStatusMsg(`Upload failed: ${err.message}`);
    }
  }

  // ── Canvas Event Handlers ───────────────────────────────────

  const handleCanvasClick = useCallback(
    (meterX: number, meterZ: number) => {
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

      const newNode: MapNode = {
        id: crypto.randomUUID(),
        x,
        z,
        floor_id: floor.id,
        type: nodeType,
        label: null,
      };

      setNodes([...updatedNodes, newNode]);
      setSelectedNodeId(newNode.id);
      setDirty(true);
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
          // Check if edge already exists
          const exists = edges.some(
            (e) =>
              (e.nodeA === connectFromId && e.nodeB === nodeId) ||
              (e.nodeA === nodeId && e.nodeB === connectFromId)
          );
          if (!exists) {
            setEdges((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                nodeA: connectFromId,
                nodeB: nodeId,
              },
            ]);
            setDirty(true);
          }
          setConnectFromId(null);
        }
      } else if (tool === 'delete') {
        // Delete node and connected edges/sections
        setNodes((prev) => prev.filter((n) => n.id !== nodeId));
        setEdges((prev) =>
          prev.filter((e) => e.nodeA !== nodeId && e.nodeB !== nodeId)
        );
        setSections((prev) => prev.filter((s) => s.node_id !== nodeId));
        if (selectedNodeId === nodeId) setSelectedNodeId(null);
        if (connectFromId === nodeId) setConnectFromId(null);
        setDirty(true);
      }
    },
    [tool, connectFromId, edges, selectedNodeId]
  );

  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      if (tool === 'delete') {
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
        setDirty(true);
      }
    },
    [tool]
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
    // Enforce single entrance
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
      // If changing from section, remove associated section
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
    // Remove existing section for this node if any
    const filtered = sections.filter((s) => s.node_id !== nodeId);
    filtered.push({
      id: crypto.randomUUID(),
      name,
      node_id: nodeId,
      floor_id: floor.id,
    });
    setSections(filtered);
    // Ensure node is marked as section type
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
      setStatusMsg('No path found between selected nodes');
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

  // ── Tool Change Handler ──────────────────────────────────────

  function handleToolChange(newTool: Tool) {
    setTool(newTool);
    setConnectFromId(null);
    if (newTool !== 'select') {
      setSelectedNodeId(null);
    }
  }

  // ── Logout ───────────────────────────────────────────────────

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
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
          <h1 className="text-sm font-semibold tracking-wide text-white/90">
            Map Builder
          </h1>
          <span className="text-xs text-white/30">
            {floor?.name || 'No floor'}
          </span>
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
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Logout
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
        />

        {/* Canvas */}
        <div className="flex-1 relative">
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
