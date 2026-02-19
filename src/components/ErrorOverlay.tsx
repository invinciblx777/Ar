'use client';

import { motion } from 'framer-motion';

interface ErrorOverlayProps {
    type: 'unsupported' | 'permission' | 'error' | 'loading' | 'desktop';
    message?: string;
    onRetry?: () => void;
    onBack?: () => void;
}

const configs = {
    unsupported: {
        icon: '🚫',
        title: 'AR Not Supported',
        defaultMessage:
            'Your browser does not support WebXR. Please try with Chrome on an ARCore-compatible Android device.',
    },
    permission: {
        icon: '📷',
        title: 'Camera Access Required',
        defaultMessage:
            'Camera permission was denied. Please allow camera access in your browser settings and try again.',
    },
    error: {
        icon: '⚠️',
        title: 'Something Went Wrong',
        defaultMessage:
            'An error occurred while starting the AR session. Please try again.',
    },
    loading: {
        icon: '',
        title: 'Starting AR Session',
        defaultMessage: 'Initializing camera and AR environment...',
    },
    desktop: {
        icon: '📱',
        title: 'Mobile Device Required',
        defaultMessage:
            'AR navigation works on mobile devices only. Please open this page on your phone.',
    },
};

export default function ErrorOverlay({
    type,
    message,
    onRetry,
    onBack,
}: ErrorOverlayProps) {
    const config = configs[type];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 gradient-mesh"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-8 max-w-sm w-full text-center"
            >
                {type === 'loading' ? (
                    <div className="flex justify-center mb-6">
                        <div className="spinner" />
                    </div>
                ) : (
                    <div className="text-4xl mb-4">{config.icon}</div>
                )}

                <h2 className="text-lg font-semibold text-white mb-3">
                    {config.title}
                </h2>

                <p className="text-sm text-white/50 leading-relaxed mb-6">
                    {message || config.defaultMessage}
                </p>

                <div className="flex gap-3 justify-center">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="px-5 py-2.5 rounded-lg text-sm text-white/60 border border-white/10 hover:bg-white/5 transition-all"
                        >
                            Go Back
                        </button>
                    )}
                    {onRetry && type !== 'loading' && (
                        <button onClick={onRetry} className="glow-button !py-2.5 !px-5 !text-sm">
                            Try Again
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
