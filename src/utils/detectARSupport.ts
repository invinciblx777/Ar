/**
 * Comprehensive AR capability detection.
 * Returns a structured object describing what AR modes are available.
 */

export interface ARSupportInfo {
    /** WebXR immersive-ar is available (Android Chrome) */
    immersiveAR: boolean;
    /** WebXR inline session is available */
    inlineAR: boolean;
    /** Device is iOS (iPhone/iPad) */
    isiOS: boolean;
    /** Device is Android */
    isAndroid: boolean;
    /** Device is mobile (any) */
    isMobile: boolean;
    /** True if immersive-ar is NOT available but device is mobile — use camera fallback */
    fallbackRequired: boolean;
}

function checkIsiOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    // iPad on iOS 13+ reports as Mac, check for touch support
    return (
        /iPhone|iPad|iPod/i.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

function checkIsAndroid(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android/i.test(navigator.userAgent);
}

function checkIsMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    ) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function detectARSupport(): Promise<ARSupportInfo> {
    const isiOS = checkIsiOS();
    const isAndroid = checkIsAndroid();
    const isMobile = checkIsMobile();

    let immersiveAR = false;
    let inlineAR = false;

    if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr) {
        try {
            immersiveAR = await navigator.xr.isSessionSupported('immersive-ar');
        } catch {
            immersiveAR = false;
        }

        try {
            inlineAR = await navigator.xr.isSessionSupported('inline');
        } catch {
            inlineAR = false;
        }
    }

    return {
        immersiveAR,
        inlineAR,
        isiOS,
        isAndroid,
        isMobile,
        fallbackRequired: !immersiveAR && isMobile,
    };
}
