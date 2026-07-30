from pydantic import BaseModel, ConfigDict
from datetime import date as dt_date, datetime as dt_datetime
from typing import List, Optional
from .base import UTCBaseModel

class UserMinimal(UTCBaseModel):
    id: int
    full_name: str
    user_code: Optional[str] = None

class TokenDetailCreate(BaseModel):
    token_count: int
    date: Optional[dt_date] = None
    folder_path: Optional[str] = None

class TokenDetailResponse(UTCBaseModel):
    id: int
    generation_id: int
    financial_year_id: Optional[int] = None
    receipt_prefix: Optional[str] = None
    receipt_number: int
    receipt_display_number: Optional[str] = None
    token_count: int
    created_at: dt_datetime
    creator: Optional[UserMinimal] = None

class TokenGenerationCreate(BaseModel):
    date: dt_date
    total_tokens: int

class TokenGenerationResponse(UTCBaseModel):
    id: int
    date: dt_date
    total_tokens: int
    created_at: dt_datetime
    details: Optional[List[TokenDetailResponse]] = []
    creator: Optional[UserMinimal] = None

class TokenDetailPaginatedResponse(BaseModel):
    items: List[TokenDetailResponse]
    total: int
    total_tokens: int
    page: int
    page_size: int
    total_pages: int

class TokenGenerationPaginatedResponse(BaseModel):
    items: List[TokenGenerationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    grand_total_tokens: int
