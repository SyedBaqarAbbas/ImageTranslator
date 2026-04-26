from __future__ import annotations

import asyncio

from app.core.config import settings
from app.storage.base import StoredObject


class S3Storage:
    backend_name = "s3"

    def __init__(self) -> None:
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError(
                "S3 storage requires installing the backend with the `s3` extra."
            ) from exc

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
        )

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> StoredObject:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return StoredObject(
            key=key,
            bucket=self.bucket,
            storage_backend=self.backend_name,
            size_bytes=len(data),
            content_type=content_type,
        )

    async def get_bytes(self, key: str, bucket: str | None = None) -> bytes:
        response = await asyncio.to_thread(
            self.client.get_object,
            Bucket=bucket or self.bucket,
            Key=key,
        )
        return await asyncio.to_thread(response["Body"].read)

    async def delete(self, key: str, bucket: str | None = None) -> None:
        await asyncio.to_thread(
            self.client.delete_object,
            Bucket=bucket or self.bucket,
            Key=key,
        )

    async def exists(self, key: str, bucket: str | None = None) -> bool:
        try:
            await asyncio.to_thread(self.client.head_object, Bucket=bucket or self.bucket, Key=key)
            return True
        except Exception:
            return False

    async def presigned_url(self, key: str, bucket: str | None = None, expires_in: int = 900) -> str:
        return await asyncio.to_thread(
            self.client.generate_presigned_url,
            "get_object",
            Params={"Bucket": bucket or self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )
