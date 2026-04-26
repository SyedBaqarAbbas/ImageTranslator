from __future__ import annotations

from fastapi import Depends, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    user_id = decode_access_token(token)
    if user_id is None:
        raise AppError("not_authenticated", "Invalid or expired token.", status.HTTP_401_UNAUTHORIZED)
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise AppError("not_authenticated", "Invalid or inactive user.", status.HTTP_401_UNAUTHORIZED)
    return user

