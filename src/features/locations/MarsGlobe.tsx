"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useTexture } from "@react-three/drei";
import { Group, Spherical, Vector3, type PerspectiveCamera } from "three";
import { getMarsPoi, marsPois, type MarsPoi } from "./poi-catalog";
import { SkyField } from "./SkyField";
import "./globe.css";

function point(latitude: number, longitude: number, radius = 2.68): [number, number, number] {
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  return [Math.cos(lat) * Math.sin(lon) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.cos(lon) * radius];
}

function ZoomBridge({ zoomRef, minDistance = 3.5 }: { zoomRef: React.RefObject<((direction: 1 | -1) => void) | null>; minDistance?: number }) {
  const { camera } = useThree();
  useEffect(() => {
    zoomRef.current = (direction) => {
      const perspective = camera as PerspectiveCamera;
      perspective.position.multiplyScalar(direction === 1 ? .78 : 1.28);
      const distance = perspective.position.length();
      if (distance < minDistance) perspective.position.setLength(minDistance);
      if (distance > 18) perspective.position.setLength(18);
      perspective.updateProjectionMatrix();
    };
    return () => { zoomRef.current = null; };
  }, [camera, zoomRef, minDistance]);
  return null;
}

function FitGlobeToViewport({ offsetX = 0 }: { offsetX?: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const halfWidthAtUnitDistance = Math.tan(perspective.fov * Math.PI / 360) * size.width / size.height;
    const minimumDistance = 2.75 / halfWidthAtUnitDistance;
    perspective.position.setLength(Math.max(8.3, minimumDistance));
    if (offsetX && size.width > 700) perspective.setViewOffset(size.width, size.height, size.width * offsetX, 0, size.width, size.height);
    else perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height, offsetX]);
  return null;
}

type GlobeProps = { selected: string; focusRequest: number; onSelect: (id: string) => void; onReady: () => void; topography: boolean; labels: boolean; constellations: boolean; zoomRef: React.RefObject<((direction: 1 | -1) => void) | null>; offsetX?: number; showAllNames?: boolean; minDistance?: number };

function GlobeErrorFallback({ onUnavailable }: { onUnavailable: () => void }) {
  useEffect(() => { onUnavailable(); }, [onUnavailable]);
  return <div className="explore-globe-fallback">3D globe unavailable.</div>;
}

class GlobeRenderBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <GlobeErrorFallback onUnavailable={this.props.onUnavailable} />;
    return this.props.children;
  }
}

function MarsMarker({ location, selected, onSelect, showAllNames }: { location: MarsPoi; selected: string; onSelect: (id: string) => void; showAllNames?: boolean }) {
  const marker = useRef<Group>(null);
  const label = useRef<HTMLButtonElement>(null);
  const position = useRef(new Vector3());
  const sight = useRef(new Vector3());
  const { camera } = useThree();
  useFrame(() => {
    if (!marker.current) return;
    marker.current.getWorldPosition(position.current);
    sight.current.copy(camera.position).sub(position.current).normalize();
    const frontFacing = position.current.normalize().dot(sight.current) > .18;
    marker.current.visible = frontFacing;
    if (label.current) {
      label.current.style.visibility = frontFacing ? "visible" : "hidden";
      label.current.style.pointerEvents = frontFacing ? "auto" : "none";
    }
  });
  return <group ref={marker} visible={false} position={point(location.latitude, location.longitude)}>
    {(showAllNames || location.featured || location.id === selected) && <Html position={[0, .13, 0]} center distanceFactor={4}><button ref={label} className={`globe-location${location.id === selected ? "" : " secondary"}`} type="button" onClick={() => onSelect(location.id)}>{location.name}</button></Html>}
  </group>;
}

