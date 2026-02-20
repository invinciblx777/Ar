'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
    getVersions,
    publishVersion,
    cloneVersionAsDraft,
    type StoreVersion,
} from '@/lib/versionManager';
import VersionCard from '@/components/admin/VersionCard';

interface Store {
    id: string;
    name: string;
    length_meters: number;
    width_meters: number;
    aisle_count: number;
    aisle_width: number;
    corridor_spacing: number;
    grid_cell_size: number;
    created_at: string;
}

export default function StoreDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: storeId } = use(params);
    const [store, setStore] = useState<Store | null>(null);
    const [versions, setVersions] = useState<StoreVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const supabase = createSupabaseBrowserClient();
    const router = useRouter();

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId]);

    async function loadData() {
        setLoading(true);

        const [storeRes, versionsData] = await Promise.all([
            supabase.from('stores').select('*').eq('id', storeId).single(),
            getVersions(supabase, storeId),
        ]);

        if (storeRes.data) setStore(storeRes.data);
        setVersions(versionsData);
        setLoading(false);
    }

    async function handlePublish(versionId: string) {
        setActionLoading(true);
        await publishVersion(supabase, versionId, storeId);
        await loadData();
        setActionLoading(false);
    }

    async function handleRevert(versionId: string) {
        setActionLoading(true);
        await cloneVersionAsDraft(supabase, versionId, storeId);
        await loadData();
        setActionLoading(false);
    }

    function handleEdit(versionId: string) {
        router.push(`/admin/stores/${storeId}/versions/${versionId}`);
    }

    async function handleNewVersion() {
        setActionLoading(true);
        const latestVersion = versions[0];
        if (latestVersion) {
            await cloneVersionAsDraft(supabase, latestVersion.id, storeId);
        }
        await loadData();
        setActionLoading(false);
    }

    if (loading) {
        return (
            <div className="admin-page">
                <div className="admin-loading">
                    <div className="spinner" />
                    <p>Loading store...</p>
                </div>
            </div>
        );
    }

    if (!store) {
        return (
            <div className="admin-page">
                <div className="admin-empty-state">
                    <h3>Store not found</h3>
                    <button onClick={() => router.push('/admin/dashboard')} className="admin-btn-primary mt-4">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            {/* Breadcrumb */}
            <div className="admin-breadcrumb">
                <button onClick={() => router.push('/admin/dashboard')} className="admin-breadcrumb-link">
                    Stores
                </button>
                <span className="admin-breadcrumb-sep">/</span>
                <span className="admin-breadcrumb-current">{store.name}</span>
            </div>

            {/* Store header */}
            <div className="admin-page-header">
                <div>
                    <h1 className="admin-page-title">{store.name}</h1>
                    <div className="admin-store-dimensions">
                        <span>{store.length_meters}m × {store.width_meters}m</span>
                        <span className="admin-store-dot">·</span>
                        <span>{store.aisle_count} aisles</span>
                        <span className="admin-store-dot">·</span>
                        <span>{(store.length_meters * store.width_meters).toFixed(0)} m²</span>
                    </div>
                </div>
                <button
                    onClick={handleNewVersion}
                    disabled={actionLoading}
                    className="admin-btn-primary"
                >
                    {actionLoading ? (
                        <>
                            <span className="spinner-sm" />
                            Working...
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            New Version
                        </>
                    )}
                </button>
            </div>

            {/* Versions */}
            <div className="admin-section">
                <h2 className="admin-section-title">
                    Map Versions
                    <span className="admin-section-count">{versions.length}</span>
                </h2>

                {versions.length === 0 ? (
                    <div className="admin-empty-state small">
                        <p>No versions yet</p>
                    </div>
                ) : (
                    <div className="admin-version-list">
                        {versions.map((v) => (
                            <VersionCard
                                key={v.id}
                                version={v}
                                onPublish={handlePublish}
                                onRevert={handleRevert}
                                onEdit={handleEdit}
                                isPublishing={actionLoading}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Store config info */}
            <div className="admin-section">
                <h2 className="admin-section-title">Configuration</h2>
                <div className="admin-config-grid">
                    <div className="admin-config-item">
                        <span className="admin-config-label">Grid Cell Size</span>
                        <span className="admin-config-value">{store.grid_cell_size}m</span>
                    </div>
                    <div className="admin-config-item">
                        <span className="admin-config-label">Aisle Width</span>
                        <span className="admin-config-value">{store.aisle_width}m</span>
                    </div>
                    <div className="admin-config-item">
                        <span className="admin-config-label">Corridor Spacing</span>
                        <span className="admin-config-value">{store.corridor_spacing}m</span>
                    </div>
                    <div className="admin-config-item">
                        <span className="admin-config-label">Floor Area</span>
                        <span className="admin-config-value">{(store.length_meters * store.width_meters).toFixed(0)} m²</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
