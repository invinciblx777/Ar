import * as THREE from 'three';
import type { NavigationNode } from '../lib/mapData';
import type { ARPosition } from './coordinateMapper';

/**
 * Renders navigation waypoints as 3D markers in the AR scene.
 *
 * Features:
 * - Path markers at each waypoint
 * - Highlighted "next" waypoint with pulse animation
 * - Fade-out removal of passed waypoints
 * - Lead arrow pointing toward next waypoint
 * - Smooth rotation interpolation (lerp)
 * - Lightweight geometry for performance
 */

// ── Materials ──────────────────────────────────────────────────

const WAYPOINT_COLOR = 0x00f0ff;
const ACTIVE_COLOR = 0x00ff88;
const PATH_LINE_COLOR = 0x00f0ff;

function createWaypointMaterial(active = false): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color: active ? ACTIVE_COLOR : WAYPOINT_COLOR,
        emissive: active ? ACTIVE_COLOR : WAYPOINT_COLOR,
        emissiveIntensity: active ? 0.8 : 0.4,
        metalness: 0.3,
        roughness: 0.4,
        transparent: true,
        opacity: active ? 0.95 : 0.7,
    });
}

// ── Shared geometry (reuse for performance) ────────────────────

const WAYPOINT_SPHERE_GEO = new THREE.SphereGeometry(0.12, 12, 12);
const ACTIVE_SPHERE_GEO = new THREE.SphereGeometry(0.18, 16, 16);
const RING_GEO = new THREE.RingGeometry(0.2, 0.28, 24);
const ACTIVE_RING_GEO = new THREE.RingGeometry(0.25, 0.35, 32);

// ── Types ──────────────────────────────────────────────────────

interface WaypointMarker {
    group: THREE.Group;
    sphere: THREE.Mesh;
    ring: THREE.Mesh;
    nodeId: string;
    isActive: boolean;
}

// ── Renderer ───────────────────────────────────────────────────

export class WaypointRenderer {
    private scene: THREE.Object3D;
    private markers: WaypointMarker[] = [];
    private pathLine: THREE.Line | null = null;
    private leadArrowGroup: THREE.Group | null = null;
    private currentTargetAngle = 0;

    constructor(scene: THREE.Object3D) {
        this.scene = scene;
    }

    /**
     * Render a full path as waypoint markers.
     *
     * @param waypoints - Remaining path waypoints
     * @param positionConverter - Function to convert NavigationNode to AR position
     * @param activeIndex - Index in `waypoints` of the next active waypoint (0-based)
     */
    renderPath(
        waypoints: NavigationNode[],
        positionConverter: (node: NavigationNode) => ARPosition,
        activeIndex: number = 0
    ): void {
        // 1. Clear old markers
        this.clearMarkers();

        if (waypoints.length === 0) return;

        // 2. Create path line
        this.renderPathLine(waypoints, positionConverter);

        // 3. Create waypoint markers
        for (let i = 0; i < waypoints.length; i++) {
            const wp = waypoints[i];
            const arPos = positionConverter(wp);
            const isActive = i === activeIndex;
            const marker = this.createMarker(wp.id, arPos, isActive);
            this.markers.push(marker);
            this.scene.add(marker.group);
        }
    }

    /**
     * Update which waypoint is "active" (highlighted).
     */
    setActiveWaypoint(index: number): void {
        for (let i = 0; i < this.markers.length; i++) {
            const marker = this.markers[i];
            const shouldBeActive = i === index;

            if (marker.isActive !== shouldBeActive) {
                marker.isActive = shouldBeActive;

                // Swap geometry and material
                const mat = createWaypointMaterial(shouldBeActive);
                marker.sphere.geometry = shouldBeActive ? ACTIVE_SPHERE_GEO : WAYPOINT_SPHERE_GEO;
                marker.sphere.material = mat;

                marker.ring.geometry = shouldBeActive ? ACTIVE_RING_GEO : RING_GEO;
                marker.ring.material = new THREE.MeshStandardMaterial({
                    color: shouldBeActive ? ACTIVE_COLOR : WAYPOINT_COLOR,
                    emissive: shouldBeActive ? ACTIVE_COLOR : WAYPOINT_COLOR,
                    emissiveIntensity: shouldBeActive ? 0.6 : 0.3,
                    transparent: true,
                    opacity: shouldBeActive ? 0.7 : 0.4,
                    side: THREE.DoubleSide,
                });
            }
        }
    }

