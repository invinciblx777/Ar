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
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
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
                        const isActive = pathname === item.href ||
                            (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));

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
