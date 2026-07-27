import { useEffect } from "react";

const DEFAULT_TITLE = "PlottedPlant: A Free PlantUML Editor";

/**
 * Sets document.title for the lifetime of the calling page and restores
 * the default site title on unmount. Pass undefined to leave the title
 * unchanged until a value is available (e.g. while a document loads).
 */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    if (title) {
      document.title = `${title} – PlottedPlant`;
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
