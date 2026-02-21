'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /admin/stores redirects to /admin/dashboard (which shows the stores list).
 */
export default function StoresRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/dashboard');
    }, [router]);

    return (
        <div className="admin-page">
            <div className="admin-loading">
                <div className="spinner" />
                <p>Loading...</p>
            </div>
        </div>
    );
}
