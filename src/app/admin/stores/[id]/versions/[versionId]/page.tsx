'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';

const MapBuilder = dynamic(() => import('@/components/map/MapBuilder'), {
    ssr: false,
    loading: () => (
        <div className="min-h-screen flex items-center justify-center bg-[#050508]">
            <div className="flex flex-col items-center gap-4">
                <div className="spinner" />
                <p className="text-white/50 text-sm">Loading Map Builder...</p>
            </div>
        </div>
    ),
});

export default function VersionMapBuilderPage({
    params,
}: {
    params: Promise<{ id: string; versionId: string }>;
}) {
    const { id: storeId, versionId } = use(params);

    return <MapBuilder storeId={storeId} versionId={versionId} />;
}
