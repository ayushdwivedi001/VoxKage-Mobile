import os
import random
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

# --- Security Variables ---
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "voxkage-mobile-super-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # Tokens valid for 1 week
OTP_EXPIRE_MINUTES = 5                      # OTP valid for 5 minutes

security_scheme = HTTPBearer()

# --- Memory Cache for OTPs ---
# Format: { email: { "otp": "123456", "expires_at": 1718612345 } }
OTP_STORE = {}

# --- Helper Models ---
class OTPRequest(BaseModel):
    email: EmailStr
    master_key: str | None = None  # Required only for signups/registration

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

# --- OTP Generation & Delivery ---
def send_otp_via_email(email: str, otp: str) -> bool:
    sender_email = os.getenv("SENDER_EMAIL")
    sender_password = os.getenv("SENDER_PASSWORD")
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    if not sender_email or not sender_password:
        print(f"⚠️ SMTP configuration missing. SIMULATING OTP in console:")
        print(f"==================================================")
        print(f"🔑 OTP FOR USER {email}: {otp}")
        print(f"==================================================")
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = sender_email
        msg["To"] = email
        msg["Subject"] = "VoxKage Mobile — Your Security OTP Code"

        body = f"""
        <html>
            <body style="font-family: sans-serif; background-color: #faf9f5; padding: 20px; color: #141413;">
                <h2 style="color: #cc785c;">VoxKage Mobile</h2>
                <p>Hello Sir,</p>
                <p>Your one-time authorization code is below:</p>
                <div style="background-color: #efe9de; padding: 15px; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 20px 0;">
                    {otp}
                </div>
                <p style="font-size: 13px; color: #6c6a64;">This OTP is valid for the next {OTP_EXPIRE_MINUTES} minutes. If you did not request this, please ignore this email.</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(body, "html"))

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"❌ Failed to send SMTP mail: {e}")
        print(f"🔑 Fallback console log for OTP: {otp}")
        return False

def generate_and_save_otp(email: str, is_signup: bool = False, master_key: str = None) -> str:
    # If signing up, we MUST validate the master key
    if is_signup:
        expected_master = os.getenv("VOXKAGE_MASTER_KEY")
        if not expected_master:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Master Key configuration missing on backend."
            )
        if master_key != expected_master:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Master Key verification failed."
            )

    otp = f"{random.randint(100000, 999999)}"
    expires_at = time.time() + (OTP_EXPIRE_MINUTES * 60)
    OTP_STORE[email] = {"otp": otp, "expires_at": expires_at}

    # Dispatch delivery
    send_otp_via_email(email, otp)
    return otp

def verify_otp_code(email: str, entered_otp: str) -> bool:
    record = OTP_STORE.get(email)
    if not record:
        return False

    if time.time() > record["expires_at"]:
        del OTP_STORE[email]
        return False

    if record["otp"] == entered_otp:
        del OTP_STORE[email]
        return True

    return False

# --- JWT Core ---
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> str:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        return email
    except JWTError:
        raise credentials_exception
