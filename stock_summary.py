from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.api.deps import get_db, PermissionChecker
from app.db.models import StockLedger, User, Item, Unit, ConsumptionEntry, ConsumptionItem, WastageItem, MenuItem, TokenGeneration, TokenDetail, WastageEntry
from app.schemas.report import (
    StockReportRow,
    DetailedStockSummaryResponse,
    DetailedStockSummaryRow,
    StockSummaryFooter,
    CanteenSummaryResponse,
    CanteenSummaryFooter,
    CanteenRawReturnRow,
    CanteenWastageRow,
)
from .common import period_expr

router = APIRouter()

@router.get("/get_stock_summary", response_model=list[StockReportRow])
def stock_summary_report(
    from_date: date = Query(...), 
    to_date: date = Query(...), 
    group_by: str = Query("day"), 
    db: Session = Depends(get_db), 
    _: User = Depends(PermissionChecker("reports.stock_summary.read"))
):
    period = period_expr(group_by, StockLedger.txn_date)
    rows = (
        db.query(
            period.label("period"),
            func.coalesce(func.sum(StockLedger.qty_in), 0).label("qty_in"),
            func.coalesce(func.sum(StockLedger.qty_out), 0).label("qty_out"),
            func.coalesce(func.sum(StockLedger.value_in), 0).label("value_in"),
            func.coalesce(func.sum(StockLedger.value_out), 0).label("value_out"),
        )
        .filter(
            StockLedger.txn_date >= from_date, 
            StockLedger.txn_date <= to_date
        )
        .group_by(period)
        .order_by(period)
        .all()
    )
    return [StockReportRow(period=r.period, qty_in=r.qty_in, qty_out=r.qty_out, value_in=r.value_in, value_out=r.value_out) for r in rows]


