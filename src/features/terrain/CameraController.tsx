"use client";
import { useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as ControlsType } from "three-stdlib";
import {
  MOUSE,
  TOUCH,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from "three";
import gsap from "gsap";
import { fromScene, toScene } from "./spatial";
import { sampleDisplayedPosition, type FocusCommand } from "./detail-surface";
import type { ReliefScale } from "./terrain-display";
import type { HeightGrid, LocalPoint } from "../mission/types";
function resizeCamera(
  camera: OrthographicCamera | PerspectiveCamera,
  width: number,
  height: number,
  span: number,
) {
  const aspect = width / Math.max(1, height);
  if (camera instanceof OrthographicCamera) {
    const half = span * 0.57;
    camera.left = -half * Math.max(1, aspect);
    camera.right = -camera.left;
    camera.top = half * Math.max(1, 1 / aspect);
    camera.bottom = -camera.top;
  } else {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
}
export function CameraController({
  view,
  token,
  span,
  grid,
  focus,
  onNavigate,
  onManual,
  detail = null,
  datum = 0,
  scale = 1,
  followPoint = null,
  selectionFocus = null,
}: {
  detail?: HeightGrid | null;
  datum?: number;
  scale?: ReliefScale;
  followPoint?: LocalPoint | null;
  selectionFocus?: { point: LocalPoint; token: number } | null;
  view: "orbit" | "top";
  token: number;
  span: number;
  grid: HeightGrid;
  focus: FocusCommand | null;
  onNavigate: (target: LocalPoint, span: number) => void;
  onManual: () => void;
}) {
  const controls = useRef<ControlsType>(null);
  const settled = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settled.current) clearTimeout(settled.current);
    },
    [],
  );
  const { set, get, size, invalidate } = useThree();
  const camera = useMemo(() => {
    if (view === "top") {
      const top = new OrthographicCamera(-1, 1, 1, -1, 1, 15000);
      top.position.set(0, 3700, 0.01);
      top.lookAt(0, 0, 0);
      return top;
    }
    const perspective = new PerspectiveCamera(38, 1, 1, 15000);
    perspective.position.set(2000, 1650, 2250);
    perspective.lookAt(0, 36, 0);
    return perspective;
  }, [view]);
  useLayoutEffect(() => {
    const previous = get().camera;
    set({ camera });
    return () => set({ camera: previous });
  }, [camera, get, set]);
  useLayoutEffect(() => {
    resizeCamera(camera, size.width, size.height, span);
    invalidate();
  }, [camera, size.width, size.height, span, invalidate]);
  const command = selectionFocus ?? focus;
  const lastPose = useRef<{
    camera: typeof camera;
    token: number;
    focus: FocusCommand | null;
  } | null>(null);
  useEffect(() => {
    if (
      !command &&
      lastPose.current?.camera === camera &&
      lastPose.current.token === token
    )
      return;
    lastPose.current = { camera, token, focus };
    const top = view === "top";
    const center = command
      ? (sampleDisplayedPosition(
          command.point,
          grid,
          detail,
          datum,
          scale,
          20,
        ) ?? toScene(command.point, 36, grid))
      : [0, top ? 0 : 36, 0];
    const pose = command
      ? top
        ? { x: center[0], y: 3700, z: center[2] + 0.01 }
        : selectionFocus
          ? { x: center[0] + 140, y: center[1] + 240, z: center[2] + 180 }
          : { x: center[0] + 380, y: center[1] + 474, z: center[2] + 430 }
      : top
        ? { x: 0, y: 3700, z: 0.01 }
        : { x: 2000, y: 1650, z: 2250 };
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 0.55;
    const redraw = () => {
      camera.updateProjectionMatrix();
      controls.current?.update();
      invalidate();
    };
    const position = gsap.to(camera.position, {
      ...pose,
      duration,
      ease: "power3.out",
      onUpdate: redraw,
    });
    const zoom = gsap.to(camera, {
      zoom: command && top ? (selectionFocus ? 9 : 4.8) : 1,
      duration,
      onUpdate: redraw,
    });
    if (controls.current) controls.current.target.copy(new Vector3(...center));
    redraw();
    return () => {
      position.kill();
      zoom.kill();
    };
  }, [
    view,
    token,
    camera,
    invalidate,
    focus,
    selectionFocus,
    command,
    grid,
    detail,
    datum,
    scale,
  ]);
  useFrame(() => {
    if (!followPoint || !controls.current) return;
    const desired = sampleDisplayedPosition(
      followPoint,
      grid,
      detail,
      datum,
      scale,
      20,
    );
    if (!desired) return;
    const delta = new Vector3(
      desired[0] - controls.current.target.x,
      desired[1] - controls.current.target.y,
      desired[2] - controls.current.target.z,
    );
    if (delta.lengthSq() < 0.0001) return;
    camera.position.add(delta);
    controls.current.target.add(delta);
    controls.current.update();
    invalidate();
  });
  return (
    <OrbitControls
      key={view}
      camera={camera}
      ref={controls}
      makeDefault
      enableDamping={false}
      enableRotate={view !== "top"}
      mouseButtons={
        view === "top"
          ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
          : undefined
      }
      screenSpacePanning
      touches={
        view === "top" ? { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } : undefined
      }
      minZoom={0.55}
      maxZoom={12}
      minDistance={300}
      maxDistance={7500}
      maxPolarAngle={Math.PI / 2.08}
      onChange={() => {
        if (settled.current) clearTimeout(settled.current);
        settled.current = setTimeout(() => {
          const target = controls.current?.target;
          if (!target) return;
          const viewSpan =
            camera instanceof OrthographicCamera
              ? (camera.top - camera.bottom) / camera.zoom
              : 2 *
                camera.position.distanceTo(target) *
                Math.tan((camera.fov * Math.PI) / 360);
          onNavigate(fromScene(target.x, target.z, grid), viewSpan);
        }, 180);
      }}
      onStart={() => {
        onManual();
        gsap.killTweensOf(camera.position);
        gsap.killTweensOf(camera);
      }}
    />
  );
}
