'use client';

import { useEffect, useRef } from 'react';
import type { NavigationGraph } from '../lib/mapData';
import type { NavigationState } from '../ar/navigationEngine';

interface DebugOverlayProps {
    graph: NavigationGraph | null;
    navState: NavigationState | null;
    userPosition: { x: number; z: number };
}

export default function DebugOverlay({ graph, navState, userPosition }: DebugOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !graph) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale and offset
        const scale = 15;
        const offsetX = 150; // Center X
        const offsetZ = 50;  // Offset Z (scrolled down a bit)

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw edges
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const edge of graph.edges) {
            const n1 = graph.nodes.get(edge.from_node);
            const n2 = graph.nodes.get(edge.to_node);
            if (n1 && n2) {
                ctx.moveTo(n1.x * scale + offsetX, n1.z * scale + offsetZ);
                ctx.lineTo(n2.x * scale + offsetX, n2.z * scale + offsetZ);
            }
        }
        ctx.stroke();

        // Draw nodes
        for (const node of graph.nodes.values()) {
            const x = node.x * scale + offsetX;
            const z = node.z * scale + offsetZ;
            ctx.fillStyle = node.walkable ? 'rgba(255,255,255,0.3)' : 'red';
            ctx.beginPath();
            ctx.arc(x, z, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Path
        if (navState && navState.remainingWaypoints.length > 0) {
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2;
            ctx.beginPath();

            // Connect user to first waypoint
            const ux = userPosition.x * scale + offsetX;
            const uz = userPosition.z * scale + offsetZ;
            ctx.moveTo(ux, uz);

            for (const wp of navState.remainingWaypoints) {
                ctx.lineTo(wp.x * scale + offsetX, wp.z * scale + offsetZ);
            }
            ctx.stroke();
        }

        // Draw User
        const ux = userPosition.x * scale + offsetX;
        const uz = userPosition.z * scale + offsetZ;
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(ux, uz, 4, 0, Math.PI * 2);
        ctx.fill();

    }, [graph, navState, userPosition]);

    return (
        <div className="fixed top-20 right-4 p-2 bg-black/80 rounded border border-white/20 pointer-events-none z-[100] w-[150px]">
            <h3 className="text-[9px] text-white/50 mb-1">DEBUG MAP</h3>
            <canvas ref={canvasRef} width={150} height={200} className="w-full h-[150px] bg-black/50" />
            <div className="mt-1 text-[9px] text-white/80 font-mono leading-tight">
                POS: {userPosition.x.toFixed(1)}, {userPosition.z.toFixed(1)}<br />
                NEXT: {navState?.nextWaypointIndex ?? '-'} / {navState?.totalWaypoints ?? '-'}<br />
                DIST: {navState?.remainingDistance.toFixed(1) ?? '-'}m
            </div>
        </div>
    );
}
