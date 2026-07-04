import DOMPurify from "dompurify";

/**
 * Sanitize server-rendered PlantUML SVG before injecting it into the DOM.
 *
 * The SVG comes from the PlantUML server rendering user-authored source — on
 * shared documents and public links that source belongs to another user, so an
 * unsanitized `dangerouslySetInnerHTML` is a stored-XSS vector (SVG can carry
 * event-handler attributes and `<a href="javascript:...">`). The svg profile
 * keeps diagram markup while stripping scripts and dangerous URIs.
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}
