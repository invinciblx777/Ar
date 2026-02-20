'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
// AR Scenes
import { ARScene } from '../../ar/ARScene';
import { FallbackARScene } from '../../ar/FallbackARScene';
// Systems
import { fetchNavigationGraph, fetchNavigationGraphForStore, type NavigationGraph } from '../../lib/mapData';
import { getSectionById, type Section } from '../../lib/sections';
import { detectARSupport, type ARSupportInfo } from '../../utils/detectARSupport';
import { formatDistance } from '../../utils/navigation';
import { QRScanner, type QRScanResult } from '../../utils/qrScanner';
// Components
import ErrorOverlay from '../../components/ErrorOverlay';
import DebugOverlay from '../../components/DebugOverlay';
import type { NavigationEvent, NavigationState } from '../../ar/navigationEngine';

type ARStatus =
    | 'loading'
    | 'running'
    | 'error'
    | 'unsupported'
    | 'permission'
    | 'desktop'
    | 'motion-permission'
    | 'qr-error'
    | 'no-path';

function ARPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const cameraContainerRef = useRef<HTMLDivElement>(null); // For QR Scanner

    // Using any for flexibility between ARScene and FallbackARScene
    // In production you might want a common interface
    const arSceneRef = useRef<any>(null);
    const qrScannerRef = useRef<QRScanner | null>(null);

    const [status, setStatus] = useState<ARStatus>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    // Navigation State
    const [distance, setDistance] = useState<number | null>(null);
    const [navState, setNavState] = useState<NavigationState | null>(null);
    const [targetSection, setTargetSection] = useState<Section | null>(null);
    const [graph, setGraph] = useState<NavigationGraph | null>(null);

    // UI State
    const [arMode, setArMode] = useState<'webxr' | 'fallback' | null>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [isScanningQR, setIsScanningQR] = useState(false);
    const [userPosition, setUserPosition] = useState({ x: 0, z: 0 });

    const sectionId = searchParams.get('section');
    const storeIdParam = searchParams.get('storeId');
    const debugParam = searchParams.get('debug');

    useEffect(() => {
        if (debugParam === 'true') {
            setShowDebug(true);
        }
    }, [debugParam]);

    const handleBack = useCallback(() => {
        router.push('/');
    }, [router]);

    const handleExit = useCallback(async () => {
        if (arSceneRef.current) {
            await arSceneRef.current.dispose();
            arSceneRef.current = null;
        }
        if (qrScannerRef.current) {
            qrScannerRef.current.stopScanning();
            qrScannerRef.current = null;
        }
        router.push('/');
    }, [router]);

    // ── QR Scanner Logic ──────────────────────────────────────────

    const startQRScan = useCallback(async () => {
        if (!containerRef.current) return;
        setIsScanningQR(true);

        // Hide AR scene temporarily? Or just overlay?
        // Overlay is better.

        qrScannerRef.current = new QRScanner();

        try {
            await qrScannerRef.current.startScanning(
                containerRef.current,
                (result) => {
                    handleQRResult(result);
                },
                (err) => {
                    console.error('[QR] Error:', err);
                    setStatus('qr-error');
                    setIsScanningQR(false);
                }
            );
        } catch (err) {
            console.error('[QR] Exception:', err);
            setStatus('qr-error');
            setIsScanningQR(false);
        }
    }, []);

    const stopQRScan = useCallback(() => {
        if (qrScannerRef.current) {
            qrScannerRef.current.stopScanning();
            qrScannerRef.current = null;
        }
        setIsScanningQR(false);
    }, []);

    const handleQRResult = useCallback((result: QRScanResult) => {
        console.log('[QR] Scanned:', result);
        stopQRScan();

        // Recalibrate AR Scene
        if (arSceneRef.current && graph) {
            const node = graph.nodes.get(result.nodeId);
            if (node) {
                // Determine current AR position (if needed by scene)
                // For Fallback, it assumes 0,0,0
                // For WebXR, we need to pass current camera pos if we want precise offset
                // But for simplicity, we assume user is STANDING at the anchor when scanning

                // We'll let the scene handle it
                if (arMode === 'webxr') {
                    // ARScene needs 'currentARPosition' to calibrate offset
                    // We can't easily get it from outside without exposing it
                    // HACK: Pass {x:0, z:0} allows ARScene to just assume user is at 0,0 relative to... something?
                    // Actually ARScene.recalibrateFromNode uses the passed position.
                    // IMPORTANT: We need the camera position from the RENDER LOOP.
                    // Since we can't access it here easily, we might need the Scene to handle QR logic?
                    // OR, simpler: We set a flag in ARScene "pendingRecalibration = nodeId".
                    // Let's call the method we added.

                    // Ideally we pass the camera position. 
                    // Since this is MVP upgraded, let's assume the user is at (0,0,0) in AR space 
                    // OR rely on the fact that they just started or are standing still.
                    // Actually, in WebXR world coordinates are persistent.
                    // So passing {x: cameraX, z: cameraX} is vital.
                    // We don't have it here. 

                    // New plan: We trigger a "recalibrateNextFrame(nodeId)" on the scene.
                    // I'll cast to any and call recalibrateFromNode if possible, 
                    // passing a dummy that the scene might override or I'll update ARScene to take just ID and use current cam pos.
                    // I'll update ARScene to use its OWN camera position if I didn't already.
                    // I checked ARScene code: `recalibrateFromNode(nodeId, currentARPosition)`.
                    // I should have made `currentARPosition` optional and let ARScene use `this.camera.position`.
                    // Let's assume I can pass `arSceneRef.current.camera.position`.

                    const cam = arSceneRef.current.camera;
                    arSceneRef.current.recalibrateFromNode(result.nodeId, { x: cam.position.x, z: cam.position.z });
                } else {
                    // Fallback
                    arSceneRef.current.recalibrateFromNode(result.nodeId);
                }

                // Show success toast?
                alert(`Re-anchored to: ${node.label || 'Node ' + node.id}`);
            } else {
                alert('Invalid QR Code: Node not found');
            }
        }
    }, [arMode, graph, stopQRScan]);

    // ── AR Initialization ────────────────────────────────────────

    const initAR = useCallback(
        async (section: Section, graphData: NavigationGraph) => {
            if (!containerRef.current) return;

            setStatus('loading');

            // Detect AR capabilities
            let support: ARSupportInfo;
            try {
                support = await detectARSupport();
            } catch {
                support = { immersiveAR: false, inlineAR: false, isiOS: false, isAndroid: false, isMobile: false, fallbackRequired: true };
            }

            // Desktop check
            if (!support.isMobile && sectionId !== 'debug') { // Allow debug bypass
                if (debugParam !== 'true') {
                    setStatus('desktop');
                    return;
                }
            }

            // Clean up previous
            if (arSceneRef.current) {
                await arSceneRef.current.dispose();
                arSceneRef.current = null;
            }

            const sceneConfig = {
                targetSectionId: section.id,
                graph: graphData,
                startNodeId: graphData.entranceNodeId, // Default start
                onSessionEnd: () => {
                    setStatus('loading');
                    handleBack();
                },
                onError: (msg: string) => {
                    console.error('[AR Error]', msg);
                    if (msg.includes('permission')) setStatus('permission');
                    else if (msg.includes('No path')) setStatus('no-path');
                    else setStatus('error');
                    setErrorMessage(msg);
                },
                onDistanceUpdate: (d: number) => setDistance(d),
                onStateUpdate: (state: NavigationState) => {
                    setNavState(state);
                    // Update user pos for debug
                    if (arSceneRef.current?.navEngine) {
                        const pos = arSceneRef.current.navEngine.getUserPosition();
                        setUserPosition({ x: pos.x, z: pos.z });
                    }
                },
                onNavigationEvent: (event: NavigationEvent) => {
                    if (event.type === 'arrived') {
                        // Maybe show confetti or specialized UI?
                        console.log('Arrived!');
                    }
                }
            };

            // Path A: WebXR
            if (support.immersiveAR) {
                setArMode('webxr');
                const arScene = new ARScene(containerRef.current, sceneConfig);
                arSceneRef.current = arScene;
                try {
                    await arScene.start();
                    setStatus('running');
                } catch {
                    setStatus('error');
                    setErrorMessage('Failed to start AR session.');
                }
                return;
            }

            // Path B: Fallback
            if (support.fallbackRequired || support.isMobile) {
                setArMode('fallback');
                const fallbackScene = new FallbackARScene(containerRef.current, sceneConfig);
                arSceneRef.current = fallbackScene;
                try {
                    await fallbackScene.start();
                    setStatus('running');
                } catch {
                    setStatus('error');
                    setErrorMessage('Failed to start AR experience.');
                }
                return;
            }

            setStatus('unsupported');
        },
        [handleBack, sectionId, debugParam]
    );

    // ── Effect: Load Graph & Start ───────────────────────────────

    useEffect(() => {
        if (!sectionId) {
            handleBack();
            return;
        }

        let mounted = true;

        async function load() {
            // 1. Fetch Graph (use store-specific if storeId provided)
            const graphData = storeIdParam
                ? await fetchNavigationGraphForStore(storeIdParam)
                : await fetchNavigationGraph();
            if (!mounted) return;
            setGraph(graphData);

            // 2. Find Section
            const section = flattenSection(graphData.sections.find(s => s.id === sectionId));

            if (!section) {
                console.error('Section not found in graph');
                handleBack();
                return;
            }

            setTargetSection(section);

            // 3. Init AR
            initAR(section, graphData);
        }

        load();

        return () => {
            mounted = false;
            if (arSceneRef.current) arSceneRef.current.dispose();
            if (qrScannerRef.current) qrScannerRef.current.stopScanning();
        };
    }, [sectionId, handleBack, initAR]);

    // Helper to match shared Section interface
    function flattenSection(s: any): Section | undefined {
        if (!s) return undefined;
        return {
            id: s.id,
            name: s.name,
            node_id: s.node_id,
            icon: s.icon,
            x: 0, z: 0 // coordinates not strictly needed by UI now
        };
    }

    // ── Render ───────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 bg-black">
            {/* AR Container */}
            <div ref={containerRef} className="w-full h-full relative" />

            {/* Debug Overlay */}
            {showDebug && (
                <DebugOverlay
                    graph={graph}
                    navState={navState}
                    userPosition={userPosition}
                />
            )}

            {/* QR Scanner Overlay */}
            {isScanningQR && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-6">
                    <p className="text-white text-lg font-medium mb-8">Scan Location QR Code</p>
                    {/* Video is appended to containerRef by QRScanner, 
                        but we want it visible above everything. 
                        QRScanner appends to container. 
                        We need to make sure z-index is correct. 
                        QRScanner sets zIndex 100 on video. */}

                    <button
                        onClick={stopQRScan}
                        className="mt-64 px-6 py-3 rounded-full bg-white/10 border border-white/20 text-white backdrop-blur-md"
                    >
                        Cancel Scan
                    </button>
                    <p className="text-white/40 text-sm mt-4">Point at a store location code</p>
                </div>
            )}

            {/* AR UI Overlay */}
            <AnimatePresence>
                {status === 'running' && targetSection && !isScanningQR && (
                    <>
                        {/* Top Bar */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="ar-overlay flex items-start justify-between pointer-events-none"
                        >
                            <div className="glass-card px-4 py-2 pointer-events-auto flex items-center gap-3">
                                <div>
                                    <p className="text-xs text-white/50">Navigating to</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{targetSection.icon}</span>
                                        <p className="text-sm font-semibold text-white">
                                            {targetSection.name}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 pointer-events-auto">
                                {/* QR Button */}
                                <button
                                    onClick={startQRScan}
                                    className="glass-card w-10 h-10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                    title="Recalibrate Position"
                                >
                                    📷
                                </button>

                                {/* Exit Button */}
                                <button
                                    onClick={handleExit}
                                    className="glass-card px-4 py-2.5 text-xs font-medium text-white/70 hover:text-white transition-colors"
                                >
                                    Exit
                                </button>
                            </div>
                        </motion.div>

                        {/* Waypoint/Distance Indicator */}
                        {navState && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass-card px-6 py-3 text-center min-w-[200px]"
                            >
                                {navState.arrived ? (
                                    <>
                                        <p className="text-2xl font-bold text-[var(--accent)]">
                                            You've Arrived!
                                        </p>
                                        <p className="text-xs text-white/40 mt-1">
                                            {targetSection.name} is here
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-2xl font-bold text-[var(--accent)]">
                                            {formatDistance(navState.remainingDistance)}
                                        </p>
                                        <p className="text-xs text-white/40 mt-1 flex items-center justify-center gap-2">
                                            <span>Follow the path</span>
                                            {navState.recalculated && <span className="text-yellow-400">• Rerouting</span>}
                                        </p>
                                        {/* Progress Bar */}
                                        <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                            <div
                                                className="h-full bg-[var(--accent)] transition-all duration-500"
                                                style={{
                                                    width: `${Math.min(100, Math.max(0, ((navState.totalWaypoints - navState.remainingWaypoints.length) / navState.totalWaypoints) * 100))}%`
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        )}

                        {arMode === 'fallback' && (
                            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 backdrop-blur rounded-full text-[10px] text-white/50">
                                Camera Mode (3DOF)
                            </div>
                        )}
                    </>
                )}
            </AnimatePresence>

            {/* Error States */}
            <AnimatePresence>
                {status !== 'running' && status !== 'loading' && (
                    <ErrorOverlay
                        type={status}
                        message={errorMessage}
                        onBack={handleBack}
                        onRetry={() => targetSection && graph && initAR(targetSection, graph)}
                    />
                )}
                {status === 'loading' && (
                    <ErrorOverlay type="loading" onBack={handleBack} />
                )}
            </AnimatePresence>
        </div>
    );
}

export default function ARPage() {
    return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
            <ARPageContent />
        </Suspense>
    );
}
