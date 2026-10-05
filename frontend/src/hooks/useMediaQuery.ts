import { useEffect, useState } from "react";

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Below Tailwind's `md` breakpoint: phones, and tablets in portrait. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