function GlobeScene({ selected, focusRequest, onSelect, onReady, topography, labels, constellations, zoomRef, offsetX, showAllNames, minDistance }: GlobeProps) {
  const [orbitalTexture, elevationTexture, heightTexture] = useTexture(["/images/locations/mars-viking-global.jpg", "/images/locations/mars-mola-topography.jpg", "/images/locations/mars-mola-height.png"]);
  const { camera } = useThree();
  useEffect(() => { onReady(); }, [onReady]);
  const [initialRotation] = useState<[number, number, number]>(() => {
    const poi = getMarsPoi(selected);
    return [poi.latitude * Math.PI / 180, -poi.longitude * Math.PI / 180, 0];
  });
  const globe = useRef<Group>(null);
  const sky = useRef<Group>(null);
  const previousRotation = useRef(new Vector3(...initialRotation));
  const target = useRef<{ x: number; y: number } | null>(null);
  const resetCamera = useRef(false);
  const cameraDistance = useRef(0);
  const cameraSpherical = useRef(new Spherical());
  useEffect(() => {
    if (!focusRequest || !globe.current) return;
    const poi = getMarsPoi(selected);
    const nextY = -poi.longitude * Math.PI / 180;
    const currentY = globe.current.rotation.y;
    const shortestY = currentY + Math.atan2(Math.sin(nextY - currentY), Math.cos(nextY - currentY));
    target.current = { x: poi.latitude * Math.PI / 180, y: shortestY };
    cameraDistance.current = camera.position.length();
    resetCamera.current = true;
  }, [selected, focusRequest]);
  useFrame((_, delta) => {
    if (target.current && globe.current) {
      const blend = 1 - Math.exp(-Math.min(delta, .05) * 4.5);
      globe.current.rotation.x += (target.current.x - globe.current.rotation.x) * blend;
      globe.current.rotation.y += (target.current.y - globe.current.rotation.y) * blend;
      if (resetCamera.current) {
        cameraSpherical.current.setFromVector3(camera.position);
        const thetaToFront = Math.atan2(Math.sin(-cameraSpherical.current.theta), Math.cos(-cameraSpherical.current.theta));
        cameraSpherical.current.theta += thetaToFront * blend;
        cameraSpherical.current.phi += (Math.PI / 2 - cameraSpherical.current.phi) * blend;
        cameraSpherical.current.radius = cameraDistance.current;
        camera.position.setFromSpherical(cameraSpherical.current);
        camera.lookAt(0, 0, 0);
      }
      if (Math.abs(target.current.x - globe.current.rotation.x) < .002 && Math.abs(target.current.y - globe.current.rotation.y) < .002 && Math.abs(camera.position.x) < .02 && Math.abs(camera.position.y) < .02) {
        globe.current.rotation.set(target.current.x, target.current.y, 0);
        camera.position.set(0, 0, cameraDistance.current);
        camera.lookAt(0, 0, 0);
        target.current = null;
        resetCamera.current = false;
      }
    }
    if (globe.current) {
      if (sky.current) {
        sky.current.rotation.x += globe.current.rotation.x - previousRotation.current.x;
        sky.current.rotation.y += globe.current.rotation.y - previousRotation.current.y;
      }
      previousRotation.current.copy(globe.current.rotation);
    }
  });
  return <>
    <color attach="background" args={["#090d11"]} />
    <ambientLight intensity={1.2} />
    <directionalLight position={[5, 4, 7]} intensity={2.2} color="#fff4e5" />
    <SkyField constellations={constellations} groupRef={sky} />
    <group ref={globe} rotation={initialRotation}>
      <mesh rotation={[0, -Math.PI / 2, 0]}>
        <sphereGeometry args={[2.5, 256, 128]} />
        <meshStandardMaterial map={topography ? elevationTexture : orbitalTexture} displacementMap={heightTexture} displacementScale={.24} displacementBias={-.067} roughness={1} />
      </mesh>
      {labels && marsPois.map((location) => <MarsMarker key={location.id} location={location} selected={selected} onSelect={onSelect} showAllNames={showAllNames} />)}
    </group>
    <OrbitControls enablePan={false} enableZoom enableRotate minDistance={minDistance ?? 3.5} maxDistance={18} autoRotate={false} />
    <ZoomBridge zoomRef={zoomRef} minDistance={minDistance} />
    <FitGlobeToViewport offsetX={offsetX} />
  </>;
}

export function MarsGlobe({ selected, focusRequest, onSelect, onReady, topography, labels, constellations, zoomRef, offsetX, showAllNames, minDistance }: GlobeProps) {
  return <GlobeRenderBoundary onUnavailable={onReady}>
    <Canvas camera={{ position: [0, 0, 8.3], fov: 45, near: .1, far: 200 }} dpr={[1, 1.5]} fallback="3D globe unavailable.">
      <GlobeScene selected={selected} focusRequest={focusRequest} onSelect={onSelect} onReady={onReady} topography={topography} labels={labels} constellations={constellations} zoomRef={zoomRef} offsetX={offsetX} showAllNames={showAllNames} minDistance={minDistance} />
    </Canvas>
  </GlobeRenderBoundary>;
}
