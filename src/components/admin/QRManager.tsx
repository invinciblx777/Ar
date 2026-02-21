'use client';

import { useState, useCallback, useRef } from 'react';

interface QRNode {
    id: string;
    x: number;
    z: number;
    label: string | null;
    type: string;
}

interface QRManagerProps {
    storeId: string;
    versionId: string;
    floorId: string;
    nodes: QRNode[];
}

interface GeneratedQR {
    nodeId: string;
    qrDataUrl: string;
    payload: string;
    nodeLabel: string;
}

export default function QRManager({ storeId, versionId, floorId, nodes }: QRManagerProps) {
    const [generatedQRs, setGeneratedQRs] = useState<Map<string, GeneratedQR>>(new Map());
    const [generating, setGenerating] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    // Filter to only QR anchor nodes (or allow generating for any node)
    const qrEligibleNodes = nodes.filter(
        (n) => n.type === 'qr_anchor' || n.type === 'entrance'
    );
    const otherNodes = nodes.filter(
        (n) => n.type !== 'qr_anchor' && n.type !== 'entrance'
    );

    const generateQR = useCallback(async (node: QRNode) => {
        setGenerating(node.id);
        setError(null);

        try {
            const res = await fetch('/api/admin/qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    store_id: storeId,
                    floor_id: floorId,
                    node_id: node.id,
                    version_id: versionId,
                }),
            });

            const data = await res.json();
            if (data.error) {
                setError(data.error);
                return;
            }

            setGeneratedQRs((prev) => {
                const updated = new Map(prev);
                updated.set(node.id, {
                    nodeId: node.id,
                    qrDataUrl: data.qrDataUrl,
                    payload: data.payload,
                    nodeLabel: node.label || `Node (${node.x.toFixed(1)}, ${node.z.toFixed(1)})`,
                });
                return updated;
            });
        } catch (err) {
            setError(`Generation failed: ${String(err)}`);
        } finally {
            setGenerating(null);
        }
    }, [storeId, floorId, versionId]);

    const generateAll = useCallback(async () => {
        for (const node of qrEligibleNodes) {
            await generateQR(node);
        }
    }, [qrEligibleNodes, generateQR]);

    function downloadQR(qr: GeneratedQR) {
        const link = document.createElement('a');
        link.download = `qr-${qr.nodeLabel.replace(/\s+/g, '_')}-${qr.nodeId.slice(0, 8)}.png`;
        link.href = qr.qrDataUrl;
        link.click();
    }

    function printQR(qr: GeneratedQR) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>QR Code — ${qr.nodeLabel}</title>
            <style>
                body { font-family: sans-serif; text-align: center; padding: 40px; }
                img { width: 300px; height: 300px; }
                h2 { margin-top: 20px; font-size: 18px; }
                p { color: #666; font-size: 12px; }
            </style>
            </head>
            <body>
                <img src="${qr.qrDataUrl}" alt="QR Code" />
                <h2>${qr.nodeLabel}</h2>
                <p>Position: Scan here for indoor navigation</p>
                <p style="font-size:10px;color:#999;">${qr.nodeId}</p>
                <script>window.onload = () => window.print();</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    function printAll() {
        const qrs = Array.from(generatedQRs.values());
        if (qrs.length === 0) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const qrHtml = qrs.map((qr) => `
            <div style="page-break-inside: avoid; text-align: center; margin: 20px; display: inline-block; width: 280px;">
                <img src="${qr.qrDataUrl}" alt="QR" style="width:200px;height:200px;" />
                <h3 style="margin:8px 0 4px;font-size:14px;">${qr.nodeLabel}</h3>
                <p style="color:#999;font-size:10px;margin:0;">${qr.nodeId.slice(0, 8)}</p>
            </div>
        `).join('');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>All QR Codes</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; }
            </style>
            </head>
            <body>
                <h1 style="text-align:center;font-size:20px;margin-bottom:20px;">QR Anchor Codes</h1>
                <div class="grid">${qrHtml}</div>
                <script>window.onload = () => window.print();</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    return (
        <div className="space-y-4" ref={printRef}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-white/80">QR Anchor Codes</h3>
                    <p className="text-xs text-white/30 mt-0.5">
                        Generate QR codes for anchor and entrance nodes
                    </p>
                </div>
                <div className="flex gap-2">
                    {qrEligibleNodes.length > 0 && (
                        <button
                            onClick={generateAll}
                            disabled={generating !== null}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-40"
                        >
                            Generate All ({qrEligibleNodes.length})
                        </button>
                    )}
                    {generatedQRs.size > 0 && (
                        <button
                            onClick={printAll}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/70 border border-white/20 hover:bg-white/15 transition-colors"
                        >
                            Print All
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    {error}
                </div>
            )}

            {/* QR-eligible nodes (anchors + entrances) */}
            {qrEligibleNodes.length === 0 ? (
                <div className="p-6 text-center text-white/25 text-xs border border-white/5 rounded-lg">
                    <p>No QR anchor or entrance nodes found.</p>
                    <p className="mt-1">Mark nodes as &quot;QR Anchor&quot; or &quot;Entrance&quot; type in the Map Builder.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {qrEligibleNodes.map((node) => {
                        const qr = generatedQRs.get(node.id);
                        const isGenerating = generating === node.id;

                        return (
                            <div
                                key={node.id}
                                className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-white/70">
                                            {node.label || `(${node.x.toFixed(1)}, ${node.z.toFixed(1)})`}
                                        </p>
                                        <p className="text-[10px] text-white/30 capitalize mt-0.5">
                                            {node.type === 'qr_anchor' ? '📌 QR Anchor' : '🚪 Entrance'}
                                        </p>
                                    </div>
                                    <span className="text-[10px] text-white/20 font-mono">
                                        {node.id.slice(0, 8)}
                                    </span>
                                </div>

                                {qr ? (
                                    <>
                                        <div className="flex justify-center">
                                            <img
                                                src={qr.qrDataUrl}
                                                alt={`QR for ${qr.nodeLabel}`}
                                                className="w-32 h-32 rounded-lg bg-white p-1"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => downloadQR(qr)}
                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
                                            >
                                                Download PNG
                                            </button>
                                            <button
                                                onClick={() => printQR(qr)}
                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition-colors"
                                            >
                                                Print
                                            </button>
                                            <button
                                                onClick={() => generateQR(node)}
                                                className="py-1.5 px-2 rounded-lg text-[10px] font-medium bg-white/5 text-white/30 border border-white/10 hover:bg-white/10 transition-colors"
                                                title="Regenerate"
                                            >
                                                ↻
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => generateQR(node)}
                                        disabled={isGenerating}
                                        className="w-full py-2 rounded-lg text-xs font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-40"
                                    >
                                        {isGenerating ? 'Generating...' : 'Generate QR Code'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Other nodes that can also generate QR */}
            {otherNodes.length > 0 && (
                <details className="group">
                    <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors">
                        Other nodes ({otherNodes.length}) — click to expand
                    </summary>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                        {otherNodes.slice(0, 20).map((node) => {
                            const qr = generatedQRs.get(node.id);
                            return (
                                <div key={node.id} className="p-2 rounded-lg bg-white/3 border border-white/5 flex items-center justify-between">
                                    <span className="text-[10px] text-white/40 truncate">
                                        {node.label || `(${node.x.toFixed(1)}, ${node.z.toFixed(1)})`}
                                    </span>
                                    {qr ? (
                                        <button onClick={() => downloadQR(qr)} className="text-[10px] text-accent">
                                            ↓
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => generateQR(node)}
                                            disabled={generating === node.id}
                                            className="text-[10px] text-white/30 hover:text-accent"
                                        >
                                            QR
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </details>
            )}
        </div>
    );
}
