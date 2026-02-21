'use client';

import { useEffect, useRef, useState } from 'react';
import type { NavigationGraph } from '../lib/mapData';
import type { NavigationState } from '../ar/navigationEngine';

interface DebugOverlayProps {
    graph: NavigationGraph | null;
    navState: NavigationState | null;
    userPosition: { x: number; z: number };
}

export default function DebugOverlay({ graph, navState, userPosition }: DebugOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [showNodeIds, setShowNodeIds] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    // Capture structured console logs
    useEffect(() => {
        const addLog = (msg: string) => {
            setLogs((prev) => [...prev.slice(-20), `${new Date().toLocaleTimeString()} ${msg}`]);
        };

        if (navState?.recalculated) {
            addLog('[NAV] Route recalculated');
        }
        if (navState?.arrived) {
            addLog('[NAV] Destination reached!');
        }
    }, [navState?.recalculated, navState?.arrived]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !graph || collapsed) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Auto-fit: find bounds of all nodes
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const node of graph.nodes.values()) {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x);
            minZ = Math.min(minZ, node.z);
            maxZ = Math.max(maxZ, node.z);
        }

        const rangeX = maxX - minX || 1;
        const rangeZ = maxZ - minZ || 1;
        const padding = 15;
        const canvasW = canvas.width;
        const canvasH = canvas.height - 20; // Reserve space for labels
        const scale = Math.min(
            (canvasW - padding * 2) / rangeX,
            (canvasH - padding * 2) / rangeZ
        );
        const offsetX = padding - minX * scale + (canvasW - rangeX * scale) / 2 - padding;
        const offsetZ = padding - minZ * scale;

        function toCanvasX(x: number) { return x * scale + offsetX; }
        function toCanvasZ(z: number) { return z * scale + offsetZ; }

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Border
        ctx.strokeStyle = 'rgba(0,240,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        // Draw edges
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const edge of graph.edges) {
            const n1 = graph.nodes.get(edge.from_node);
            const n2 = graph.nodes.get(edge.to_node);
            if (n1 && n2) {
                ctx.moveTo(toCanvasX(n1.x), toCanvasZ(n1.z));
                ctx.lineTo(toCanvasX(n2.x), toCanvasZ(n2.z));
            }
        }
        ctx.stroke();

        // Draw nodes
        for (const node of graph.nodes.values()) {
            const x = toCanvasX(node.x);
            const z = toCanvasZ(node.z);

            // Color by type
            let color = 'rgba(255,255,255,0.25)';
            if (node.type === 'entrance') color = 'rgba(0,255,136,0.6)';
            else if (node.type === 'section') color = 'rgba(255,136,0,0.6)';
            else if (node.type === 'qr_anchor') color = 'rgba(255,0,255,0.6)';
            else if (!node.walkable) color = 'rgba(255,0,0,0.5)';

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, z, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Node IDs
            if (showNodeIds && node.label) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '6px monospace';
                ctx.fillText(node.label.slice(0, 8), x + 4, z + 2);
            }
        }

        // Draw remaining path
        if (navState && navState.remainingWaypoints.length > 0) {
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();

            const ux = toCanvasX(userPosition.x);
            const uz = toCanvasZ(userPosition.z);
            ctx.moveTo(ux, uz);

            for (const wp of navState.remainingWaypoints) {
                ctx.lineTo(toCanvasX(wp.x), toCanvasZ(wp.z));
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Highlight next waypoint
            if (navState.remainingWaypoints.length > 0) {
                const next = navState.remainingWaypoints[0];
                const nx = toCanvasX(next.x);
                const nz = toCanvasZ(next.z);
                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(nx, nz, 5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // Draw user position
        const ux = toCanvasX(userPosition.x);
        const uz = toCanvasZ(userPosition.z);
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(ux, uz, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ux, uz, 7, 0, Math.PI * 2);
        ctx.stroke();

    }, [graph, navState, userPosition, showNodeIds, collapsed]);

    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                className="fixed top-20 right-2 z-[100] px-2 py-1 bg-black/70 rounded text-[9px] text-white/50 border border-white/10"
            >
                DBG
            </button>
        );
    }

    return (
        <div className="fixed top-20 right-2 z-[100] w-[200px] pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1 bg-black/80 border border-white/15 rounded-t border-b-0">
                <h3 className="text-[9px] text-accent font-bold tracking-wider">DEBUG MODE</h3>
                <div className="flex gap-1">
                    <button
                        onClick={() => setShowNodeIds(!showNodeIds)}
                        className={`text-[8px] px-1.5 py-0.5 rounded ${showNodeIds ? 'bg-accent/20 text-accent' : 'text-white/30'}`}
                        title="Toggle node IDs"
                    >
                        ID
                    </button>
                    <button
                        onClick={() => setCollapsed(true)}
                        className="text-[9px] text-white/30 hover:text-white/60 px-1"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Mini Map */}
            <canvas
                ref={canvasRef}
                width={200}
                height={160}
                className="w-full bg-black/70 border-x border-white/15"
            />

            {/* Stats */}
            <div className="px-2 py-1.5 bg-black/80 border border-white/15 rounded-b border-t-0 text-[9px] text-white/70 font-mono leading-relaxed space-y-0.5">
                <div className="flex justify-between">
                    <span className="text-white/40">POS</span>
                    <span>{userPosition.x.toFixed(1)}, {userPosition.z.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-white/40">WP</span>
                    <span>{navState?.nextWaypointIndex ?? '-'} / {navState?.totalWaypoints ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-white/40">DIST</span>
                    <span className="text-accent">{navState?.remainingDistance?.toFixed(1) ?? '-'}m</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-white/40">NEXT</span>
                    <span>{navState?.distanceToNext?.toFixed(1) ?? '-'}m</span>
                </div>
                {navState?.closestNode && (
                    <div className="flex justify-between">
                        <span className="text-white/40">NODE</span>
                        <span className="truncate max-w-[100px]">{navState.closestNode.label || navState.closestNode.id.slice(0, 8)}</span>
                    </div>
                )}
                {navState?.recalculated && (
                    <div className="text-yellow-400">REROUTING</div>
                )}
                {navState?.arrived && (
                    <div className="text-green-400">ARRIVED</div>
                )}
            </div>

            {/* Console logs */}
            {logs.length > 0 && (
                <div className="mt-1 max-h-20 overflow-y-auto bg-black/60 border border-white/10 rounded p-1">
                    {logs.slice(-5).map((log, i) => (
                        <div key={i} className="text-[7px] text-white/30 font-mono leading-tight">
                            {log}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