@router.get("/get_detailed_stock_summary", response_model=DetailedStockSummaryResponse)
def detailed_stock_summary_report(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("reports.stock_summary.read"))
):
    try:
        # 1. Fetch all items with their units
        items = db.query(Item).join(Unit).filter(Item.is_deleted == False, Item.status == 1).all()
        
        # 2. Calculate Opening Balances for each item as of from_date
        ob_stats = (
            db.query(
                StockLedger.item_id,
                func.coalesce(func.sum(StockLedger.qty_in - StockLedger.qty_out), 0).label("net_before")
            )
            .filter(StockLedger.txn_date < from_date, StockLedger.status == 1, StockLedger.txn_type != 8)
            .group_by(StockLedger.item_id)
            .all()
        )
        ob_map = {r.item_id: Decimal(str(r.net_before)) for r in ob_stats}

        # 2b. Get latest current_value from ledger up to to_date (actual cost basis)
        latest_ids_query = (
            db.query(func.max(StockLedger.id))
            .filter(
                StockLedger.txn_date <= to_date,
                StockLedger.status == 1
            )
            .group_by(StockLedger.item_id)
        )
        value_rows = db.query(
            StockLedger.item_id,
            StockLedger.current_value
        ).filter(
            StockLedger.id.in_(latest_ids_query)
        ).all()
        value_map = {r.item_id: Decimal(str(r.current_value or 0)) for r in value_rows}

        # 3. Calculate Period stats for each item
        period_stats = (
            db.query(
                StockLedger.item_id,
                func.coalesce(func.sum(case((StockLedger.txn_type == 1, StockLedger.qty_in), (StockLedger.txn_type == 7, StockLedger.qty_in), else_=0)), 0).label("purchase_qty"),
                func.coalesce(func.sum(case((StockLedger.txn_type == 2, StockLedger.qty_out), else_=0)), 0).label("issue_qty"),
                func.coalesce(func.sum(case((StockLedger.txn_type == 2, StockLedger.value_out), else_=0)), 0).label("issue_value"),
                func.coalesce(func.sum(case((StockLedger.txn_type == 5, StockLedger.qty_out), else_=0)), 0).label("purchase_return_qty"),
                func.coalesce(
                    func.sum(
                        case(
                            (StockLedger.txn_type == 3, StockLedger.qty_in - StockLedger.qty_out),
                            (StockLedger.txn_type == 4, StockLedger.qty_in - StockLedger.qty_out),
                            (StockLedger.txn_type == 6, StockLedger.qty_in - StockLedger.qty_out),
                            else_=0
                        )
                    ),
                    0
                ).label("stock_adjustment_qty"),
                func.coalesce(func.sum(StockLedger.qty_in), 0).label("total_qty_in"),
                func.coalesce(func.sum(StockLedger.qty_out), 0).label("total_qty_out"),
            )
            .filter(
                StockLedger.txn_date >= from_date,
                StockLedger.txn_date <= to_date,
                StockLedger.status == 1,
                StockLedger.txn_type != 8
            )
            .group_by(StockLedger.item_id)
            .all()
        )
        period_map = {r.item_id: r for r in period_stats}

        rows = []
        for item in items:
            p = period_map.get(item.id)
            
            # item.opening_stock is String, need to convert
            try:
                base_opening = Decimal(item.opening_stock or "0")
            except:
                base_opening = Decimal("0")
                
            ob = base_opening + ob_map.get(item.id, Decimal("0"))
            
            p_qty = Decimal(str(p.purchase_qty)) if p else Decimal("0")
            i_qty = Decimal(str(p.issue_qty)) if p else Decimal("0")
            i_val = Decimal(str(p.issue_value)) if p else Decimal("0")
            pr_qty = Decimal(str(p.purchase_return_qty)) if p else Decimal("0")
            sa_qty = Decimal(str(p.stock_adjustment_qty)) if p else Decimal("0")
            
            total_in = Decimal(str(p.total_qty_in)) if p else Decimal("0")
            total_out = Decimal(str(p.total_qty_out)) if p else Decimal("0")
            closing = ob + total_in - total_out
            
            rate = item.default_price or Decimal("0")
            closing_val = value_map.get(item.id, Decimal("0"))

            rows.append(DetailedStockSummaryRow(
                item_id=item.id,
                item_name=item.item_name,
                category_name=item.category.category_name if item.category else "Uncategorized",
                unit=item.unit.unit_code,
                rate=rate,
                opening_balance=ob,
                purchase_qty=p_qty,
                issue_qty=i_qty,
                issue_value=i_val,
                purchase_return_qty=pr_qty,
                stock_adjustment_qty=sa_qty,
                closing_stock=closing,
                closing_value=closing_val
            ))

        # 4. Fetch Footer Details (Consumptions/Manpower)
        footer_data = (
            db.query(
                func.coalesce(func.sum(ConsumptionEntry.people_served), 0).label("devotees"),
                func.coalesce(func.sum(ConsumptionEntry.times_cooked), 0).label("times_cooked"),
                func.coalesce(func.sum(ConsumptionEntry.regular_cooking_persons + ConsumptionEntry.additional_cooking_persons), 0).label("cooking"),
                func.coalesce(func.sum(ConsumptionEntry.regular_serving_persons + ConsumptionEntry.additional_serving_persons), 0).label("serving"),
                func.coalesce(func.sum(ConsumptionEntry.regular_cleaning_persons + ConsumptionEntry.additional_cleaning_persons), 0).label("cleaning"),
            )
            .filter(
                ConsumptionEntry.is_deleted == False,
                ConsumptionEntry.usage_date >= from_date,
                ConsumptionEntry.usage_date <= to_date
            )
            .first()
        )

        # Correct calculation for Rice Remained (sum of CLOSING stocks of all items with 'Rice' in name)
        # We've already calculated closing for each item in 'rows'
        rice_remained_qty = sum((row.closing_stock for row in rows if "Rice" in row.item_name), Decimal("0"))

        footer = None
        if footer_data:
            footer = StockSummaryFooter(
                mahaprasada_devotees=int(footer_data.devotees or 0),
                times_cooked=int(footer_data.times_cooked or 0),
                cooking_persons=int(footer_data.cooking or 0),
                serving_persons=int(footer_data.serving or 0),
                cleaning_persons=int(footer_data.cleaning or 0),
                rice_remained=rice_remained_qty,
            )

        return DetailedStockSummaryResponse(
            from_date=from_date,
            to_date=to_date,
            rows=rows,
            footer=footer
        )
    except Exception as e:
        import traceback
        import logging
        logging.error(f"Error in detailed_stock_summary_report: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/get_canteen_summary", response_model=CanteenSummaryResponse)
