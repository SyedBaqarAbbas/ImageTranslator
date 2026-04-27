from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from fastapi import Depends, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import decode_access_token, hash_password
from app.db.session import get_session
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")
TokenDependency = Annotated[str, Depends(oauth2_scheme)]
SessionDependency = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    token: TokenDependency,
    session: SessionDependency,
) -> User:
    user_id = decode_access_token(token)
    if user_id is None:
        raise AppError(
            "not_authenticated",
            "Invalid or expired token.",
            status.HTTP_401_UNAUTHORIZED,
        )
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise AppError(
            "not_authenticated",
            "Invalid or inactive user.",
            status.HTTP_401_UNAUTHORIZED,
        )
    return user


async def get_public_user(session: SessionDependency) -> User:
    public_email = settings.public_user_email.lower()
    user = await session.scalar(select(User).where(User.email == public_email))
    if user is not None:
        return user

    user = User(
        email=public_email,
        password_hash=hash_password(str(uuid4())),
        display_name=settings.public_user_display_name,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        user = await session.scalar(select(User).where(User.email == public_email))
        if user is None:
            raise
        return user

    await session.refresh(user)
    return user
