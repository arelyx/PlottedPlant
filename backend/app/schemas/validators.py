"""Shared pydantic validation helpers.

Reused across request schemas whose fields end up bound as Postgres `text`
values — Postgres text columns reject NUL bytes outright
(`CharacterNotInRepertoireError`), which pydantic's `Field(max_length=...)`
does not catch, so it otherwise surfaces as an unhandled 500 at insert time.
"""

from typing import Annotated

from pydantic import AfterValidator


def _reject_nul_bytes(value: str) -> str:
    if "\x00" in value:
        raise ValueError("must not contain NUL characters")
    return value


# Apply in place of `str` on any user-supplied text field that is ultimately
# persisted to a Postgres text/varchar column. Compose with `Field(...)` for
# length/other constraints as usual, e.g.:
#   title: NoNulStr | None = Field(default=None, max_length=255)
NoNulStr = Annotated[str, AfterValidator(_reject_nul_bytes)]
