import os
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
from app.core.logging import logger

def _send_smtp_sync(recipient: str, subject: str, html_content: str, text_content: str):
    """Synchronous worker that performs TLS SMTP authentication and delivery."""
    host = settings.SMTP_HOST or os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(settings.SMTP_PORT or os.getenv("SMTP_PORT", 587))
    user = (settings.SMTP_USER or os.getenv("SMTP_USER", "")).strip()
    password = (settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD", "")).strip().replace(" ", "")
    from_name = settings.SMTP_FROM_NAME or "EVAL AI Security"

    if not user or not password:
        logger.warning(
            f"[SMTP WARNING] SMTP_USER or SMTP_PASSWORD not configured. "
            f"Email to {recipient} was not delivered via Gmail."
        )
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{user}>"
    msg["To"] = recipient

    part_text = MIMEText(text_content, "plain", "utf-8")
    part_html = MIMEText(html_content, "html", "utf-8")
    msg.attach(part_text)
    msg.attach(part_html)

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=12)
        else:
            server = smtplib.SMTP(host, port, timeout=12)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(user, password)
        server.sendmail(user, [recipient], msg.as_string())
        server.quit()
        logger.info(f"[SMTP SUCCESS] Verification email successfully sent to {recipient}")
        return True
    except Exception as e:
        logger.error(f"[SMTP ERROR] Failed to deliver email to {recipient}: {str(e)}")
        raise e

async def send_verification_otp_email(recipient: str, otp_code: str) -> bool:
    """Sends a security verification OTP code to the recipient asynchronously."""
    subject = f"{otp_code} is your EVAL AI verification code"
    
    text_content = f"""
Hello,

Your verification code for EVAL AI is: {otp_code}

This code is valid for 5 minutes. If you did not request this, please disregard this email.

— EVAL AI Enterprise Platform Security Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>EVAL AI Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #060913; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <div style="max-width: 520px; margin: 40px auto; background-color: #0b1120; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
    
    <!-- Top Accent Bar -->
    <div style="height: 4px; background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%);"></div>
    
    <div style="padding: 36px 32px;">
      <!-- Logo / Header -->
      <div style="margin-bottom: 24px; text-align: center;">
        <span style="display: inline-block; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #ffffff;">
          🤖 EVAL <span style="color: #818cf8;">AI</span>
        </span>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em;">
          Enterprise Agent QA Platform
        </div>
      </div>

      <h2 style="font-size: 18px; font-weight: 700; color: #ffffff; text-align: center; margin: 0 0 12px 0;">
        Verify Your Email Address
      </h2>
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 28px 0; line-height: 1.5;">
        Use the single-use verification code below to complete your account registration.
      </p>

      <!-- OTP Code Box -->
      <div style="background-color: #030712; border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #a5b4fc; display: inline-block;">
          {otp_code}
        </span>
        <div style="font-size: 11px; color: #64748b; margin-top: 8px;">
          ⏱️ Valid for 5 minutes
        </div>
      </div>

      <p style="font-size: 11px; color: #64748b; text-align: center; margin: 0; line-height: 1.5;">
        If you did not request this verification code, please ignore this email or contact your platform administrator.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #080d1a; padding: 16px 32px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
      <span style="font-size: 10px; color: #475569;">
        © {2026} EVAL AI Platform. Automated Security System.
      </span>
    </div>
  </div>
</body>
</html>"""

    return await asyncio.to_thread(_send_smtp_sync, recipient, subject, html_content, text_content)
