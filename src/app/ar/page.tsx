'use client';

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
// AR Scenes
import { ARScene } from '../../ar/ARScene';
import { FallbackARScene } from '../../ar/FallbackARScene';
// Systems
import { fetchNavigationGraph, fetchNavigationGraphForStore, type NavigationGraph, type StoreSection } from '../../lib/mapData';
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

interface SectionForUI {
    id: string;
    name: string;
    node_id: string;
    icon: string | null;
    description?: string;
    category?: string;
}

function ARPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arSceneRef = useRef<any>(null);
    const qrScannerRef = useRef<QRScanner | null>(null);

    const [status, setStatus] = useState<ARStatus>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    // Navigation State
    const [navState, setNavState] = useState<NavigationState | null>(null);
    const [targetSection, setTargetSection] = useState<SectionForUI | null>(null);
    const [graph, setGraph] = useState<NavigationGraph | null>(null);

    // UI State
    const [arMode, setArMode] = useState<'webxr' | 'fallback' | null>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [isScanningQR, setIsScanningQR] = useState(false);
    const [userPosition, setUserPosition] = useState({ x: 0, z: 0 });

    // Destination search panel (shown when no section selected yet)
    const [showDestinationPanel, setShowDestinationPanel] = useState(false);
    const [destinationSearch, setDestinationSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const sectionId = searchParams.get('section');
    const storeIdParam = searchParams.get('storeId');
    const debugParam = searchParams.get('debug');
    const startAtEntrance = searchParams.get('startAtEntrance');

    useEffect(() => {
        if (debugParam === 'true') {
            setShowDebug(true);
        }
    }, [debugParam]);

    const handleBack = useCallback(() => {
        if (storeIdParam) {
            router.push(`/navigate?storeId=${storeIdParam}`);
        } else {
            router.push('/');
        }
    }, [router, storeIdParam]);

    const handleExit = useCallback(async () => {
        if (arSceneRef.current) {
            await arSceneRef.current.dispose();
            arSceneRef.current = null;
        }
        if (qrScannerRef.current) {
            qrScannerRef.current.stopScanning();
            qrScannerRef.current = null;
        }
        handleBack();
    }, [handleBack]);

    // ── Destination filtering ────────────────────────────────────

    const graphSections = useMemo(() => {
        if (!graph) return [];
        return graph.sections;
    }, [graph]);

    const categories = useMemo(() => {
        const cats = new Set(graphSections.map((s) => s.category || 'general'));
        return Array.from(cats).sort();
    }, [graphSections]);

    const filteredSections = useMemo(() => {
        let filtered = graphSections;
        if (selectedCategory) {
            filtered = filtered.filter((s) => (s.category || 'general') === selectedCategory);
        }
        if (destinationSearch.trim()) {
            const q = destinationSearch.toLowerCase();
            filtered = filtered.filter(
                (s) =>
                    s.name.toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q)
            );
        }
        return filtered;
    }, [graphSections, destinationSearch, selectedCategory]);

    // ── QR Scanner Logic ──────────────────────────────────────────

    const startQRScan = useCallback(async () => {
        if (!containerRef.current) return;
        setIsScanningQR(true);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                if (arMode === 'webxr') {
                    const cam = arSceneRef.current.camera;
                    arSceneRef.current.recalibrateFromNode(result.nodeId, { x: cam.position.x, z: cam.position.z });
                } else {
                    arSceneRef.current.recalibrateFromNode(result.nodeId);
                }
                console.log(`[QR] Re-anchored to: ${node.label || 'Node ' + node.id}`);
            } else {
                console.warn('[QR] Node not found in graph:', result.nodeId);
            }
        }
    }, [arMode, graph, stopQRScan]);

    // ── Select destination from within AR ─────────────────────────

    const handleSelectDestination = useCallback((section: StoreSection) => {
        const sectionUI: SectionForUI = {
            id: section.id,
            name: section.name,
            node_id: section.node_id,
            icon: section.icon,
            description: section.description,
            category: section.category,
        };
        setTargetSection(sectionUI);
        setShowDestinationPanel(false);

        // Re-init navigation with new target
        if (graph && arSceneRef.current) {
            arSceneRef.current.navEngine?.initialize(
                graph,
                graph.entranceNodeId,
                section.id
            );
        }
    }, [graph]);

    // ── AR Initialization ────────────────────────────────────────

    const initAR = useCallback(
        async (section: SectionForUI | null, graphData: NavigationGraph) => {
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
            if (!support.isMobile) {
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
                targetSectionId: section?.id || '',
                graph: graphData,
                startNodeId: graphData.entranceNodeId,
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
                onDistanceUpdate: () => { /* handled by state */ },
                onStateUpdate: (state: NavigationState) => {
                    setNavState(state);
                    if (arSceneRef.current?.navEngine) {
                        const pos = arSceneRef.current.navEngine.getUserPosition();
                        setUserPosition({ x: pos.x, z: pos.z });
                    }
                },
                onNavigationEvent: (event: NavigationEvent) => {
                    if (event.type === 'arrived') {
                        console.log('[NAV] Arrived at destination!');
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
        [handleBack, debugParam]
    );

    // ── Effect: Load Graph & Start ───────────────────────────────

    useEffect(() => {
        let mounted = true;

        async function load() {
            // 1. Fetch Graph
            const graphData = storeIdParam
                ? await fetchNavigationGraphForStore(storeIdParam)
                : await fetchNavigationGraph();
            if (!mounted) return;
            setGraph(graphData);

            // 2. Determine initial section
            let section: SectionForUI | null = null;

            if (sectionId) {
                const found = graphData.sections.find(s => s.id === sectionId);
                if (found) {
                    section = {
                        id: found.id,
                        name: found.name,
                        node_id: found.node_id,
                        icon: found.icon,
                        description: found.description,
                        category: found.category,
                    };
                }
            }

            if (section) {
                setTargetSection(section);
            } else if (startAtEntrance === 'true') {
                // Start without a destination — user can pick one later
                setShowDestinationPanel(true);
            } else if (!sectionId) {
                // No section specified — show destination picker
                setShowDestinationPanel(true);
            } else {
                handleBack();
                return;
            }

            // 3. Init AR
            initAR(section, graphData);
        }

        load();

        return () => {
            mounted = false;
            if (arSceneRef.current) arSceneRef.current.dispose();
            if (qrScannerRef.current) qrScannerRef.current.stopScanning();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sectionId, storeIdParam]);

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
                    <button
                        onClick={stopQRScan}
                        className="mt-64 px-6 py-3 rounded-full bg-white/10 border border-white/20 text-white backdrop-blur-md"
                    >
                        Cancel Scan
                    </button>
                    <p className="text-white/40 text-sm mt-4">Point at a store location code</p>
                </div>
            )}

            {/* Destination Selection Panel (in AR) */}
            <AnimatePresence>
                {showDestinationPanel && status === 'running' && !isScanningQR && (
                    <motion.div
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ type: 'spring', damping: 25 }}
                        className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] bg-black/90 backdrop-blur-xl rounded-t-2xl border-t border-white/15 flex flex-col"
                    >
                        {/* Handle */}
                        <div className="flex justify-center pt-2 pb-1">
                            <div className="w-10 h-1 bg-white/20 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="px-4 py-2 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-white">Where do you want to go?</h2>
                            {targetSection && (
                                <button
                                    onClick={() => setShowDestinationPanel(false)}
                                    className="text-xs text-white/40 px-2 py-1"
                                >
                                    Close
                                </button>
                            )}
                        </div>

                        {/* Search */}
                        <div className="px-4 pb-2">
                            <input
                                type="text"
                                value={destinationSearch}
                                onChange={(e) => setDestinationSearch(e.target.value)}
                                placeholder="Search sections..."
                                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 outline-none focus:border-[var(--accent)]/40"
                            />
                        </div>

                        {/* Category pills */}
                        {categories.length > 1 && (
                            <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
                                <button
                                    onClick={() => setSelectedCategory(null)}
                                    className={`px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${
                                        !selectedCategory
                                            ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
                                            : 'bg-white/5 text-white/40 border border-white/10'
                                    }`}
                                >
                                    All
                                </button>
                                {categories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap capitalize ${
                                            selectedCategory === cat
                                                ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
                                                : 'bg-white/5 text-white/40 border border-white/10'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Section list */}
                        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-1.5">
                            {filteredSections.map((section) => (
                                <button
                                    key={section.id}
                                    onClick={() => handleSelectDestination(section)}
                                    className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left flex items-center gap-3"
                                >
                                    <span className="text-xl">{section.icon || '📍'}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white">{section.name}</p>
                                        {section.description && (
                                            <p className="text-[10px] text-white/30 truncate">{section.description}</p>
                                        )}
                                    </div>
                                    <svg className="text-white/20 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            ))}
                            {filteredSections.length === 0 && (
                                <p className="text-center py-8 text-white/20 text-xs">No sections found</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* AR UI Overlay */}
            <AnimatePresence>
                {status === 'running' && !isScanningQR && !showDestinationPanel && (
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
                                    {targetSection ? (
                                        <>
                                            <p className="text-xs text-white/50">Navigating to</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{targetSection.icon || '📍'}</span>
                                                <p className="text-sm font-semibold text-white">
                                                    {targetSection.name}
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-white/50">No destination selected</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-2 pointer-events-auto">
                                {/* Destination button */}
                                <button
                                    onClick={() => setShowDestinationPanel(true)}
                                    className="glass-card w-10 h-10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                    title="Change Destination"
                                >
                                    📍
                                </button>

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
                        {navState && targetSection && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass-card px-6 py-3 text-center min-w-[200px]"
                            >
                                {navState.arrived ? (
                                    <>
                                        <p className="text-2xl font-bold text-[var(--accent)]">
                                            You&apos;ve Arrived!
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
                                            <span>
                                                ~{Math.ceil((navState.remainingDistance / 1.2) / 60)}:{String(Math.round((navState.remainingDistance / 1.2) % 60)).padStart(2, '0')} walk
                                            </span>
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

                        {/* No destination hint */}
                        {!targetSection && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
                            >
                                <button
                                    onClick={() => setShowDestinationPanel(true)}
                                    className="glass-card px-6 py-3 text-sm font-medium text-[var(--accent)]"
                                >
                                    Tap to select destination
                                </button>
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
