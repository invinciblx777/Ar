'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

const navItems = [
    {
        label: 'Dashboard',
        href: '/admin/dashboard',
        matchExact: true,
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        label: 'Stores',
        href: '/admin/dashboard',
        matchPrefix: '/admin/stores',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
    },
    {
        label: 'Map Builder',
        href: '/admin/map-builder',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
        ),
    },
    {
        label: 'QR Manager',
        href: '/admin/qr-manager',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" />
                <line x1="21" y1="14" x2="21" y2="21" />
                <line x1="14" y1="21" x2="21" y2="21" />
            </svg>
        ),
    },
];

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();

    return (
        <>
            {/* Mobile overlay */}
            {!isCollapsed && (
                <div
                    className="admin-sidebar-overlay lg:hidden"
                    onClick={onToggle}
                />
            )}

            <aside className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
                {/* Brand */}
                <div className="admin-sidebar-brand">
                    <div className="admin-brand-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                            <line x1="12" y1="22" x2="12" y2="15.5" />
                            <polyline points="22 8.5 12 15.5 2 8.5" />
                        </svg>
                    </div>
                    {!isCollapsed && (
                        <div>
                            <h1 className="text-sm font-bold text-white tracking-wide">NavGrid</h1>
                            <p className="text-[10px] text-white/30 tracking-wider uppercase">Admin Console</p>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="admin-sidebar-nav">
                    <div className="admin-sidebar-section-label">
                        {!isCollapsed && 'Navigation'}
                    </div>
                    {navItems.map((item) => {
                        const isActive =
                            (item.matchExact && pathname === item.href) ||
                            (item.matchPrefix && pathname.startsWith(item.matchPrefix)) ||
                            (!item.matchExact && !item.matchPrefix && (
                                pathname === item.href || pathname.startsWith(item.href + '/')
                            ));

                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={`admin-sidebar-link ${isActive ? 'active' : ''}`}
                                title={isCollapsed ? item.label : undefined}
                            >
                                <span className="admin-sidebar-icon">{item.icon}</span>
                                {!isCollapsed && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* Version info */}
                {!isCollapsed && (
                    <div className="mt-auto px-4 pb-4">
                        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                            <p className="text-[10px] text-white/20 font-mono">NavGrid v1.0</p>
                            <p className="text-[10px] text-white/15">Indoor AR Navigation SaaS</p>
                        </div>
                    </div>
                )}

                {/* Collapse toggle (desktop) */}
                <button
                    onClick={onToggle}
                    className="admin-sidebar-collapse hidden lg:flex"
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
                    >
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    {!isCollapsed && <span className="text-xs">Collapse</span>}
                </button>
            </aside>
        </>
    );
}