    /**
     * Remove the first N markers (passed waypoints) with optional animation.
     */
    removePassedWaypoints(count: number): void {
        for (let i = 0; i < count && this.markers.length > 0; i++) {
            const marker = this.markers.shift()!;
            this.scene.remove(marker.group);
            this.disposeMarker(marker);
        }

        // Update path line
        if (this.markers.length > 0) {
            this.updatePathLineFromMarkers();
        }
    }

    /**
     * Update lead arrow toward next waypoint with smooth interpolation.
     *
     * @param cameraARPosition - Current camera position in AR space
     * @param nextWaypointARPosition - Next waypoint position in AR space
     * @param elapsed - Time elapsed for animation
     */
    updateLeadArrow(
        cameraARPosition: ARPosition,
        nextWaypointARPosition: ARPosition,
        elapsed: number
    ): void {
        if (!this.leadArrowGroup) {
            this.leadArrowGroup = this.createLeadArrow();
            this.scene.add(this.leadArrowGroup);
        }

        const dx = nextWaypointARPosition.x - cameraARPosition.x;
        const dz = nextWaypointARPosition.z - cameraARPosition.z;
        const targetAngle = Math.atan2(dx, dz);

        // Smooth rotation interpolation
        this.currentTargetAngle = lerpAngle(this.currentTargetAngle, targetAngle, 0.1);

        // Position arrow 1.5m ahead of camera on the floor
        const arrowDist = 1.5;
        this.leadArrowGroup.position.set(
            cameraARPosition.x + Math.sin(this.currentTargetAngle) * arrowDist,
            -0.3, // Slightly above floor
            cameraARPosition.z + Math.cos(this.currentTargetAngle) * arrowDist
        );

        this.leadArrowGroup.rotation.y = this.currentTargetAngle;

        // Subtle floating animation
        this.leadArrowGroup.position.y = -0.3 + Math.sin(elapsed * 2) * 0.04;

        // Pulse opacity on ring
        const ring = this.leadArrowGroup.children[2] as THREE.Mesh;
        if (ring && ring.material instanceof THREE.MeshStandardMaterial) {
            ring.material.opacity = 0.3 + Math.sin(elapsed * 3) * 0.2;
        }
    }

    /**
     * Animate all markers (call each frame).
     */
    animate(elapsed: number): void {
        for (const marker of this.markers) {
            // Active waypoint pulse
            if (marker.isActive) {
                const scale = 1.0 + Math.sin(elapsed * 3) * 0.15;
                marker.sphere.scale.set(scale, scale, scale);

                if (marker.ring.material instanceof THREE.MeshStandardMaterial) {
                    marker.ring.material.opacity = 0.4 + Math.sin(elapsed * 4) * 0.3;
                }
            }

            // All rings rotate slowly
            marker.ring.rotation.z = elapsed * 0.5;
        }
    }

    /**
     * Clean up all resources.
     */
    dispose(): void {
        this.clearMarkers();
        this.clearPathLine();
        this.clearLeadArrow();
    }

    // ── Private methods ──────────────────────────────────────────

