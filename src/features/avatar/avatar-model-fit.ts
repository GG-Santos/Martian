import type { AvatarConfig } from "./avatar-types";

// Bounds include the approved assembly lift, boots, antenna, and review scale.
// Keep all consumers on the same baseline when switching body shapes.
export const avatarModelFit: Record<AvatarConfig["body"], { scale: number; floor: number; top: number }> = {
  orb: { scale: 0.92, floor: -1.14 * 0.92, top: 0.945 * 0.92 },
  tall: { scale: 1.11, floor: -1.13 * 1.11, top: 1.305 * 1.11 },
  capsule: { scale: 1.11, floor: -1.13 * 1.11, top: 1.305 * 1.11 },
  scout: { scale: 1, floor: -1.14, top: 0.925 * 0.9312 - 0.273984 },
  prism: { scale: 1, floor: -1.175, top: 0.79 },
  comet: { scale: 1, floor: -1.18, top: 0.865 },
  cube: { scale: 1, floor: -1.2, top: 0.825 },
  wide: { scale: 1, floor: -0.77 * 0.995, top: 1.015 },
  pebble: { scale: 1, floor: -0.74 * 0.975, top: 0.985 },
};
