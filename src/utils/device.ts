/**
 * Device capability detection utilities
 */

export function isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

export async function isWebXRSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    if (!('xr' in navigator)) return false;

    try {
        return await navigator.xr!.isSessionSupported('immersive-ar');
    } catch {
        return false;
    }
}
