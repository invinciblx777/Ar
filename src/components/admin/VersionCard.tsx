'use client';

import type { StoreVersion } from '@/lib/versionManager';

interface VersionCardProps {
    version: StoreVersion;
    onPublish: (versionId: string) => void;
    onRevert: (versionId: string) => void;
    onEdit: (versionId: string) => void;
    isPublishing?: boolean;
}

export default function VersionCard({
    version,
    onPublish,
    onRevert,
    onEdit,
    isPublishing,
}: VersionCardProps) {
    const date = new Date(version.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div className={`admin-version-card ${version.is_published ? 'published' : ''}`}>
            <div className="admin-version-left">
                <div className="admin-version-number">
                    v{version.version_number}
                </div>
                <div className="admin-version-info">
                    <div className="flex items-center gap-2">
                        <span className="admin-version-date">{date}</span>
                        {version.is_published && (
                            <span className="admin-badge-published">Published</span>
                        )}
                        {version.is_draft && !version.is_published && (
                            <span className="admin-badge-draft">Draft</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="admin-version-actions">
                <button
                    onClick={() => onEdit(version.id)}
                    className="admin-btn-ghost"
                    title="Edit map"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                </button>

                {!version.is_published && (
                    <button
                        onClick={() => onPublish(version.id)}
                        className="admin-btn-accent"
                        disabled={isPublishing}
                    >
                        {isPublishing ? (
                            <span className="spinner-sm" />
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                        Publish
                    </button>
                )}

                <button
                    onClick={() => onRevert(version.id)}
                    className="admin-btn-ghost"
                    title="Clone as new draft"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                    </svg>
                    Clone
                </button>
            </div>
        </div>
    );
}
