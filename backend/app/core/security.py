import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from cryptography.fernet import Fernet
from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def _get_fernet() -> Fernet:
    # Ensure key is valid 32 url-safe base64 bytes
    raw_key = settings.ENCRYPTION_KEY.encode()
    padded_key = base64.urlsafe_b64encode(hashlib.sha256(raw_key).digest())
    return Fernet(padded_key)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None

def encrypt_secret(plain_text: str) -> str:
    if not plain_text:
        return ""
    fernet = _get_fernet()
    encrypted = fernet.encrypt(plain_text.encode())
    return encrypted.decode()

def decrypt_secret(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        fernet = _get_fernet()
        decrypted = fernet.decrypt(cipher_text.encode())
        return decrypted.decode()
    except Exception:
        return cipher_text

def mask_secret(secret_val: str) -> str:
    """Masks secrets for safe display in UI/logs without leakage"""
    if not secret_val or len(secret_val) < 6:
        return "******"
    if secret_val.startswith("sk-"):
        prefix = secret_val[:5]
        suffix = secret_val[-4:]
        return f"{prefix}{'*' * max(6, len(secret_val) - 9)}{suffix}"
    return f"{secret_val[:2]}{'*' * max(6, len(secret_val) - 4)}{secret_val[-2:]}"
