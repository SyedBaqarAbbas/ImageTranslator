from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.models import User

SessionDependency = Annotated[AsyncSession, Depends(get_session)]
# Kept only to satisfy the legacy users.password_hash column; no login flow reads it.
PUBLIC_USER_PASSWORD_PLACEHOLDER = "public-workspace-no-login"


async def get_public_user(session: SessionDependency) -> User:
    public_email = settings.public_user_email.lower()
    user = await session.scalar(select(User).where(User.email == public_email))
    if user is not None:
        return user

    user = User(
        email=public_email,
        password_hash=PUBLIC_USER_PASSWORD_PLACEHOLDER,
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
