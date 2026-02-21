'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
interface StartButtonProps {
    selectedSection: { id: string; name: string } | null;
    storeId?: string | null;
}

export default function StartButton({ selectedSection, storeId }: StartButtonProps) {
    const router = useRouter();

    const handleClick = () => {
        if (!selectedSection) return;
        const params = new URLSearchParams({ section: selectedSection.id });
        if (storeId) {
            params.set('storeId', storeId);
        }
        router.push(`/ar?${params.toString()}`);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-8"
        >
            <button
                onClick={handleClick}
                disabled={!selectedSection}
                className="glow-button text-sm sm:text-base"
            >
                <span className="flex items-center gap-2">
                    {/* AR icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M12 12L20 7.5"
                            stroke="currentColor"
                            strokeWidth="2"
                        />
                        <path
                            d="M12 12V21"
                            stroke="currentColor"
                            strokeWidth="2"
                        />
                        <path
                            d="M12 12L4 7.5"
                            stroke="currentColor"
                            strokeWidth="2"
                        />
                    </svg>
                    Start AR Navigation
                </span>
            </button>

            {!selectedSection && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-white/30 mt-3 text-center"
                >
                    Select a destination first
                </motion.p>
            )}
        </motion.div>
    );
}
