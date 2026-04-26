from __future__ import annotations

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas.auth import TokenResponse, UserCreate


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def register(self, payload: UserCreate) -> TokenResponse:
        existing = await self.session.scalar(select(User).where(User.email == payload.email.lower()))
        if existing:
            raise AppError("email_taken", "An account with this email already exists.", status.HTTP_409_CONFLICT)

        user = User(
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            display_name=payload.display_name,
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return TokenResponse(access_token=create_access_token(user.id), user=user)

    async def login(self, email: str, password: str) -> TokenResponse:
        user = await self.session.scalar(select(User).where(User.email == email.lower()))
        if not user or not verify_password(password, user.password_hash):
            raise AppError("invalid_credentials", "Invalid email or password.", status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            raise AppError("user_disabled", "This account is disabled.", status.HTTP_403_FORBIDDEN)
        return TokenResponse(access_token=create_access_token(user.id), user=user)

