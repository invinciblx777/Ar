import * as THREE from 'three';

/**
 * Creates a procedural 3D arrow model for AR navigation.
 * The arrow points along the positive Z-axis by default.
 */
export function createArrowModel(): THREE.Group {
    const group = new THREE.Group();

    // Neon cyan material with emissive glow
    const material = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.4,
        transparent: true,
        opacity: 0.9,
    });

    // Arrow shaft (cylinder along Z-axis)
    const shaftGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
    const shaft = new THREE.Mesh(shaftGeometry, material);
    shaft.rotation.x = Math.PI / 2; // Rotate to align along Z
    shaft.position.z = -0.05; // Shift back so head is at front

    // Arrow head (cone pointing along Z-axis)
    const headGeometry = new THREE.ConeGeometry(0.08, 0.2, 8);
    const head = new THREE.Mesh(headGeometry, material);
    head.rotation.x = -Math.PI / 2; // Point along positive Z
    head.position.z = 0.25; // Position at front

    group.add(shaft);
    group.add(head);

    // Add a subtle glowing ring at the base
    const ringGeometry = new THREE.RingGeometry(0.1, 0.15, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2; // Lay flat
    ring.position.y = -0.01; // Slightly below arrow
    group.add(ring);

    return group;
}

/**
 * Animates the arrow with subtle floating motion.
 */
export function animateArrow(arrow: THREE.Group, time: number): void {
    // Gentle floating bob
    arrow.position.y = -0.5 + Math.sin(time * 2) * 0.05;

    // Subtle pulse on the ring (last child)
    const ring = arrow.children[2] as THREE.Mesh;
    if (ring && ring.material instanceof THREE.MeshStandardMaterial) {
        ring.material.opacity = 0.3 + Math.sin(time * 3) * 0.2;
    }
}
