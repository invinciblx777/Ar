'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import HeroSection from '../components/HeroSection';
import StoreSelector from '../components/StoreSelector';
import SectionSelector from '../components/SectionSelector';
import StartButton from '../components/StartButton';
import FeatureCards from '../components/FeatureCards';
import { isMobile } from '../utils/device';

interface SelectedStore {
  id: string;
  name: string;
  length_meters: number;
  width_meters: number;
}

export default function Home() {
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(null);
  const [selectedSection, setSelectedSection] = useState<{
    id: string;
    name: string;
    node_id: string;
    icon: string | null;
    x?: number;
    z?: number;
  } | null>(null);
  const [showDesktopWarning, setShowDesktopWarning] = useState(false);

  useEffect(() => {
    if (!isMobile()) {
      setShowDesktopWarning(true);
    }
  }, []);

  return (
    <main className="min-h-screen gradient-mesh relative overflow-hidden">
      {showDesktopWarning && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-card px-5 py-3 flex items-center gap-3 max-w-md"
        >
          <span className="text-lg">📱</span>
          <p className="text-xs text-white/60">
            AR navigation requires a mobile device. Open this page on your phone
            for the full experience.
          </p>
          <button
            onClick={() => setShowDesktopWarning(false)}
            className="text-white/30 hover:text-white/60 transition-colors ml-2 shrink-0"
          >
            ✕
          </button>
        </motion.div>
      )}

      <HeroSection />

      <section className="px-6 pb-6 flex flex-col items-center">
        <StoreSelector
          onSelect={setSelectedStore}
          selected={selectedStore}
        />
        <SectionSelector
          storeId={selectedStore?.id ?? null}
          onSelect={setSelectedSection}
          selected={selectedSection}
        />
        <StartButton
          selectedSection={selectedSection}
          storeId={selectedStore?.id ?? null}
        />
      </section>

      <FeatureCards />

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-center py-10 text-xs text-white/20"
      >
        <p>AR Store Navigator</p>
        <p className="mt-1">Built with Next.js, Three.js, and WebXR</p>
      </motion.footer>
    </main>
  );
}
