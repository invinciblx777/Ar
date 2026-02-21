'use client';

import { useState, useEffect } from 'react';
import QRManager from '@/components/admin/QRManager';

interface Store {
    id: string;
    name: string;
}

interface Version {
    id: string;
    version_number: number;
    is_published: boolean;
    is_draft: boolean;
}

interface NodeInfo {
    id: string;
    x: number;
    z: number;
    label: string | null;
    type: string;
}

export default function QRManagerPage() {
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStoreId, setSelectedStoreId] = useState<string>('');
    const [versions, setVersions] = useState<Version[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>('');
    const [nodes, setNodes] = useState<NodeInfo[]>([]);
    const [floorId, setFloorId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [loadingNodes, setLoadingNodes] = useState(false);

    // Load stores
    useEffect(() => {
        async function loadStores() {
            try {
                const res = await fetch('/api/admin/stores');
                const data = await res.json();
                if (data.stores) {
                    setStores(data.stores);
                    if (data.stores.length > 0) {
                        setSelectedStoreId(data.stores[0].id);
                    }
                }
            } catch (err) {
                console.error('Failed to load stores:', err);
            }
            setLoading(false);
        }
        loadStores();
    }, []);

    // Load versions when store changes
    useEffect(() => {
        if (!selectedStoreId) return;

        async function loadVersions() {
            try {
                const res = await fetch(`/api/admin/stores?id=${selectedStoreId}&versions=true`);
                const data = await res.json();
                if (data.versions) {
                    setVersions(data.versions);
                    // Auto-select published version
                    const published = data.versions.find((v: Version) => v.is_published);
                    if (published) {
                        setSelectedVersionId(published.id);
                    } else if (data.versions.length > 0) {
                        setSelectedVersionId(data.versions[0].id);
                    }
                }
            } catch (err) {
                console.error('Failed to load versions:', err);
            }
        }
        loadVersions();
    }, [selectedStoreId]);

    // Load nodes when version changes
    useEffect(() => {
        if (!selectedVersionId) return;

        async function loadNodes() {
            setLoadingNodes(true);
            try {
                const res = await fetch(`/api/admin/stores?versionId=${selectedVersionId}&nodes=true`);
                const data = await res.json();
                if (data.nodes) {
                    setNodes(data.nodes);
                }
                if (data.floorId) {
                    setFloorId(data.floorId);
                }
            } catch (err) {
                console.error('Failed to load nodes:', err);
            }
            setLoadingNodes(false);
        }
        loadNodes();
    }, [selectedVersionId]);

    if (loading) {
        return (
            <div className="admin-page">
                <div className="admin-loading">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <div className="admin-page-header">
                <div>
                    <h1 className="admin-page-title">QR Code Manager</h1>
                    <p className="admin-page-subtitle">
                        Generate and manage QR anchor codes for indoor positioning
                    </p>
                </div>
            </div>

            {/* Store & Version selectors */}
            <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                        Store
                    </label>
                    <select
                        value={selectedStoreId}
                        onChange={(e) => setSelectedStoreId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 outline-none focus:border-accent/40 appearance-none cursor-pointer"
                    >
                        {stores.map((store) => (
                            <option key={store.id} value={store.id}>
                                {store.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                        Version
                    </label>
                    <select
                        value={selectedVersionId}
                        onChange={(e) => setSelectedVersionId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 outline-none focus:border-accent/40 appearance-none cursor-pointer"
                    >
                        {versions.map((v) => (
                            <option key={v.id} value={v.id}>
                                v{v.version_number}
                                {v.is_published ? ' (Published)' : ''}
                                {v.is_draft ? ' (Draft)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* QR Manager */}
            {loadingNodes ? (
                <div className="admin-loading">
                    <div className="spinner" />
                    <p>Loading nodes...</p>
                </div>
            ) : selectedStoreId && selectedVersionId ? (
                <QRManager
                    storeId={selectedStoreId}
                    versionId={selectedVersionId}
                    floorId={floorId}
                    nodes={nodes}
                />
            ) : (
                <div className="admin-empty-state">
                    <h3>Select a store and version</h3>
                    <p>Choose a store and version to manage QR codes</p>
                </div>
            )}
        </div>
    );
}
