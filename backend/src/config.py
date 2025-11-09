from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    provider_url: str = "https://base-mainnet.g.alchemy.com/v2/7Hj4KzXldb0-HElc-YmVeVOPLeoSuREb"
    allowed_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://latticefi.vercel.app",
        "https://3fe56a7c50e7.ngrok-free.app",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


