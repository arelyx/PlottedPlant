def mask_email(email: str) -> str:
    """Partially mask an email so responses can disambiguate a user
    without exposing full addresses for bulk harvesting."""
    local, sep, domain = email.partition("@")
    if not sep:
        return "***"
    masked_local = (local[0] + "***") if local else "***"
    return f"{masked_local}@{domain}"