def canteen_summary_report(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("reports.canteen_summary.read")),
):
    try:
        if to_date < from_date:
            raise HTTPException(status_code=400, detail="to_date must not be before from_date")

        items = db.query(Item).join(Unit).filter(Item.is_deleted == False, Item.status == 1).all()

        ob_stats = (
            db.query(
                StockLedger.item_id,
                func.coalesce(func.sum(StockLedger.qty_in - StockLedger.qty_out), 0).label("net_before")
            )
            .filter(StockLedger.txn_date < from_date, StockLedger.status == 1, StockLedger.txn_type != 8)
            .group_by(StockLedger.item_id)
            .all()
        )
        ob_map = {r.item_id: Decimal(str(r.net_before)) for r in ob_stats}

        latest_ids_query = (
            db.query(func.max(StockLedger.id))
            .filter(
                StockLedger.txn_date <= to_date,
                StockLedger.status == 1
            )
            .group_by(StockLedger.item_id)
        )
        value_rows = db.query(
            StockLedger.item_id,
            StockLedger.current_value
        ).filter(
            StockLedger.id.in_(latest_ids_query)
        ).all()
        value_map = {r.item_id: Decimal(str(r.current_value or 0)) for r in value_rows}

        period_stats = (
            db.query(
                StockLedger.item_id,
                func.coalesce(func.sum(case((StockLedger.txn_type == 1, StockLedger.qty_in), (StockLedger.txn_type == 7, StockLedger.qty_in), else_=0)), 0).label("purchase_qty"),
                func.coalesce(func.sum(case((StockLedger.txn_type == 2, StockLedger.qty_out), else_=0)), 0).label("issue_qty"),
                func.coalesce(func.sum(case((StockLedger.txn_type == 2, StockLedger.value_out), else_=0)), 0).label("issue_value"),
                func.coalesce(func.sum(case((StockLedger.txn_type == 5, StockLedger.qty_out), else_=0)), 0).label("purchase_return_qty"),
                func.coalesce(
                    func.sum(
                        case(
                            (StockLedger.txn_type == 3, StockLedger.qty_in - StockLedger.qty_out),
                            (StockLedger.txn_type == 4, StockLedger.qty_in - StockLedger.qty_out),
                            (StockLedger.txn_type == 6, StockLedger.qty_in - StockLedger.qty_out),
                            else_=0
                        )
                    ),
                    0
                ).label("stock_adjustment_qty"),
                func.coalesce(func.sum(StockLedger.qty_in), 0).label("total_qty_in"),
                func.coalesce(func.sum(StockLedger.qty_out), 0).label("total_qty_out"),
            )
            .filter(
                StockLedger.txn_date >= from_date,
                StockLedger.txn_date <= to_date,
                StockLedger.status == 1,
                StockLedger.txn_type != 8
            )
            .group_by(StockLedger.item_id)
            .all()
        )
        period_map = {r.item_id: r for r in period_stats}

        rows = []
        for item in items:
            p = period_map.get(item.id)
            try:
                base_opening = Decimal(item.opening_stock or "0")
            except Exception:
                base_opening = Decimal("0")

            ob = base_opening + ob_map.get(item.id, Decimal("0"))
            p_qty = Decimal(str(p.purchase_qty)) if p else Decimal("0")
            i_qty = Decimal(str(p.issue_qty)) if p else Decimal("0")
            i_val = Decimal(str(p.issue_value)) if p else Decimal("0")
            pr_qty = Decimal(str(p.purchase_return_qty)) if p else Decimal("0")
            sa_qty = Decimal(str(p.stock_adjustment_qty)) if p else Decimal("0")
            total_in = Decimal(str(p.total_qty_in)) if p else Decimal("0")
            total_out = Decimal(str(p.total_qty_out)) if p else Decimal("0")
            closing = ob + total_in - total_out
            rate = item.default_price or Decimal("0")
            closing_val = value_map.get(item.id, Decimal("0"))

            rows.append(DetailedStockSummaryRow(
                item_id=item.id,
                item_name=item.item_name,
                category_name=item.category.category_name if item.category else "Uncategorized",
                unit=item.unit.unit_code,
                rate=rate,
                opening_balance=ob,
                purchase_qty=p_qty,
                issue_qty=i_qty,
                issue_value=i_val,
                purchase_return_qty=pr_qty,
                stock_adjustment_qty=sa_qty,
                closing_stock=closing,
                closing_value=closing_val
            ))

        manpower = (
            db.query(
                func.coalesce(func.sum(ConsumptionEntry.regular_cooking_persons), 0).label("regular_cooking"),
                func.coalesce(func.sum(ConsumptionEntry.additional_cooking_persons), 0).label("additional_cooking"),
                func.coalesce(func.sum(ConsumptionEntry.total_cooking_persons), 0).label("total_cooking"),
                func.coalesce(func.sum(ConsumptionEntry.regular_cleaning_persons), 0).label("regular_cleaning"),
                func.coalesce(func.sum(ConsumptionEntry.additional_cleaning_persons), 0).label("additional_cleaning"),
                func.coalesce(func.sum(ConsumptionEntry.total_cleaning_persons), 0).label("total_cleaning"),
                func.coalesce(func.sum(ConsumptionEntry.regular_serving_persons), 0).label("regular_serving"),
                func.coalesce(func.sum(ConsumptionEntry.additional_serving_persons), 0).label("additional_serving"),
                func.coalesce(func.sum(ConsumptionEntry.total_serving_persons), 0).label("total_serving"),
                func.coalesce(func.sum(ConsumptionEntry.times_cooked), 0).label("times_cooked"),
            )
            .filter(ConsumptionEntry.is_deleted == False, ConsumptionEntry.usage_date >= from_date, ConsumptionEntry.usage_date <= to_date, ConsumptionEntry.status == 1)
            .first()
        )

        token_total = (
            db.query(func.coalesce(func.sum(TokenDetail.token_count), 0))
            .join(TokenGeneration, TokenGeneration.id == TokenDetail.generation_id)
            .filter(TokenGeneration.date >= from_date, TokenGeneration.date <= to_date)
            .scalar()
        ) or 0
        if token_total == 0:
            token_total = (
                db.query(func.coalesce(func.sum(TokenGeneration.total_tokens), 0))
                .filter(TokenGeneration.date >= from_date, TokenGeneration.date <= to_date)
                .scalar()
            ) or 0

        raw_return_rows = (
            db.query(
                Item.item_name.label("item_name"),
                Unit.unit_code.label("unit"),
                func.coalesce(func.sum(ConsumptionItem.qty_returned), 0).label("qty_returned"),
            )
            .join(Item, Item.id == ConsumptionItem.item_id)
            .join(Unit, Unit.id == Item.unit_id)
            .join(ConsumptionEntry, ConsumptionEntry.id == ConsumptionItem.consumption_entry_id)
            .filter(
                ConsumptionEntry.is_deleted == False,
                ConsumptionEntry.usage_date >= from_date,
                ConsumptionEntry.usage_date <= to_date,
                ConsumptionEntry.status == 1,
                ConsumptionItem.qty_returned > 0
            )
            .group_by(Item.item_name, Unit.unit_code)
            .order_by(Item.item_name.asc())
            .all()
        )
        raw_returns = [
            CanteenRawReturnRow(
                item_name=r.item_name,
                unit=r.unit,
                qty_returned=Decimal(str(r.qty_returned or 0)),
            )
            for r in raw_return_rows
        ]

        # Fetch all active menu items
        menu_items = db.query(MenuItem).filter(MenuItem.status == 1).order_by(MenuItem.dish_name.asc()).all()

        wastage_data = (
            db.query(
                WastageItem.menu_item_id,
                func.coalesce(func.sum(WastageItem.quantity), 0).label("qty"),
                func.coalesce(func.sum(WastageItem.quantity * WastageItem.approx_amount), 0).label("approx_amount"),
            )
            .join(WastageEntry, WastageEntry.id == WastageItem.wastage_entry_id)
            .filter(
                WastageEntry.is_deleted == False,
                WastageEntry.wastage_date >= from_date,
                WastageEntry.wastage_date <= to_date,
                WastageEntry.status == 1,
                WastageItem.menu_item_id.isnot(None)
            )
            .group_by(WastageItem.menu_item_id)
            .all()
        )
        wastage_map = {w.menu_item_id: w for w in wastage_data}

        wastage_items = []
        for mi in menu_items:
            w = wastage_map.get(mi.id)
            wastage_items.append(CanteenWastageRow(
                item_name=mi.dish_name,
                qty=Decimal(str(w.qty if w else 0)),
                approx_amount=Decimal(str(w.approx_amount if w else 0)),
            ))
            
        wastage_total_amount = sum((w.approx_amount for w in wastage_items), Decimal("0"))

        footer = CanteenSummaryFooter(
            mahaprasada_devotees=int(token_total or 0),
            regular_cooking_persons=int(manpower.regular_cooking or 0),
            additional_cooking_persons=int(manpower.additional_cooking or 0),
            total_cooking_persons=int(manpower.total_cooking or 0),
            regular_cleaning_persons=int(manpower.regular_cleaning or 0),
            additional_cleaning_persons=int(manpower.additional_cleaning or 0),
            total_cleaning_persons=int(manpower.total_cleaning or 0),
            regular_serving_persons=int(manpower.regular_serving or 0),
            additional_serving_persons=int(manpower.additional_serving or 0),
            total_serving_persons=int(manpower.total_serving or 0),
            times_cooked=int(manpower.times_cooked or 0),
            raw_returns=raw_returns,
            wastage_items=wastage_items,
            wastage_total_amount=wastage_total_amount,
        )

        return CanteenSummaryResponse(from_date=from_date, to_date=to_date, rows=rows, footer=footer)
    except Exception as e:
        import traceback
        import logging
        logging.error(f"Error in canteen_summary_report: {e}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
