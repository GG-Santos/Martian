import { avatarEyes, avatarMouths, type AvatarConfig, type AvatarEyes, type AvatarMouth, type LegacyAvatarFace } from "./avatar-types.ts";

export const legacyFaceFeatures: Record<LegacyAvatarFace, { eyes: AvatarEyes; mouth: AvatarMouth }> = {
  neutral: { eyes: "round", mouth: "smile" },
  attentive: { eyes: "round", mouth: "smile" },
  surprised: { eyes: "round", mouth: "open" },
  excited: { eyes: "arched", mouth: "laugh" },
  happy: { eyes: "drooping", mouth: "smile" },
  laughing: { eyes: "drooping", mouth: "laugh" },
  angry: { eyes: "angry", mouth: "frown" },
  sad: { eyes: "drooping", mouth: "frown" },
  scared: { eyes: "round", mouth: "open" },
  suspicious: { eyes: "drooping", mouth: "three" },
  confused: { eyes: "round", mouth: "three" },
  curious: { eyes: "round", mouth: "tongue" },
  proud: { eyes: "arched", mouth: "smile" },
  shy: { eyes: "drooping", mouth: "smile" },
  unimpressed: { eyes: "drooping", mouth: "wavy" },
  sleepy: { eyes: "drooping", mouth: "smile" },
  round: { eyes: "round", mouth: "smile" },
  bar: { eyes: "round", mouth: "smile" },
  wink: { eyes: "round", mouth: "tongue" },
};

const legacyEyes: Partial<Record<AvatarEyes, AvatarEyes>> = {
  soft: "drooping", bar: "round", closed: "drooping", squint: "angry", wide: "round",
  angled: "angry", side: "drooping", wink: "round", sleepy: "drooping",
};
const legacyMouths: Partial<Record<AvatarMouth, AvatarMouth>> = { neutral: "smile", flat: "wavy", grin: "laugh" };

export function avatarFeatures(avatar: AvatarConfig): { eyes: AvatarEyes; mouth: AvatarMouth } {
  const legacy = avatar.face ? legacyFaceFeatures[avatar.face] : undefined;
  return {
    eyes: avatar.eyes ? (avatarEyes.includes(avatar.eyes) ? avatar.eyes : legacyEyes[avatar.eyes] ?? "round") : legacy?.eyes ?? "round",
    mouth: avatar.mouth ? (avatarMouths.includes(avatar.mouth) ? avatar.mouth : legacyMouths[avatar.mouth] ?? "smile") : legacy?.mouth ?? "smile",
  };
}
