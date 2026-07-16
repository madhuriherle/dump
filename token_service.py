from datetime import datetime, timezone, date, timedelta
import math
import re
from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload
from app.db.models import TokenGeneration, TokenDetail, User, FinancialYear, SystemSettings
from app.schemas.token import TokenDetailCreate
from app.services.receipt_sequence_service import TOKEN_RECEIPT_PREFIX, _format_receipt, _get_financial_year_for_date, _get_settings

def _ensure_token_partition_for_timestamp(db: Session, ts: datetime) -> None:
    year = ts.year
    month = ts.month
    partition_name = f"token_details_{year}_{month:02d}"
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"

    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {partition_name}
            PARTITION OF token_details
            FOR VALUES FROM ('{start_date}') TO ('{end_date}');
            """
        )
    )

def create_tokens(payload: TokenDetailCreate, db: Session, current_user: User):
    # Use server's local time for business logic consistency
    now_local = datetime.now()
    now_utc = datetime.now(timezone.utc)
    target_date = payload.date or now_local.date()
    
    # Ensure partition exists for the target date's month
    partition_dt = datetime.combine(target_date, datetime.min.time())
    _ensure_token_partition_for_timestamp(db, partition_dt)

    # 1. Get or Create TokenGeneration with a Row Lock
    # Using with_for_update() ensures that concurrent requests for the same date 
    # are queued, preventing race conditions on receipt_number and total_tokens.
    generation = db.query(TokenGeneration).filter(
        TokenGeneration.date == target_date
    ).with_for_update().first()
    
    if not generation:
        generation = TokenGeneration(
            date=target_date,
            total_tokens=0,
            created_at=now_utc,
            updated_at=now_utc,
            created_by=current_user.id,
            updated_by=current_user.id
        )
        db.add(generation)
        db.flush()
        # Re-lock if newly created (PostgreSQL behavior check)
        generation = db.query(TokenGeneration).filter(
            TokenGeneration.id == generation.id
        ).with_for_update().first()

    # Individual entries may be negative (corrections/deductions), but the
    # running total for the day must never go below zero - you can't deduct
    # tokens that were never added.
    if generation.total_tokens + payload.token_count < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot deduct {abs(payload.token_count)} tokens - only {generation.total_tokens} available for {target_date}."
        )

    # 2. Calculate Manual ID for Partitioned Table (Global Max)
    max_id = db.query(func.max(TokenDetail.id)).scalar() or 0
    next_id = max_id + 1

    # 3. Calculate Receipt Number (under row lock, atomic)
    settings = _get_settings(db)
    financial_year = _get_financial_year_for_date(db, target_date)
    generation.last_receipt_number += 1
    next_receipt = generation.last_receipt_number
    receipt_display_number = _format_receipt(TOKEN_RECEIPT_PREFIX, next_receipt, settings.receipt_padding, financial_year.name)

    # 4. Save Token Detail
    new_detail = TokenDetail(
        id=next_id,
        generation_id=generation.id,
        financial_year_id=financial_year.id,
        receipt_prefix=TOKEN_RECEIPT_PREFIX,
        receipt_number=next_receipt,
        receipt_display_number=receipt_display_number,
        token_count=payload.token_count,
        created_at=now_utc,
        updated_at=now_utc,
        created_by=current_user.id,
        updated_by=current_user.id
    )
    db.add(new_detail)

    # 5. Update Generation Total
    generation.total_tokens += payload.token_count
    generation.updated_at = now_utc
    generation.updated_by = current_user.id
    
    try:
        db.commit()
        db.refresh(new_detail)
        
        # Write to txt file if a folder path is set in settings or payload
        folder_to_use = getattr(settings, 'token_file_path', None)
        if not folder_to_use and hasattr(payload, 'folder_path') and getattr(payload, 'folder_path'):
            folder_to_use = payload.folder_path
            
        # Default to the backend folder if nothing is configured
        if not folder_to_use:
            import os
            folder_to_use = os.getcwd()
            
        if folder_to_use:
            try:
                import os
                file_path = os.path.join(folder_to_use, "mpd.txt")
                with open(file_path, "w") as file:
                    file.write(str(generation.total_tokens))
            except Exception as e:
                print(f"Warning: Could not write mpd.txt: {e}")

        return new_detail
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to issue token: {str(e)}")


def _parse_generation_query_dates(q: str | None) -> tuple[date | None, date | None]:
    if not q:
        return None, None

    date_values = re.findall(r"\d{4}-\d{2}-\d{2}", q)
    if len(date_values) >= 2:
        return date.fromisoformat(date_values[0]), date.fromisoformat(date_values[1])
    if len(date_values) == 1:
        target_date = date.fromisoformat(date_values[0])
        return target_date, target_date
    return None, None


def list_token_generations(db: Session, page: int = 1, page_size: int = 20, q: str | None = None):
    query = db.query(TokenGeneration).options(joinedload(TokenGeneration.creator))
    start_date, end_date = _parse_generation_query_dates(q)

    if start_date:
        query = query.filter(TokenGeneration.date >= start_date)
    if end_date:
        query = query.filter(TokenGeneration.date <= end_date)
    
    total = query.count()
    offset = (page - 1) * page_size
    items = query.order_by(TokenGeneration.date.desc()).offset(offset).limit(page_size).all()
    
    # Refresh totals for each item to ensure they match reality
    for item in items:
        actual_total = db.query(func.coalesce(func.sum(TokenDetail.token_count), 0))\
            .filter(TokenDetail.generation_id == item.id).scalar()
        # Only override if we actually found details, otherwise keep the stored total
        if actual_total > 0:
            item.total_tokens = actual_total
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0
    }

def get_token_details_by_date(target_date: date, db: Session, page: int = 1, page_size: int = 50):
    generation = db.query(TokenGeneration).filter(TokenGeneration.date == target_date).first()
    
    # Calculate totals directly from details for maximum accuracy/sync
    total_tokens = 0
    total_receipts = 0
    
    if generation:
        total_tokens = db.query(func.coalesce(func.sum(TokenDetail.token_count), 0)).filter(TokenDetail.generation_id == generation.id).scalar()
        # Fallback to generation total if no details are found
        if total_tokens == 0:
            total_tokens = generation.total_tokens
        total_receipts = db.query(TokenDetail).filter(TokenDetail.generation_id == generation.id).count()

    if not generation:
        return {
            "items": [],
            "total": 0,
            "total_tokens": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0
        }
    
    query = db.query(TokenDetail).options(joinedload(TokenDetail.creator)).filter(TokenDetail.generation_id == generation.id)
    # total in paginated response should be total_receipts
    offset = (page - 1) * page_size
    items = query.order_by(TokenDetail.created_at.desc()).offset(offset).limit(page_size).all()
    
    return {
        "items": items,
        "total": total_receipts,
        "total_tokens": total_tokens,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total_receipts / page_size) if total_receipts > 0 else 0
    }

def _ist_to_utc_bound(date_val: date, time_str: str | None, is_end: bool) -> datetime:
    if time_str:
        h, m = map(int, time_str.split(':'))
        dt_ist = datetime(date_val.year, date_val.month, date_val.day, h, m, 59 if is_end else 0)
    elif is_end:
        dt_ist = datetime(date_val.year, date_val.month, date_val.day, 23, 59, 59)
    else:
        dt_ist = datetime(date_val.year, date_val.month, date_val.day, 0, 0, 0)
    return dt_ist - timedelta(hours=5, minutes=30)


def list_all_token_details(db: Session, page: int = 1, page_size: int = 50,
                           start_date: date = None, end_date: date = None,
                           start_time: str = None, end_time: str = None):
    query = db.query(TokenDetail).options(joinedload(TokenDetail.creator))
    
    # The system primarily serves India (IST = UTC+5:30).
    # Since created_at is stored in UTC, we must adjust date+time filters to match IST bounds.
    if start_date:
        start_dt_utc = _ist_to_utc_bound(start_date, start_time, is_end=False)
        query = query.filter(TokenDetail.created_at >= start_dt_utc)
    
    if end_date:
        end_dt_utc = _ist_to_utc_bound(end_date, end_time, is_end=True)
        query = query.filter(TokenDetail.created_at <= end_dt_utc)
        
    total = query.count()
    
    # Calculate total tokens for the filtered range in a separate, simpler query
    sum_query = db.query(func.coalesce(func.sum(TokenDetail.token_count), 0))
    if start_date:
        sum_query = sum_query.filter(TokenDetail.created_at >= _ist_to_utc_bound(start_date, start_time, is_end=False))
    if end_date:
        sum_query = sum_query.filter(TokenDetail.created_at <= _ist_to_utc_bound(end_date, end_time, is_end=True))
    
    total_tokens = sum_query.scalar()

    offset = (page - 1) * page_size
    items = query.order_by(TokenDetail.created_at.desc()).offset(offset).limit(page_size).all()
    
    return {
        "items": items,
        "total": total,
        "total_tokens": total_tokens,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0
    }



