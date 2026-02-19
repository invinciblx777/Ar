'use client';

import { motion } from 'framer-motion';

const features = [
    {
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        ),
        title: 'Real AR Experience',
        description: 'Uses WebXR API for true augmented reality — no gimmicks, no fake overlays.',
    },
    {
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Instant Navigation',
        description: 'Select your destination and follow 3D arrows placed on the floor in real-time.',
    },
    {
        icon: (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="2" width="14" height="20" rx="3" />
                <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        title: 'No App Required',
        description: 'Works in your mobile browser. Just open the link and start navigating.',
    },
];

const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, delay: 0.8 + i * 0.15 },
    }),
};

export default function FeatureCards() {
    return (
        <section className="px-6 py-16 max-w-4xl mx-auto">
            <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-xs uppercase tracking-widest text-white/30 text-center mb-10"
            >
                How It Works
            </motion.h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {features.map((feature, i) => (
                    <motion.div
                        key={feature.title}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={cardVariants}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        className="glass-card p-6 flex flex-col gap-4 group cursor-default"
                    >
                        <div className="text-[var(--accent)] opacity-70 group-hover:opacity-100 transition-opacity">
                            {feature.icon}
                        </div>
                        <h3 className="text-white font-semibold text-sm">{feature.title}</h3>
                        <p className="text-white/40 text-xs leading-relaxed">
                            {feature.description}
                        </p>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
