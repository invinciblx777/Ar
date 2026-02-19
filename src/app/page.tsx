'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import HeroSection from '../components/HeroSection';
import SectionSelector from '../components/SectionSelector';
import StartButton from '../components/StartButton';
import FeatureCards from '../components/FeatureCards';
import ErrorOverlay from '../components/ErrorOverlay';
import { Section } from '../lib/sections';
import { isMobile } from '../utils/device';

export default function Home() {
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [showDesktopWarning, setShowDesktopWarning] = useState(false);

  useEffect(() => {
    if (!isMobile()) {
      setShowDesktopWarning(true);
    }
  }, []);

  return (
    <main className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* Desktop warning toast */}
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

      {/* Navigation controls */}
      <section className="px-6 pb-6 flex flex-col items-center">
        <SectionSelector
          onSelect={setSelectedSection}
          selected={selectedSection}
        />
        <StartButton selectedSection={selectedSection} />
      </section>

      <FeatureCards />

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-center py-10 text-xs text-white/20"
      >
        <p>AR Store Navigator — MVP Demo</p>
        <p className="mt-1">
          Built with Next.js • Three.js • WebXR
        </p>
      </motion.footer>
    </main>
  );
}
