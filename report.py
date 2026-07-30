from datetime import date
from decimal import Decimal
from pydantic import BaseModel


class ReportRow(BaseModel):
    period: str
    total_amount: Decimal
    total_count: int


class StockReportRow(BaseModel):
    period: str
    qty_in: Decimal
    qty_out: Decimal
    value_in: Decimal
    value_out: Decimal


class DetailedStockSummaryRow(BaseModel):
    item_id: int
    item_name: str
    category_name: str | None = None
    unit: str
    rate: Decimal
    opening_balance: Decimal
    purchase_qty: Decimal
    issue_qty: Decimal
    issue_value: Decimal
    purchase_return_qty: Decimal
    stock_adjustment_qty: Decimal
    closing_stock: Decimal
    closing_value: Decimal


class StockSummaryFooter(BaseModel):
    mahaprasada_devotees: int
    times_cooked: int
    cooking_persons: int
    serving_persons: int
    cleaning_persons: int
    rice_remained: Decimal


class DetailedStockSummaryResponse(BaseModel):
    from_date: date
    to_date: date
    rows: list[DetailedStockSummaryRow]
    footer: StockSummaryFooter | None = None


class CanteenRawReturnRow(BaseModel):
    item_name: str
    unit: str
    qty_returned: Decimal


class CanteenWastageRow(BaseModel):
    item_name: str
    qty: Decimal
    approx_amount: Decimal


class CanteenSummaryFooter(BaseModel):
    mahaprasada_devotees: int
    regular_cooking_persons: int
    additional_cooking_persons: int
    total_cooking_persons: int
    regular_cleaning_persons: int
    additional_cleaning_persons: int
    total_cleaning_persons: int
    regular_serving_persons: int
    additional_serving_persons: int
    total_serving_persons: int
    times_cooked: int
    raw_returns: list[CanteenRawReturnRow]
    wastage_items: list[CanteenWastageRow]
    wastage_total_amount: Decimal


class CanteenSummaryResponse(BaseModel):
    from_date: date
    to_date: date
    rows: list[DetailedStockSummaryRow]
    footer: CanteenSummaryFooter


class StockFinanceCardRow(BaseModel):
    period: str
    opening_stock: Decimal
    purchased_qty: Decimal
    consumed_qty: Decimal
    wastage_qty: Decimal
    closing_stock: Decimal
    purchase_value: Decimal
    consumption_value: Decimal
    wastage_value: Decimal
    vendor_payment_value: Decimal
    net_financial_balance: Decimal


class ReportQuery(BaseModel):
    from_date: date
    to_date: date
    group_by: str


class ManpowerReportRow(BaseModel):
    period: str
    regular_cooking: int
    additional_cooking: int
    total_cooking: int
    regular_serving: int
    additional_serving: int
    total_serving: int
    regular_cleaning: int
    additional_cleaning: int
    total_cleaning: int


class ManpowerReportResponse(BaseModel):
    from_date: date
    to_date: date
    rows: list[ManpowerReportRow]


class PurchaseDetailItem(BaseModel):
    item_name: str
    quantity: Decimal
    price: Decimal
    line_total: Decimal


class PurchaseDetailRow(BaseModel):
    purchase_date: date
    vendor_name: str
    bill_no: str | None = None
    total_amount: Decimal
    invoice_amount: Decimal | None = None
    items: list[PurchaseDetailItem]
