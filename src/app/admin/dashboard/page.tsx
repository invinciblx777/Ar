'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import StoreCard from '@/components/admin/StoreCard';
import CreateStoreDialog from '@/components/admin/CreateStoreDialog';

interface Store {
    id: string;
    name: string;
    length_meters: number;
    width_meters: number;
    aisle_count: number;
    created_at: string;
}

export default function DashboardPage() {
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const supabase = createSupabaseBrowserClient();
    const router = useRouter();

    useEffect(() => {
        loadStores();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadStores() {
        setLoading(true);
        const { data, error } = await supabase
            .from('stores')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setStores(data);
        }
        setLoading(false);
    }

    function handleStoreCreated() {
        setShowCreateDialog(false);
        loadStores();
    }

    function handleStoreClick(storeId: string) {
        router.push(`/admin/stores/${storeId}`);
    }

    return (
        <div className="admin-page">
            {/* Page header */}
            <div className="admin-page-header">
                <div>
                    <h1 className="admin-page-title">Stores</h1>
                    <p className="admin-page-subtitle">
                        Manage your store digital twins and navigation maps
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="admin-btn-primary"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Create Store
                </button>
            </div>

            {/* Stats bar */}
            <div className="admin-stats-bar">
                <div className="admin-stat">
                    <span className="admin-stat-value">{stores.length}</span>
                    <span className="admin-stat-label">Total Stores</span>
                </div>
            </div>

            {/* Store grid */}
            {loading ? (
                <div className="admin-loading">
                    <div className="spinner" />
                    <p>Loading stores...</p>
                </div>
            ) : stores.length === 0 ? (
                <div className="admin-empty-state">
                    <div className="admin-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                    </div>
                    <h3>No stores yet</h3>
                    <p>Create your first store to start building digital twins</p>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="admin-btn-primary mt-4"
                    >
                        Create Your First Store
                    </button>
                </div>
            ) : (
                <div className="admin-card-grid">
                    {stores.map((store) => (
                        <StoreCard
                            key={store.id}
                            store={store}
                            onClick={() => handleStoreClick(store.id)}
                        />
                    ))}
                </div>
            )}

            {/* Create store dialog */}
            {showCreateDialog && (
                <CreateStoreDialog
                    onClose={() => setShowCreateDialog(false)}
                    onCreated={handleStoreCreated}
                />
            )}
        </div>
    );
}
