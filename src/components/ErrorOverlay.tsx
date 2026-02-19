'use client';

import { motion } from 'framer-motion';

interface ErrorOverlayProps {
    type:
    | 'unsupported'
    | 'permission'
    | 'error'
    | 'loading'
    | 'desktop'
    | 'motion-permission';
    message?: string;
    onRetry?: () => void;
    onBack?: () => void;
}

const configs = {
    unsupported: {
        icon: '📱',
        title: 'AR Not Available',
        defaultMessage:
            'Your browser doesn\'t support AR features. Please try with Chrome on Android or Safari on iOS.',
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
            'An error occurred while starting the AR experience. Please try again.',
    },
    loading: {
        icon: '',
        title: 'Optimizing AR for Your Device',
        defaultMessage: 'Setting up camera and AR environment...',
    },
    desktop: {
        icon: '📱',
        title: 'Mobile Device Required',
        defaultMessage:
            'AR navigation works on mobile devices only. Please open this page on your phone.',
    },
    'motion-permission': {
        icon: '🔄',
        title: 'Motion Access Required',
        defaultMessage:
            'To navigate in AR, we need access to your device\'s motion sensors. Tap "Allow" when prompted.',
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
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{
                background: 'rgba(5, 5, 8, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
            }}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', damping: 25 }}
                className="glass-card p-8 max-w-sm w-full text-center"
            >
                {type === 'loading' ? (
                    <div className="flex flex-col items-center mb-6 gap-4">
                        {/* Animated loading indicator */}
                        <div className="relative">
                            <div className="spinner" />
                            <div
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background:
                                        'radial-gradient(circle, rgba(0,240,255,0.1) 0%, transparent 70%)',
                                    animation: 'pulse-glow 2s ease-in-out infinite',
                                }}
                            />
                        </div>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '60%' }}
                            transition={{ duration: 2, ease: 'easeInOut' }}
                            className="h-0.5 rounded-full bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-40"
                        />
                    </div>
                ) : (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', damping: 15 }}
                        className="text-4xl mb-4"
                    >
                        {config.icon}
                    </motion.div>
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
                        <button
                            onClick={onRetry}
                            className="glow-button !py-2.5 !px-5 !text-sm"
                        >
                            {type === 'motion-permission' ? 'Enable Motion' : 'Try Again'}
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