    private createMarker(nodeId: string, pos: ARPosition, active: boolean): WaypointMarker {
        const group = new THREE.Group();
        group.position.set(pos.x, 0.15, pos.z);

        // Glowing sphere
        const sphereMat = createWaypointMaterial(active);
        const sphere = new THREE.Mesh(
            active ? ACTIVE_SPHERE_GEO : WAYPOINT_SPHERE_GEO,
            sphereMat
        );
        group.add(sphere);

        // Floor ring
        const ringMat = new THREE.MeshStandardMaterial({
            color: active ? ACTIVE_COLOR : WAYPOINT_COLOR,
            emissive: active ? ACTIVE_COLOR : WAYPOINT_COLOR,
            emissiveIntensity: active ? 0.6 : 0.3,
            transparent: true,
            opacity: active ? 0.7 : 0.4,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(
            active ? ACTIVE_RING_GEO : RING_GEO,
            ringMat
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.14;
        group.add(ring);

        return { group, sphere, ring, nodeId, isActive: active };
    }

    private createLeadArrow(): THREE.Group {
        const group = new THREE.Group();

        const material = new THREE.MeshStandardMaterial({
            color: ACTIVE_COLOR,
            emissive: ACTIVE_COLOR,
            emissiveIntensity: 0.7,
            metalness: 0.3,
            roughness: 0.4,
            transparent: true,
            opacity: 0.9,
        });

        // Arrow shaft
        const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8);
        const shaft = new THREE.Mesh(shaftGeo, material);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.z = -0.05;
        group.add(shaft);

        // Arrow head
        const headGeo = new THREE.ConeGeometry(0.07, 0.18, 8);
        const head = new THREE.Mesh(headGeo, material);
        head.rotation.x = -Math.PI / 2;
        head.position.z = 0.22;
        group.add(head);

        // Floor ring
        const ringMat = new THREE.MeshStandardMaterial({
            color: ACTIVE_COLOR,
            emissive: ACTIVE_COLOR,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 24), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.01;
        group.add(ring);

        return group;
    }

    private renderPathLine(
        waypoints: NavigationNode[],
        positionConverter: (node: NavigationNode) => ARPosition
    ): void {
        this.clearPathLine();

        if (waypoints.length < 2) return;

        const points = waypoints.map(wp => {
            const ar = positionConverter(wp);
            return new THREE.Vector3(ar.x, 0.02, ar.z); // Slightly above floor
        });

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: PATH_LINE_COLOR,
            transparent: true,
            opacity: 0.3,
        });
        this.pathLine = new THREE.Line(geometry, material);
        this.scene.add(this.pathLine);
    }

    private updatePathLineFromMarkers(): void {
        this.clearPathLine();

        if (this.markers.length < 2) return;

        const points = this.markers.map(m =>
            new THREE.Vector3(m.group.position.x, 0.02, m.group.position.z)
        );
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: PATH_LINE_COLOR,
            transparent: true,
            opacity: 0.3,
        });
        this.pathLine = new THREE.Line(geometry, material);
        this.scene.add(this.pathLine);
    }

    private clearMarkers(): void {
        for (const marker of this.markers) {
            this.scene.remove(marker.group);
            this.disposeMarker(marker);
        }
        this.markers = [];
    }

    private clearPathLine(): void {
        if (this.pathLine) {
            this.scene.remove(this.pathLine);
            this.pathLine.geometry.dispose();
            (this.pathLine.material as THREE.Material).dispose();
            this.pathLine = null;
        }
    }

    private clearLeadArrow(): void {
        if (this.leadArrowGroup) {
            this.scene.remove(this.leadArrowGroup);
            this.leadArrowGroup.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            this.leadArrowGroup = null;
        }
    }

    private disposeMarker(marker: WaypointMarker): void {
        marker.group.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                // Don't dispose shared geometry
                if (obj.material instanceof THREE.Material) {
                    obj.material.dispose();
                }
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                }
            }
        });
    }
}

// ── Helpers ────────────────────────────────────────────────────

/** Lerp between two angles, handling wrapping */
function lerpAngle(current: number, target: number, t: number): number {
    let diff = target - current;

    // Wrap to [-PI, PI]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    return current + diff * t;
}
