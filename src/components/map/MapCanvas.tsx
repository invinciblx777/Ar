'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Circle, Line, Group, Text, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { MapNode, MapEdge, Tool } from './MapBuilder';
import type { NavigationNode } from '@/lib/mapData';

// ── Constants ────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  normal: '#00f0ff',
  entrance: '#00ff88',
  section: '#ff8800',
};

const NODE_RADIUS = 8;

// ── Props ────────────────────────────────────────────────────

interface MapCanvasProps {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedNodeId: string | null;
  connectFromId: string | null;
  showGrid: boolean;
  pixelsPerMeter: number;
  tool: Tool;
  floorPlanUrl: string | null;
  simulatedPath: NavigationNode[] | null;
  onCanvasClick: (meterX: number, meterZ: number) => void;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onNodeDrag: (nodeId: string, newX: number, newZ: number) => void;
  onDeselect: () => void;
}

// ── Component ────────────────────────────────────────────────

export default function MapCanvas({
  nodes,
  edges,
  selectedNodeId,
  connectFromId,
  showGrid,
  pixelsPerMeter: ppm,
  tool,
  floorPlanUrl,
  simulatedPath,
  onCanvasClick,
  onNodeClick,
  onEdgeClick,
  onNodeDrag,
  onDeselect,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [stagePos, setStagePos] = useState<{ x: number; y: number } | null>(null);
  const [stageScale, setStageScale] = useState(1);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Set initial stage position once we have dimensions
  useEffect(() => {
    if (!stagePos) {
      setStagePos({ x: dimensions.width / 2, y: 60 });
    }
  }, [dimensions, stagePos]);

  // Floor plan image loading
  useEffect(() => {
    if (!floorPlanUrl) {
      setBgImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = floorPlanUrl;
  }, [floorPlanUrl]);

  // ── Event Handlers ──────────────────────────────────────────

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Only handle background clicks
      const clickedOnEmpty = e.target === e.target.getStage();
      if (!clickedOnEmpty) return;

      if (tool === 'addNode') {
        const stage = stageRef.current;
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const scale = stage.scaleX();
        const sp = stage.position();
        const layerX = (pos.x - sp.x) / scale;
        const layerY = (pos.y - sp.y) / scale;
        const meterX = layerX / ppm;
        const meterZ = layerY / ppm;
        onCanvasClick(meterX, meterZ);
      } else if (tool === 'select') {
        onDeselect();
      } else if (tool === 'connect') {
        onDeselect();
      }
    },
    [tool, ppm, onCanvasClick, onDeselect]
  );

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const newScale =
      e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clampedScale = Math.max(0.15, Math.min(5, newScale));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale(clampedScale);
    setStagePos(newPos);
  }, []);

  const handleDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    if (e.target === e.target.getStage()) {
      setStagePos({ x: e.target.x(), y: e.target.y() });
    }
  }, []);

  // ── Grid Generation ──────────────────────────────────────────

  function generateGridLines() {
    if (!showGrid) return [];

    const lines: { key: string; points: number[]; opacity: number }[] = [];
    const range = 30; // meters in each direction from origin
    const step = 1; // 1 meter grid

    for (let i = -range; i <= range; i += step) {
      const isMajor = i % 5 === 0;
      // Vertical lines (along z-axis)
      lines.push({
        key: `gv-${i}`,
        points: [i * ppm, -range * ppm, i * ppm, range * ppm],
        opacity: isMajor ? 0.15 : 0.06,
      });
      // Horizontal lines (along x-axis)
      lines.push({
        key: `gh-${i}`,
        points: [-range * ppm, i * ppm, range * ppm, i * ppm],
        opacity: isMajor ? 0.15 : 0.06,
      });
    }
    return lines;
  }

  // ── Cursor style ─────────────────────────────────────────────

  function getCursor(): string {
    switch (tool) {
      case 'addNode':
        return 'crosshair';
      case 'connect':
        return 'pointer';
      case 'delete':
        return 'not-allowed';
      default:
        return 'grab';
    }
  }

  // ── Render ───────────────────────────────────────────────────

  const gridLines = generateGridLines();
  const currentStagePos = stagePos || { x: dimensions.width / 2, y: 60 };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#08080f]"
      style={{ cursor: getCursor() }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        x={currentStagePos.x}
        y={currentStagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable={tool === 'select'}
        onClick={handleStageClick}
        onTap={handleStageClick as any}
        onWheel={handleWheel}
        onDragEnd={handleDragEnd}
      >
        <Layer>
          {/* Floor plan background */}
          {bgImage && (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={bgImage.width}
              height={bgImage.height}
              opacity={0.35}
              listening={false}
            />
          )}

          {/* Grid */}
          {gridLines.map((line) => (
            <Line
              key={line.key}
              points={line.points}
              stroke="#ffffff"
              strokeWidth={0.5}
              opacity={line.opacity}
              listening={false}
            />
          ))}

          {/* Origin crosshair */}
          <Line
            points={[-10, 0, 10, 0]}
            stroke="#ff3333"
            strokeWidth={1}
            opacity={0.4}
            listening={false}
          />
          <Line
            points={[0, -10, 0, 10]}
            stroke="#ff3333"
            strokeWidth={1}
            opacity={0.4}
            listening={false}
          />

          {/* Edges */}
          {edges.map((edge) => {
            const a = nodes.find((n) => n.id === edge.nodeA);
            const b = nodes.find((n) => n.id === edge.nodeB);
            if (!a || !b) return null;
            return (
              <Line
                key={edge.id}
                points={[a.x * ppm, a.z * ppm, b.x * ppm, b.z * ppm]}
                stroke="#00f0ff"
                strokeWidth={2}
                hitStrokeWidth={14}
                opacity={0.5}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onEdgeClick(edge.id);
                }}
                onTap={((e: any) => {
                  e.cancelBubble = true;
                  onEdgeClick(edge.id);
                }) as any}
              />
            );
          })}

          {/* Simulated path highlight */}
          {simulatedPath && simulatedPath.length > 1 && (
            <Line
              points={simulatedPath.flatMap((wp) => [wp.x * ppm, wp.z * ppm])}
              stroke="#facc15"
              strokeWidth={4}
              opacity={0.9}
              dash={[12, 6]}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}

          {/* Nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isConnectSource = connectFromId === node.id;
            const px = node.x * ppm;
            const pz = node.z * ppm;

            return (
              <Group key={node.id}>
                {/* Selection ring */}
                {isSelected && (
                  <Circle
                    x={px}
                    y={pz}
                    radius={NODE_RADIUS + 5}
                    stroke="#ffffff"
                    strokeWidth={2}
                    opacity={0.7}
                    listening={false}
                  />
                )}

                {/* Connect source indicator */}
                {isConnectSource && (
                  <Circle
                    x={px}
                    y={pz}
                    radius={NODE_RADIUS + 6}
                    stroke="#facc15"
                    strokeWidth={2}
                    dash={[4, 4]}
                    listening={false}
                  />
                )}

                {/* Node circle */}
                <Circle
                  x={px}
                  y={pz}
                  radius={NODE_RADIUS}
                  fill={NODE_COLORS[node.type] || NODE_COLORS.normal}
                  stroke={isSelected ? '#ffffff' : 'transparent'}
                  strokeWidth={1.5}
                  shadowColor={NODE_COLORS[node.type] || NODE_COLORS.normal}
                  shadowBlur={isSelected ? 12 : 6}
                  shadowOpacity={0.5}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onNodeClick(node.id);
                  }}
                  onTap={((e: any) => {
                    e.cancelBubble = true;
                    onNodeClick(node.id);
                  }) as any}
                  draggable={tool === 'select'}
                  onDragEnd={(e) => {
                    const target = e.target;
                    onNodeDrag(node.id, target.x() / ppm, target.y() / ppm);
                  }}
                />

                {/* Entrance icon */}
                {node.type === 'entrance' && (
                  <Text
                    x={px - 4}
                    y={pz - 4}
                    text="E"
                    fontSize={9}
                    fontStyle="bold"
                    fill="#000"
                    listening={false}
                  />
                )}

                {/* Label */}
                <Text
                  x={px + NODE_RADIUS + 5}
                  y={pz - 5}
                  text={node.label || ''}
                  fontSize={11}
                  fill="#888888"
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>

      {/* Coordinate display */}
      <div className="absolute bottom-2 left-2 text-[10px] text-white/30 font-mono pointer-events-none select-none">
        Zoom: {(stageScale * 100).toFixed(0)}% | PPM: {ppm} | Nodes:{' '}
        {nodes.length} | Edges: {edges.length}
      </div>
    </div>
  );
}
