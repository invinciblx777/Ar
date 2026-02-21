'use client';

import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDialogProps {
    nodeId: string;
    storeId?: string;
    versionId?: string;
    floorId?: string;
    onClose: () => void;
}

export default function QRCodeDialog({
    nodeId,
    storeId,
    versionId,
    floorId,
    onClose
}: QRCodeDialogProps) {
    const qrRef = useRef<HTMLDivElement>(null);

    // Payload format per PRD v2 requirements + existing qrScanner logic
    const payloadData = {
        store_id: storeId || 'unknown',
        version_id: versionId || 'unknown',
        floor_id: floorId || 'unknown',
        node_id: nodeId
    };

    const payloadString = JSON.stringify(payloadData);

    function handleDownload() {
        if (!qrRef.current) return;
        const svg = qrRef.current.querySelector('svg');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        // Add white background to SVG for better contrast
        const svgBlob = new Blob([`<svg style="background:white" ${svgData.slice(4)}`], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            if (ctx) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                const pngUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `navgrid-qr-${nodeId}.png`;
                link.href = pngUrl;
                link.click();
            }
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    function handlePrint() {
        const printWindow = window.open('', '', 'width=600,height=600');
        if (!printWindow) return;

        if (!qrRef.current) return;
        const svg = qrRef.current.querySelector('svg');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);

        printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Anchor</title>
          <style>
            body { 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0; 
              font-family: sans-serif;
            }
            .qr-container {
              border: 1px dashed #ccc;
              padding: 2rem;
              text-align: center;
              background: white;
            }
            .title { margin-top: 1rem; font-weight: bold; font-size: 1.2rem; }
            .subtitle { font-size: 0.9rem; color: #555; font-family: monospace; margin-top: 0.5rem; }
            @media print {
              @page { margin: 0; }
              body { margin: 1cm; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="qr-container">
            ${svgData}
            <div class="title">NavGrid AR Anchor</div>
            <div class="subtitle">Node: ${nodeId}</div>
          </div>
        </body>
      </html>
    `);
        printWindow.document.close();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0d0d18]">
                    <h2 className="text-[14px] font-semibold text-white/90">QR Anchor Node</h2>
                    <button
                        onClick={onClose}
                        className="text-white/40 hover:text-white transition-colors p-1"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col items-center">
                    <div
                        className="bg-white p-4 rounded-xl shadow-inner mb-6"
                        ref={qrRef}
                    >
                        <QRCodeSVG
                            value={payloadString}
                            size={200}
                            level="H"
                            includeMargin={true}
                        />
                    </div>

                    <div className="w-full bg-black/20 rounded-lg p-3 border border-white/5 mb-6">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Payload Data</p>
                        <p className="text-[11px] font-mono text-white/60 break-all leading-relaxed">
                            {payloadString}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="w-full flex gap-3">
                        <button
                            onClick={handleDownload}
                            className="flex-1 py-2.5 rounded-lg bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 hover:text-white transition-colors border border-white/10 flex items-center justify-center gap-2"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download PNG
                        </button>
                        <button
                            onClick={handlePrint}
                            className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-[#0d0d18] text-xs font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                <rect x="6" y="14" width="12" height="8"></rect>
                            </svg>
                            Print QR
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
