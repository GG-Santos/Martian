import { useEffect, type RefObject } from "react";
import gsap from "gsap";
export function useConsoleMotion(
  ref: RefObject<HTMLElement | null>,
  key: string,
) {
  useEffect(() => {
    if (!ref.current) return;
    const context = gsap.context(() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        gsap.fromTo(
          ref.current,
          { opacity: 0.65, y: 6 },
          { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" },
        );
    }, ref);
    return () => context.revert();
  }, [ref, key]);
}
