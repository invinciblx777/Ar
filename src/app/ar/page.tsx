'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ARScene } from '../../ar/ARScene';
import { FallbackARScene } from '../../ar/FallbackARScene';
import { fetchSections, getSectionById, Section } from '../../lib/sections';
import { detectARSupport, ARSupportInfo } from '../../utils/detectARSupport';
import { formatDistance } from '../../utils/navigation';
import ErrorOverlay from '../../components/ErrorOverlay';

type ARStatus =
    | 'loading'
    | 'running'
    | 'error'
    | 'unsupported'
    | 'permission'
    | 'desktop'
    | 'motion-permission';

function ARPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const arSceneRef = useRef<ARScene | FallbackARScene | null>(null);

    const [status, setStatus] = useState<ARStatus>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [distance, setDistance] = useState<number | null>(null);
    const [targetSection, setTargetSection] = useState<Section | null>(null);
    const [arMode, setArMode] = useState<'webxr' | 'fallback' | null>(null);

    const sectionId = searchParams.get('section');

    const handleBack = useCallback(() => {
        router.push('/');
    }, [router]);

    const handleExit = useCallback(async () => {
        if (arSceneRef.current) {
            await arSceneRef.current.dispose();
            arSceneRef.current = null;
        }
        router.push('/');
    }, [router]);

    const initAR = useCallback(
        async (section: Section) => {
            if (!containerRef.current) return;

            setStatus('loading');

            // Detect AR capabilities
            let support: ARSupportInfo;
            try {
                support = await detectARSupport();
            } catch {
                support = {
                    immersiveAR: false,
                    inlineAR: false,
                    isiOS: false,
                    isAndroid: false,
                    isMobile: false,
                    fallbackRequired: true,
                };
            }

            // Desktop — no AR possible
            if (!support.isMobile) {
                setStatus('desktop');
                return;
            }

            // Clean up previous instance
            if (arSceneRef.current) {
                await arSceneRef.current.dispose();
                arSceneRef.current = null;
            }

            const sceneConfig = {
                targetX: section.x,
                targetZ: section.z,
                onSessionEnd: () => {
                    setStatus('loading');
                    handleBack();
                },
                onError: (msg: string) => {
                    if (msg.includes('permission') || msg.includes('Permission')) {
                        setStatus('permission');
                    } else {
                        setStatus('error');
                    }
                    setErrorMessage(msg);
                },
                onDistanceUpdate: (d: number) => {
                    setDistance(d);
                },
            };

            // Path A: WebXR immersive-ar (Android Chrome)
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

            // Path B: Camera fallback (iOS Safari, other mobile browsers)
            if (support.fallbackRequired) {
                setArMode('fallback');
                const fallbackScene = new FallbackARScene(
                    containerRef.current,
                    sceneConfig
                );
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

            // Neither path available
            setStatus('unsupported');
        },
        [handleBack]
    );

    useEffect(() => {
        if (!sectionId) {
            handleBack();
            return;
        }

        let mounted = true;

        fetchSections().then((sections) => {
            if (!mounted) return;
            const section = getSectionById(sections, sectionId);
            if (!section) {
                handleBack();
                return;
            }
            setTargetSection(section);
            initAR(section);
        });

        return () => {
            mounted = false;
            if (arSceneRef.current) {
                arSceneRef.current.dispose();
            }
        };
    }, [sectionId, handleBack, initAR]);

    return (
        <div className="fixed inset-0 bg-black">
            {/* Three.js canvas container (+ video element for fallback) */}
            <div ref={containerRef} className="w-full h-full relative" />

            {/* AR Overlay UI */}
            <AnimatePresence>
                {status === 'running' && targetSection && (
                    <>
                        {/* Top bar */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="ar-overlay flex items-center justify-between"
                        >
                            <div className="glass-card px-4 py-2">
                                <p className="text-xs text-white/50">Navigating to</p>
                                <p className="text-sm font-semibold text-white">
                                    {targetSection.name}
                                </p>
                                {arMode === 'fallback' && (
                                    <p className="text-[10px] text-[var(--accent)]/60 mt-0.5">
                                        Camera AR Mode
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={handleExit}
                                className="glass-card px-4 py-2.5 text-xs font-medium text-white/70 hover:text-white transition-colors"
                            >
                                Exit AR
                            </button>
                        </motion.div>

                        {/* Bottom distance indicator */}
                        {distance !== null && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass-card px-6 py-3 text-center"
                            >
                                <p className="text-2xl font-bold text-[var(--accent)]">
                                    {formatDistance(distance)}
                                </p>
                                <p className="text-xs text-white/40 mt-1">
                                    Follow the arrow
                                </p>
                            </motion.div>
                        )}
                    </>
                )}
            </AnimatePresence>

            {/* Error/Loading states */}
            <AnimatePresence>
                {status === 'loading' && (
                    <ErrorOverlay type="loading" onBack={handleBack} />
                )}
                {status === 'unsupported' && (
                    <ErrorOverlay type="unsupported" onBack={handleBack} />
                )}
                {status === 'permission' && (
                    <ErrorOverlay
                        type="permission"
                        message={errorMessage}
                        onBack={handleBack}
                        onRetry={() => targetSection && initAR(targetSection)}
                    />
                )}
                {status === 'error' && (
                    <ErrorOverlay
                        type="error"
                        message={errorMessage}
                        onBack={handleBack}
                        onRetry={() => targetSection && initAR(targetSection)}
                    />
                )}
                {status === 'desktop' && (
                    <ErrorOverlay type="desktop" onBack={handleBack} />
                )}
                {status === 'motion-permission' && (
                    <ErrorOverlay
                        type="motion-permission"
                        onBack={handleBack}
                        onRetry={() => targetSection && initAR(targetSection)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

export default function ARPage() {
    return (
        <Suspense
            fallback={
                <div className="fixed inset-0 bg-black flex items-center justify-center">
                    <div className="spinner" />
                </div>
            }
        >
            <ARPageContent />
        </Suspense>
    );
}
