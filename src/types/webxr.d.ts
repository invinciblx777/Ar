/**
 * WebXR and Safari-specific type declarations.
 */

// Safari's DeviceOrientationEvent includes webkitCompassHeading
interface DeviceOrientationEvent {
  readonly webkitCompassHeading?: number;
}

// DeviceOrientationEvent.requestPermission() on iOS 13+
interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}
