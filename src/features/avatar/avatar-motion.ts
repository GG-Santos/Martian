/** Pure motion sample so preview reactions do not depend on frame rate. */
export function sampleAvatarMotion(elapsed: number, changedAt: number, reducedMotion: boolean) {
  if (reducedMotion) return { hop: 0, turn: 0, armLift: 0, breath: 1, blink: 1 };

  const phase = elapsed - changedAt;
  const reaction = phase > 0 && phase < 1 ? Math.sin(Math.PI * phase) : 0;
  const blinkPulse = Math.max(0, 1 - Math.abs((elapsed % 4.8) - 4.3) * 14);
  return {
    hop: reaction * 0.17,
    turn: reaction * 0.23,
    armLift: reaction * 0.82,
    breath: 1 + Math.sin(elapsed * 1.8) * 0.012 + reaction * 0.045,
    blink: 1 - blinkPulse * 0.9,
  };
}
