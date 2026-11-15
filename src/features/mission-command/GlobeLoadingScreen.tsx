"use client";

import { useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";

function getFlightTransform(path: SVGPathElement, pathLength: number, progress: number) {
  const distance = pathLength * progress;
  const position = path.getPointAtLength(distance);
  const before = path.getPointAtLength(Math.max(0, distance - 2));
  const after = path.getPointAtLength(Math.min(pathLength, distance + 2));
  // Use a centered tangent sample so the heading stays stable at the endpoint.
  const pathAngle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
  const shipAngle = pathAngle + 45;
  return `translate(${position.x} ${position.y}) rotate(${shipAngle}) translate(-28 -28)`;
}

export function GlobeLoadingScreen({ visible, onExitComplete }: { visible: boolean; onExitComplete?: () => void }) {
  const id = useId().replaceAll(":", "");
  const screen = useRef<HTMLDivElement>(null);
  const flightPath = useRef<SVGPathElement>(null);
  const rocket = useRef<SVGGElement>(null);
  const rocketMask = useRef<SVGGElement>(null);
  const fire = useRef<SVGImageElement>(null);
  const fireFlicker = useRef({ scale: 1 });
  const flightProgress = useRef({ value: 0 });
  const flightTween = useRef<gsap.core.Tween | null>(null);
  const arrived = useRef(false);
  const [rendered, setRendered] = useState(true);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!visible || !rendered || reduceMotion !== false || !fire.current) return;
    const updateFire = () => {
      fire.current?.setAttribute(
        "transform",
        `translate(17.2 44) scale(${fireFlicker.current.scale}) translate(-17.2 -44)`,
      );
    };
    const tween = gsap.to(fireFlicker.current, {
      scale: 0.78,
      duration: 0.18,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      onUpdate: updateFire,
    });
    return () => { tween.kill(); };
  }, [visible, rendered, reduceMotion]);

  useEffect(() => {
    if (!visible || !rendered || reduceMotion !== false || arrived.current || !flightPath.current || !rocket.current || !rocketMask.current) return;
    const path = flightPath.current;
    const pathLength = path.getTotalLength();
    const placeRocket = () => {
      const transform = getFlightTransform(path, pathLength, flightProgress.current.value);
      rocket.current?.setAttribute("transform", transform);
      rocketMask.current?.setAttribute("transform", transform);
    };
    placeRocket();
    flightTween.current = gsap.to(flightProgress.current, {
      value: 1,
      duration: 2.5,
      ease: "power3.inOut",
      onUpdate: placeRocket,
      onComplete: () => { arrived.current = true; flightTween.current = null; },
    });
    return () => { flightTween.current?.kill(); flightTween.current = null; };
  }, [visible, rendered, reduceMotion]);

  useEffect(() => {
    if (!rendered || !screen.current || reduceMotion === null) return;
    const element = screen.current;
    const fadeOut = () => gsap.to(element, {
      autoAlpha: 0,
      duration: reduceMotion ? 0 : 0.55,
      ease: "power3.out",
      onComplete: () => { setRendered(false); onExitComplete?.(); },
    });

    if (visible) {
      gsap.to(element, { autoAlpha: 1, duration: reduceMotion ? 0 : 0.3, ease: "power3.out" });
      return () => { gsap.killTweensOf(element); };
    }

    if (reduceMotion || arrived.current || !flightPath.current || !rocket.current || !rocketMask.current) {
      fadeOut();
      return () => { gsap.killTweensOf(element); };
    }

    flightTween.current?.kill();
    const path = flightPath.current;
    const pathLength = path.getTotalLength();
    const placeRocket = () => {
      const transform = getFlightTransform(path, pathLength, flightProgress.current.value);
      rocket.current?.setAttribute("transform", transform);
      rocketMask.current?.setAttribute("transform", transform);
    };
    flightTween.current = gsap.to(flightProgress.current, {
      value: 1,
      duration: Math.max(0.45, 2.5 * (1 - flightProgress.current.value)),
      ease: "power3.inOut",
      onUpdate: placeRocket,
      onComplete: () => {
        arrived.current = true;
        flightTween.current = null;
        fadeOut();
      },
    });
    return () => { gsap.killTweensOf(element); flightTween.current?.kill(); };
  }, [visible, rendered, reduceMotion, onExitComplete]);

  if (!rendered) return null;

  return <div
    ref={screen}
    className={`globe-loading-screen${visible ? "" : " is-leaving"}`}
    role="status"
    aria-live="polite"
  >
    <svg className="globe-loading-art" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="globe-loading-stars" fill="#f3f1ed" fillOpacity="0.7">
        <circle cx="180" cy="230" r="2" /><circle cx="330" cy="170" r="1.5" />
        <circle cx="570" cy="210" r="1.5" /><circle cx="1020" cy="180" r="2" />
        <circle cx="1080" cy="540" r="1.4" /><circle cx="200" cy="590" r="1.5" />
      </g>

      <defs>
        <mask id={`${id}-rocket-mask`} x="0" y="0" width="1200" height="800" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
          <rect width="1200" height="800" fill="white" />
          <g ref={rocketMask} transform="translate(392 372)">
            <image href="/images/loading/spaceship.svg" x="0" y="0" width="56" height="56" style={{ filter: "brightness(0)" }} />
            <image href="/images/loading/spaceship-fire.svg" x="0" y="37.5" width="19.7" height="18.5" style={{ filter: "brightness(0)" }} />
          </g>
        </mask>
      </defs>

      <path ref={flightPath} d="M420 400C510 314 654 328 744 400" fill="none" stroke="#f3f1ed" strokeOpacity="0.54" strokeDasharray="4 10" strokeWidth="2" mask={`url(#${id}-rocket-mask)`} />

      <image href="/images/loading/space-station.svg" x="724" y="344" width="112" height="112" />
      <g ref={rocket} className="globe-loading-rocket" transform={reduceMotion ? "translate(752 372)" : "translate(392 372)"} aria-hidden="true">
        <image href="/images/loading/spaceship.svg" x="0" y="0" width="56" height="56" />
        <image ref={fire} href="/images/loading/spaceship-fire.svg" x="0" y="37.5" width="19.7" height="18.5" />
      </g>

      <image href="/images/loading/earth.svg" x="364" y="344" width="112" height="112" />
    </svg>

  </div>;
}
