'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Sidebar from '@/components/admin/Sidebar';

function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
    const [userName, setUserName] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const router = useRouter();

    useEffect(() => {
        async function loadUser() {
            try {
                const supabase = createSupabaseBrowserClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    setUserName(user.email || 'Admin');
                }
            } catch {
                // Supabase not configured
            }
        }
        loadUser();
    }, []);

    async function handleLogout() {
        try {
            const supabase = createSupabaseBrowserClient();
            await supabase.auth.signOut();
        } catch {
            // ignore
        }
        router.push('/admin/login');
    }

    return (
        <div className="admin-layout">
            <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />

            <div className={`admin-main ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
                {/* Top bar */}
                <header className="admin-topbar">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="admin-topbar-btn lg:hidden"
                            aria-label="Toggle sidebar"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="admin-avatar">
                                {userName.charAt(0).toUpperCase() || 'A'}
                            </div>
                            <span className="text-sm text-white/60 hidden sm:inline">{userName}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="admin-topbar-btn text-white/40 hover:text-red-400"
                            title="Sign out"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Page content */}
                <main className="admin-content">
                    {children}
                </main>
            </div>
        </div>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Skip dashboard layout for login page
    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    return <AdminDashboardLayout>{children}</AdminDashboardLayout>;
}
