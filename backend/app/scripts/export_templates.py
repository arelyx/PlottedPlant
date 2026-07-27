"""Export the seed template data as JSON for the frontend build.

The frontend uses this data at build time to prerender per-template SEO
pages (/templates/<slug>) and generate sitemap.xml, and at runtime for
the template detail route. Re-run whenever seed_templates.py changes:

    docker compose exec -T backend python -m app.scripts.export_templates \
        > frontend/src/data/templates.json
"""

import json
import re
import sys

from app.scripts.seed_templates import TEMPLATES


def slugify(name: str) -> str:
    """Kebab-case slug; must match templateSlug() in frontend/src/lib/templates.ts."""
    slug = name.lower()
    slug = re.sub(r"[()]", "", slug)
    slug = re.sub(r"[/\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.rstrip("-")


def main() -> None:
    out = [
        {
            "slug": slugify(t["name"]),
            "name": t["name"],
            "description": t["description"],
            "diagram_type": t["diagram_type"],
            "sort_order": t["sort_order"],
            "content": t["content"],
        }
        for t in TEMPLATES
    ]
    slugs = [t["slug"] for t in out]
    if len(slugs) != len(set(slugs)):
        sys.exit("Duplicate template slugs generated")
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
