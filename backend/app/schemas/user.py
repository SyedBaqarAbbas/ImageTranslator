from __future__ import annotations

from app.schemas.common import Timestamped


class UserRead(Timestamped):
    id: str
    email: str
    display_name: str | None
    is_active: bool

