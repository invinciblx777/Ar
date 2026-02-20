'use client';

interface Store {
    id: string;
    name: string;
    length_meters: number;
    width_meters: number;
    aisle_count: number;
    created_at: string;
}

interface StoreCardProps {
    store: Store;
    onClick: () => void;
}

export default function StoreCard({ store, onClick }: StoreCardProps) {
    const date = new Date(store.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <button
            onClick={onClick}
            className="admin-store-card"
        >
            {/* Visual preview */}
            <div className="admin-store-preview">
                <div className="admin-store-grid-preview">
                    {/* Mini grid visualization */}
                    <svg viewBox="0 0 100 80" className="w-full h-full">
                        <rect x="5" y="5" width="90" height="70" rx="2" fill="none" stroke="rgba(0,240,255,0.2)" strokeWidth="1" />
                        {/* Aisles */}
                        {Array.from({ length: Math.min(store.aisle_count, 6) }).map((_, i) => {
                            const x = 15 + (i * 70) / Math.max(store.aisle_count, 1);
                            return (
                                <rect
                                    key={i}
                                    x={x}
                                    y="15"
                                    width="6"
                                    height="50"
                                    rx="1"
                                    fill="rgba(0,240,255,0.08)"
                                    stroke="rgba(0,240,255,0.15)"
                                    strokeWidth="0.5"
                                />
                            );
                        })}
                        {/* Entrance marker */}
                        <circle cx="50" cy="72" r="3" fill="rgba(0,240,255,0.5)" />
                    </svg>
                </div>
            </div>

            {/* Info */}
            <div className="admin-store-info">
                <h3 className="admin-store-name">{store.name}</h3>
                <div className="admin-store-meta">
                    <span>{store.length_meters}m × {store.width_meters}m</span>
                    <span className="admin-store-dot">·</span>
                    <span>{store.aisle_count} aisles</span>
                </div>
                <div className="admin-store-date">{date}</div>
            </div>

            {/* Hover arrow */}
            <div className="admin-store-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </div>
        </button>
    );
}
