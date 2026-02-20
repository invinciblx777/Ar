'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { generateGrid, validateGridConfig, type GridConfig } from '@/lib/gridGenerator';
import { createInitialVersion, saveGridToFloor } from '@/lib/versionManager';

interface CreateStoreDialogProps {
    onClose: () => void;
    onCreated: () => void;
}

export default function CreateStoreDialog({ onClose, onCreated }: CreateStoreDialogProps) {
    const [name, setName] = useState('');
    const [length, setLength] = useState(20);
    const [width, setWidth] = useState(15);
    const [aisleCount, setAisleCount] = useState(4);
    const [aisleWidth, setAisleWidth] = useState(1.2);
    const [corridorSpacing, setCorridorSpacing] = useState(2.0);
    const [cellSize, setCellSize] = useState(1.0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const supabase = createSupabaseBrowserClient();
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Validate
        const config: GridConfig = {
            lengthMeters: length,
            widthMeters: width,
            aisleCount,
            aisleWidth,
            corridorSpacing,
            cellSize,
        };

        const errors = validateGridConfig(config);
        if (errors.length > 0) {
            setError(errors.join('. '));
            setLoading(false);
            return;
        }

        if (!name.trim()) {
            setError('Store name is required');
            setLoading(false);
            return;
        }

        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setError('Not authenticated');
                setLoading(false);
                return;
            }

            // 1. Create store
            const { data: store, error: storeError } = await supabase
                .from('stores')
                .insert({
                    name: name.trim(),
                    length_meters: length,
                    width_meters: width,
                    aisle_count: aisleCount,
                    aisle_width: aisleWidth,
                    corridor_spacing: corridorSpacing,
                    grid_cell_size: cellSize,
                    created_by: user.id,
                })
                .select()
                .single();

            if (storeError || !store) {
                setError(storeError?.message || 'Failed to create store');
                setLoading(false);
                return;
            }

            // 2. Create initial version + floor
            const vResult = await createInitialVersion(supabase, store.id);
            if (!vResult.success || !vResult.floorId) {
                setError(vResult.error || 'Failed to create version');
                setLoading(false);
                return;
            }

            // 3. Generate grid
            const grid = generateGrid(config);

            // 4. Save grid to floor
            const saveResult = await saveGridToFloor(
                supabase,
                vResult.floorId,
                grid.nodes,
                grid.edges
            );

            if (!saveResult.success) {
                setError(saveResult.error || 'Failed to save grid');
                setLoading(false);
                return;
            }

            // 5. Navigate to the map builder for this version
            onCreated();
            router.push(`/admin/stores/${store.id}`);
        } catch (err) {
            setError(String(err));
            setLoading(false);
        }
    }

    return (
        <div className="admin-dialog-overlay" onClick={onClose}>
            <div className="admin-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="admin-dialog-header">
                    <h2>Create New Store</h2>
                    <button onClick={onClose} className="admin-dialog-close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="admin-dialog-body">
                    {error && (
                        <div className="admin-error">{error}</div>
                    )}

                    <div className="admin-form-group">
                        <label>Store Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Downtown Mall"
                            required
                            className="admin-input"
                        />
                    </div>

                    <div className="admin-form-row">
                        <div className="admin-form-group">
                            <label>Length (meters)</label>
                            <input
                                type="number"
                                value={length}
                                onChange={(e) => setLength(Number(e.target.value))}
                                min={2}
                                max={500}
                                step={0.5}
                                className="admin-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label>Width (meters)</label>
                            <input
                                type="number"
                                value={width}
                                onChange={(e) => setWidth(Number(e.target.value))}
                                min={2}
                                max={500}
                                step={0.5}
                                className="admin-input"
                            />
                        </div>
                    </div>

                    <div className="admin-form-row">
                        <div className="admin-form-group">
                            <label>Aisle Count</label>
                            <input
                                type="number"
                                value={aisleCount}
                                onChange={(e) => setAisleCount(Number(e.target.value))}
                                min={0}
                                max={50}
                                className="admin-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label>Aisle Width (m)</label>
                            <input
                                type="number"
                                value={aisleWidth}
                                onChange={(e) => setAisleWidth(Number(e.target.value))}
                                min={0.5}
                                max={5}
                                step={0.1}
                                className="admin-input"
                            />
                        </div>
                    </div>

                    <div className="admin-form-group">
                        <label>Corridor Spacing (m)</label>
                        <input
                            type="number"
                            value={corridorSpacing}
                            onChange={(e) => setCorridorSpacing(Number(e.target.value))}
                            min={1}
                            max={10}
                            step={0.5}
                            className="admin-input"
                        />
                        <span className="admin-form-hint">
                            Distance between walking corridors
                        </span>
                    </div>

                    {/* Advanced */}
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="admin-text-btn"
                    >
                        {showAdvanced ? '▾ Hide' : '▸ Show'} Advanced Settings
                    </button>

                    {showAdvanced && (
                        <div className="admin-form-group">
                            <label>Grid Cell Size (m)</label>
                            <input
                                type="number"
                                value={cellSize}
                                onChange={(e) => setCellSize(Number(e.target.value))}
                                min={0.5}
                                max={5}
                                step={0.5}
                                className="admin-input"
                            />
                            <span className="admin-form-hint">
                                Resolution of the navigation grid (default 1m = 1 unit)
                            </span>
                        </div>
                    )}

                    {/* Preview info */}
                    <div className="admin-preview-info">
                        <div className="admin-preview-stat">
                            <span>Grid Size</span>
                            <span className="admin-preview-value">
                                {Math.floor(width / cellSize) + 1} × {Math.floor(length / cellSize) + 1}
                            </span>
                        </div>
                        <div className="admin-preview-stat">
                            <span>Floor Area</span>
                            <span className="admin-preview-value">{(length * width).toFixed(0)} m²</span>
                        </div>
                    </div>

                    <div className="admin-dialog-actions">
                        <button type="button" onClick={onClose} className="admin-btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="admin-btn-primary">
                            {loading ? (
                                <>
                                    <span className="spinner-sm" />
                                    Creating...
                                </>
                            ) : (
                                'Create & Generate Grid'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
