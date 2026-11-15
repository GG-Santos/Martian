export type AvatarEyes = "round" | "crossed" | "drooping" | "arched" | "angry" | "soft" | "bar" | "closed" | "squint" | "wide" | "angled" | "side" | "wink" | "sleepy" | "heart";
export type AvatarMouth = "cross" | "tongue" | "wavy" | "fangs" | "smile" | "frown" | "grin" | "scowl" | "open" | "dome" | "zigzag" | "kiss" | "three" | "laugh" | "teeth" | "doubleTongue" | "neutral" | "flat";
export type LegacyAvatarFace = "neutral" | "attentive" | "surprised" | "excited" | "happy" | "laughing" | "angry" | "sad" | "scared" | "suspicious" | "confused" | "curious" | "proud" | "shy" | "unimpressed" | "sleepy" | "round" | "bar" | "wink";

export type AvatarConfig = {
  shell: "chalk" | "mint" | "coral" | "violet" | "copper" | "sky" | "moss" | "slate" | "amber" | "ruby" | "teal" | "indigo";
  body: "orb" | "tall" | "wide" | "scout" | "capsule" | "pebble" | "prism" | "comet" | "cube";
  eyes?: AvatarEyes;
  mouth?: AvatarMouth;
  /** Older saved rooms used a preset face; kept so those snapshots remain readable. */
  face?: LegacyAvatarFace;
};

export const defaultAvatar: AvatarConfig = { shell: "chalk", body: "orb", eyes: "round", mouth: "smile" };

export const avatarShells: AvatarConfig["shell"][] = ["chalk", "mint", "coral", "violet", "copper", "sky", "moss", "slate", "amber", "ruby", "teal", "indigo"];
export const avatarBodies: AvatarConfig["body"][] = ["orb", "tall", "scout", "prism", "comet", "cube"];
export const legacyAvatarBodies: AvatarConfig["body"][] = ["capsule", "wide", "pebble"];
export const avatarEyes: AvatarEyes[] = ["round", "crossed", "drooping", "arched", "angry", "heart"];
export const avatarMouths: AvatarMouth[] = ["cross", "tongue", "wavy", "fangs", "smile", "frown", "grin", "scowl", "open", "dome", "zigzag", "kiss", "laugh", "teeth"];
export const legacyAvatarEyes: AvatarEyes[] = ["soft", "bar", "closed", "squint", "wide", "angled", "side", "wink", "sleepy"];
export const legacyAvatarMouths: AvatarMouth[] = ["neutral", "flat", "doubleTongue", "three"];
export const avatarFaces: LegacyAvatarFace[] = ["neutral", "attentive", "surprised", "excited", "happy", "laughing", "angry", "sad", "scared", "suspicious", "confused", "curious", "proud", "shy", "unimpressed", "sleepy"];
export const legacyAvatarFaces: LegacyAvatarFace[] = ["round", "bar", "wink"];
