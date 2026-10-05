import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sanitizeSvg } from "@/lib/sanitize";
import { useIsMobile } from "@/hooks/useMediaQuery";

interface PreviewError {
  message: string;
  line?: number | null;
}

interface DiagramPreviewProps {
  /** Rendered SVG markup (unsanitized), or null when there is none yet. */
  svg: string | null;
  /** Current render error. With an `svg` it shows as a banner over the dimmed diagram. */
  error?: PreviewError | null;
  rendering: boolean;
  /** Shown when there is neither a diagram nor an error. */
  placeholder: string;
}

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;

/**
 * Diagram preview with zoom controls. "Fit" scales the diagram down to the
 * pane's width (never up), and is the default on small screens where most
 * diagrams are wider than the viewport.
 */
export function DiagramPreview({ svg, error, rendering, placeholder }: DiagramPreviewProps) {
  const isMobile = useIsMobile();
  const [zoom, setZoom] = useState<number | "fit">(() => (isMobile ? "fit" : 100));
  const [fitScale, setFitScale] = useState(1);
  // Unscaled size of the diagram, so the scroll area can match the scaled size.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  const scale = zoom === "fit" ? fitScale : zoom / 100;
  const percent = Math.round(scale * 100);
  const step = (delta: number) =>
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent / 25) * 25 + delta)));

  // Track the diagram's natural size and the fit scale as the pane resizes or
  // a new diagram arrives. offsetWidth/Height ignore the scale transform.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const diagram = diagramRef.current;
    if (!viewport || !diagram) return;
    const measure = () => {
      const width = diagram.offsetWidth;
      const height = diagram.offsetHeight;
      setNatural(width && height ? { width, height } : null);
      const available = viewport.clientWidth - 32; // p-4 on both sides
      if (width > 0 && available > 0) setFitScale(Math.min(1, available / width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(diagram);
    return () => observer.disconnect();
  }, [svg, error]);

  // Crossing the breakpoint (rotating a tablet) switches to that size's default.
  useEffect(() => setZoom(isMobile ? "fit" : 100), [isMobile]);

  const button = "min-w-8 h-8 md:h-auto md:min-w-0 px-2 py-0.5 rounded hover:bg-accent";

  return (
    <div className="h-full flex flex-col bg-muted/30">
      <div className="flex items-center gap-1 px-2 py-1 border-b text-xs">
        <button className={button} onClick={() => step(25)} aria-label="Zoom in">
          +
        </button>
        <span className="min-w-[3rem] text-center tabular-nums">{percent}%</span>
        <button className={button} onClick={() => step(-25)} aria-label="Zoom out">
          -
        </button>
        <button
          className={`${button} ml-1 ${zoom === "fit" ? "bg-accent" : ""}`}
          onClick={() => setZoom("fit")}
          title="Fit the diagram to the width of the pane"
        >
          Fit
        </button>
        <button className={button} onClick={() => setZoom(100)}>
          100%
        </button>
        {rendering && <span className="ml-auto text-muted-foreground">Rendering...</span>}
      </div>

      <div ref={viewportRef} className="flex-1 overflow-auto p-4 overscroll-contain">
        {error && !svg ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="text-sm font-medium text-destructive mb-1">{error.message}</p>
              {error.line && <p className="text-xs">Error on line {error.line}</p>}
            </div>
          </div>
        ) : (
          <div className="relative min-h-full">
            {error && svg && (
              <div className="absolute top-2 left-2 right-2 z-10 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 text-xs">
                <span className="text-destructive font-medium">{error.message}</span>
                {error.line && <span className="text-muted-foreground ml-2">Line {error.line}</span>}
              </div>
            )}
            <div
              className="overflow-hidden"
              style={natural ? { width: natural.width * scale, height: natural.height * scale } : undefined}
            >
              <div
                ref={diagramRef}
                className={`inline-block transition-opacity ${error ? "opacity-40" : ""}`}
                style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg || "") }}
              />
            </div>
            {!svg && !rendering && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {placeholder}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
