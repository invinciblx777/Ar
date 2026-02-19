'use client';

import { motion } from 'framer-motion';

export default function HeroSection() {
    return (
        <section className="relative min-h-[60vh] flex flex-col items-center justify-center px-6 pt-20 pb-10 text-center">
            {/* Animated background orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-[500px] h-[500px] rounded-full opacity-20"
                    style={{
                        background: 'radial-gradient(circle, rgba(0,240,255,0.15) 0%, transparent 70%)',
                        top: '10%',
                        left: '20%',
                    }}
                    animate={{
                        x: [0, 30, -20, 0],
                        y: [0, -20, 15, 0],
                    }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="absolute w-[400px] h-[400px] rounded-full opacity-15"
                    style={{
                        background: 'radial-gradient(circle, rgba(0,128,255,0.12) 0%, transparent 70%)',
                        bottom: '10%',
                        right: '10%',
                    }}
                    animate={{
                        x: [0, -25, 20, 0],
                        y: [0, 15, -25, 0],
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                />
            </div>

            {/* Badge */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="glass-card px-4 py-1.5 text-xs tracking-widest uppercase text-[var(--accent)] mb-8"
            >
                AR Navigation • MVP
            </motion.div>

            {/* Main title */}
            <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-7xl font-bold leading-tight tracking-tight max-w-4xl"
            >
                Navigate Your Store
                <br />
                <span className="bg-gradient-to-r from-[#00f0ff] via-[#0080ff] to-[#6c00ff] bg-clip-text text-transparent">
                    in Augmented Reality
                </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="mt-6 text-base sm:text-lg text-white/50 max-w-xl leading-relaxed"
            >
                Point your phone. Follow the arrows. Find any section instantly.
                Powered by WebXR — no app download required.
            </motion.p>
        </section>
    );
}
