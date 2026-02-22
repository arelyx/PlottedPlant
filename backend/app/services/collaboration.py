"""Client for calling the Hocuspocus internal command endpoints."""

import httpx
from app.config import settings


async def notify_force_content(
    document_id: int,
    content: str,
    restored_by: str,
    version_number: int,
) -> bool:
    """Notify Hocuspocus to replace Y.Doc content after a version restore.

    Returns True if the document was active and content was updated.
    Non-critical — failure is logged but doesn't block the restore.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{settings.collaboration_server_url}/internal/documents/{document_id}/force-content",
                json={
                    "content": content,
                    "restored_by": restored_by,
                    "version_number": version_number,
                },
                headers={"X-Internal-Secret": settings.internal_secret},
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("active", False)
    except Exception:
        pass
    return False


async def notify_close_room(document_id: int) -> bool:
    """Notify Hocuspocus to close all connections for a deleted document.

    Returns True if the room was active and connections were closed.
    Non-critical — failure is logged but doesn't block the delete.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{settings.collaboration_server_url}/internal/documents/{document_id}/close-room",
                json={},
                headers={"X-Internal-Secret": settings.internal_secret},
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("active", False)
    except Exception:
        pass
    return False
