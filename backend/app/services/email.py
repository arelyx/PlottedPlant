import logging

import resend

from app.config import settings

logger = logging.getLogger(__name__)


def _send_email(to: str, subject: str, html: str) -> None:
    """Send an email via Resend. Logs and swallows errors so callers aren't blocked."""
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not set — skipping email to %s: %s", to, subject)
        return

    resend.api_key = settings.resend_api_key

    try:
        resend.Emails.send({
            "from": settings.email_from,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        logger.info("Email sent to %s: %s", to, subject)
    except Exception:
        logger.exception("Failed to send email to %s: %s", to, subject)


def send_verification_email(to: str, username: str, token: str) -> None:
    """Send an email verification link to a newly registered user."""
    verify_url = f"{settings.public_url}/verify-email?token={token}"
    html = f"""\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 0;">
  <div style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="padding:32px 40px 24px;text-align:center;background-color:#16a34a;">
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">PlottedPlant</h1>
    </div>
    <div style="padding:32px 40px;">
      <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;">Verify your email address</h2>
      <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Hi {username},<br><br>
        Thanks for signing up for PlottedPlant! Please verify your email address by clicking the button below.
      </p>
      <div style="text-align:center;padding:8px 0 24px;">
        <a href="{verify_url}" style="display:inline-block;padding:12px 32px;background-color:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">Verify Email</a>
      </div>
      <p style="margin:0 0 8px;color:#71717a;font-size:13px;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;color:#16a34a;font-size:13px;word-break:break-all;">{verify_url}</p>
      <p style="margin:0;color:#a1a1aa;font-size:12px;">
        This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
      </p>
    </div>
  </div>
</div>"""
    _send_email(to, "Verify your email — PlottedPlant", html)


def send_password_reset_email(to: str, username: str, token: str) -> None:
    """Send a password reset link."""
    reset_url = f"{settings.public_url}/reset-password?token={token}"
    html = f"""\
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 0;">
  <div style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="padding:32px 40px 24px;text-align:center;background-color:#16a34a;">
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">PlottedPlant</h1>
    </div>
    <div style="padding:32px 40px;">
      <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;">Reset your password</h2>
      <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Hi {username},<br><br>
        We received a request to reset the password for your PlottedPlant account. Click the button below to choose a new password.
      </p>
      <div style="text-align:center;padding:8px 0 24px;">
        <a href="{reset_url}" style="display:inline-block;padding:12px 32px;background-color:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">Reset Password</a>
      </div>
      <p style="margin:0 0 8px;color:#71717a;font-size:13px;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;color:#16a34a;font-size:13px;word-break:break-all;">{reset_url}</p>
      <p style="margin:0;color:#a1a1aa;font-size:12px;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
  </div>
</div>"""
    _send_email(to, "Reset your password — PlottedPlant", html)
