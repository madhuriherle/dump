import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Filter } from 'lucide-react';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import { PrinterSelectDropdown } from '../components/PrinterSelectDropdown';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardContent } from '../components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../components/ui/Dialog';
import { formatDate, getTodayDateInput } from '../utils/date';
import { formatCurrency } from '../utils/currency';
import { QtyDisplay } from '../components/ui/QtyDisplay';

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetRange = (mode) => {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  if (mode === 'yesterday') {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  }

  if (mode === 'weekly') {
    start.setDate(today.getDate() - 6);
  }

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end)
  };
};

const CanteenSummaryPage = () => {
  const { showError, showSuccess } = useNotification();
  const [dateFilterMode, setDateFilterMode] = useState('today');
  const [customFromDate, setCustomFromDate] = useState(getTodayDateInput());
  const [customToDate, setCustomToDate] = useState(getTodayDateInput());
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  // Custom filter state
  const [hideInactive, setHideInactive] = useState(true);

  const activeDateRange = useMemo(() => {
    if (dateFilterMode === 'custom') {
      return { startDate: customFromDate, endDate: customToDate };
    }
    return getPresetRange(dateFilterMode);
  }, [dateFilterMode, customFromDate, customToDate]);

  const fromDate = activeDateRange.startDate;
  const toDate = activeDateRange.endDate;

  const handleDateFilterModeChange = (mode) => {
    setDateFilterMode(mode);
    if (mode !== 'custom') {
      const range = getPresetRange(mode);
      setCustomFromDate(range.startDate);
      setCustomToDate(range.endDate);
    }
  };

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['canteen-summary', fromDate, toDate],
    queryFn: async () => {
      const res = await api.get('/reports/get_canteen_summary', { params: { from_date: fromDate, to_date: toDate } });
      return res.data;
    }
  });

  const { data: menuItemsData } = useQuery({
    queryKey: ['menu-items-master'],
    queryFn: async () => {
      const res = await api.get('/menu-items/list_menu_items', { params: { page_size: 100, status: 1 } });
      return res.data;
    }
  });

  const { data: itemsData } = useQuery({
    queryKey: ['items-list-all-summary'],
    queryFn: async () => (await api.get('/items/list_items', { params: { page_size: 100 } })).data
  });

  const itemCodeMap = useMemo(() => {
    const map = {};
    (itemsData?.items || []).forEach((item) => {
      const serial = item?.serial_numbers?.[0]?.serial_number;
      const name = item.item_name;
      if (serial) map[name] = parseInt(serial, 10);
    });
    return map;
  }, [itemsData]);

  const handlePrint = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
      showError('No data available to print');
      return;
    }
    window.print();
  };

  const orderedRows = useMemo(() => {
    const rows = reportData?.rows ?? [];
    return [...rows].sort((a, b) => {
      // Sort by category first
      const catA = a.category_name || 'Uncategorized';
      const catB = b.category_name || 'Uncategorized';
      const catComp = catA.localeCompare(catB);
      if (catComp !== 0) return catComp;

      const codeA = itemCodeMap[a.item_name] ?? 999;
      const codeB = itemCodeMap[b.item_name] ?? 999;
      if (codeA !== codeB) return codeA - codeB;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''));
    });
  }, [reportData, itemCodeMap]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    orderedRows.forEach((row) => set.add(row.category_name || 'Uncategorized'));
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [orderedRows]);

  const filteredRows = useMemo(() => {
    let rows = orderedRows;

    // 1. Hide Unused/Zero Stock Items (when active items toggle is ON, only show items with consumption/issue today)
    if (hideInactive) {
      rows = rows.filter(row => Number(row.issue_qty) > 0.000001);
    }

    if (selectedCategory !== 'ALL') {
      rows = rows.filter(row => (row.category_name || 'Uncategorized') === selectedCategory);
    }

    return rows;
  }, [orderedRows, hideInactive, selectedCategory]);

  const grandTotals = useMemo(() => {
    if (!filteredRows) return null;
    return filteredRows.reduce((acc, row) => ({
      opening: acc.opening + Number(row.opening_balance),
      purchase: acc.purchase + Number(row.purchase_qty),
      issues: acc.issues + Number(row.issue_qty),
      issue_val: acc.issue_val + Number(row.issue_value),
      returns: acc.returns + Number(row.purchase_return_qty),
      adjust: acc.adjust + Number(row.stock_adjustment_qty),
      closing: acc.closing + Number(row.closing_stock),
      closing_val: acc.closing_val + Number(row.closing_value)
    }), {
      opening: 0,
      purchase: 0,
      issues: 0,
      issue_val: 0,
      returns: 0,
      adjust: 0,
      closing: 0,
      closing_val: 0
    });
  }, [filteredRows]);

  const groupedRows = useMemo(() => {
    const groups = {};
    filteredRows.forEach((row) => {
      const key = row.category_name || 'Uncategorized';
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);

  const toEnglishCategory = (category) => {
    const match = String(category || '').match(/\(([^)]+)\)\s*$/);
    return match ? match[1].trim() : category;
  };

  const footer = reportData?.footer;
  const devotees = Number(footer?.mahaprasada_devotees ?? 0);
  const timesCooked = Number(footer?.times_cooked ?? 0);
  const hasAdditionalManpower = 
    Number(footer?.additional_cooking_persons ?? 0) > 0 ||
    Number(footer?.additional_serving_persons ?? 0) > 0 ||
    Number(footer?.additional_cleaning_persons ?? 0) > 0;

  const fmt2 = (n) => String(Math.trunc(n)).padStart(2, '0');

  const personRows = [
    ['Regular Cooking Persons', Number(footer?.regular_cooking_persons ?? 0)],
    ['Additional Cooking Persons', Number(footer?.additional_cooking_persons ?? 0)],
    ['Total Cooking Persons', Number(footer?.total_cooking_persons ?? 0)],
    ['Regular Cleaning Persons', Number(footer?.regular_cleaning_persons ?? 0)],
    ['Additional Cleaning Persons', Number(footer?.additional_cleaning_persons ?? 0)],
    ['Total Cleaning Persons', Number(footer?.total_cleaning_persons ?? 0)],
    ['Regular Serving Persons', Number(footer?.regular_serving_persons ?? 0)],
    ['Additional Serving Persons', Number(footer?.additional_serving_persons ?? 0)],
    ['Total Serving Persons', Number(footer?.total_serving_persons ?? 0)]
  ];

  const wastageItems = footer?.wastage_items ?? [];
  const wastageTotal = Number(footer?.wastage_total_amount ?? 0);
  const hasWastageValue = (row) =>
    Math.abs(Number(row?.qty || 0)) > 0.000001 || Math.abs(Number(row?.amount || 0)) > 0.000001;
  const allItemRows = orderedRows.map((r) => ({
    item_name: String(r.item_name || ''),
    unit: String(r.unit || '')
  }));
  const unitByItemName = new Map(allItemRows.map((item) => [item.item_name, item.unit]));
  const wastageMap = new Map(
    wastageItems.map((w) => [
    String(w.item_name || ''),
    { qty: Number(w.qty || 0), amount: Number(w.approx_amount || 0) }]
    )
  );

  const activeMenuItems = useMemo(() => {
    const payload = menuItemsData;
    if (!payload) return [];
    const list = Array.isArray(payload) ?
    payload :
    Array.isArray(payload?.rows) ?
    payload.rows :
    Array.isArray(payload?.items) ?
    payload.items :
    Array.isArray(payload?.data) ?
    payload.data :
    [];
    return list.filter((m) => Number(m?.status ?? 1) !== 0);
  }, [menuItemsData]);
  const menuItemNames = useMemo(() => {
    return activeMenuItems.
    map((m) => String(m?.dish_name ?? m?.item_name ?? m?.name ?? '').trim()).
    filter((name) => name.length > 0);
  }, [activeMenuItems]);
  const unitByMenuItemName = useMemo(() => {
    return new Map(
      activeMenuItems.map((m) => [
      String(m?.dish_name ?? m?.item_name ?? m?.name ?? '').trim(),
      String(m?.unit?.unit_code ?? '')]
      )
    );
  }, [activeMenuItems]);

  const wastageRowsAllItems = menuItemNames.map((name) => {
    const w = wastageMap.get(name);
    return {
      item_name: name,
      qty: w?.qty ?? 0,
      amount: w?.amount ?? 0
    };
  });

  const wastageRowsFallback = allItemRows.map((i) => {
    const w = wastageMap.get(i.item_name);
    return {
      item_name: i.item_name,
      qty: w?.qty ?? 0,
      amount: w?.amount ?? 0
    };
  });
  const wastageRowsForDisplay = wastageRowsAllItems.length > 0 ? wastageRowsAllItems : wastageRowsFallback;

  const activeWastageRows = useMemo(() => {
    return wastageRowsForDisplay.filter(hasWastageValue);
  }, [wastageRowsForDisplay]);

  const stockAdjustmentRowsForDisplay = filteredRows
    .filter((r) => Math.abs(Number(r.stock_adjustment_qty || 0)) > 0.000001)
    .map((r) => ({
      item_name: r.item_name,
      unit: r.unit,
      qty_adjusted: Number(r.stock_adjustment_qty || 0),
    }));

  return (
    <div className="space-y-6 print:space-y-2 canteen-summary-print">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body, #root, main {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          header, aside, footer { display: none !important; }
          main { padding: 0 !important; }
          .lg\\:pl-64 { padding-left: 0 !important; }
          .canteen-summary-print { padding-top: 8mm !important; background: #ffffff !important; background-color: #ffffff !important; }
          .canteen-summary-print, .canteen-summary-print * { overflow: visible !important; }
          .canteen-summary-print { font-size: 11px; }
          .canteen-summary-print,
          .canteen-summary-print div,
          .canteen-summary-print section,
          .canteen-summary-print table,
          .canteen-summary-print thead,
          .canteen-summary-print tbody,
          .canteen-summary-print tfoot,
          .canteen-summary-print tr,
          .canteen-summary-print th,
          .canteen-summary-print td {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          .canteen-summary-print table { table-layout: fixed; width: 100%; border-collapse: separate !important; border-spacing: 0 !important; border: 1px solid #d7c9ba !important; outline: 1px solid #d7c9ba !important; outline-offset: -1px !important; }
          .canteen-summary-print table .hidden {
            display: table-cell !important;
          }
          .canteen-summary-print thead { display: table-header-group !important; }
          .canteen-summary-print tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .canteen-summary-print .category-print-section { break-inside: avoid-page !important; page-break-inside: avoid !important; }
          .canteen-summary-print .category-print-title { break-after: avoid !important; page-break-after: avoid !important; }
          .canteen-summary-print .category-print-table thead { display: table-header-group !important; }
          .canteen-summary-print .category-print-table tbody tr:first-child { break-inside: avoid !important; page-break-inside: avoid !important; }
          .canteen-summary-print th, .canteen-summary-print td { padding: 7px !important; font-size: 12px !important; border: 0 !important; border-left: 1px solid #d7c9ba !important; border-top: 1px solid #d7c9ba !important; border-right: 1px solid #d7c9ba !important; border-bottom: 1px solid #d7c9ba !important; }
          .canteen-summary-print thead th, .canteen-summary-print thead th * { font-size: 12px !important; line-height: 1.05 !important; padding-top: 7px !important; padding-bottom: 7px !important; }
          .canteen-summary-print table thead tr,
          .canteen-summary-print table thead tr *,
          .canteen-summary-print table thead th {
            font-size: 12px !important;
            line-height: 1.05 !important;
          }
          .canteen-summary-print tbody td { border-top: 1px solid #d7c9ba !important; }
          .canteen-summary-print th:last-child, .canteen-summary-print td:last-child { border-right: 1px solid #d7c9ba !important; }
          .canteen-summary-print tfoot td { border: 1px solid #cab7a4 !important; }
          .canteen-summary-print .canteen-summary-report-card,
          .canteen-summary-print .report-table-wrap {
            border: none !important;
            box-shadow: none !important;
          }
          .canteen-summary-print .canteen-summary-print-header {
            border-bottom: none !important;
          }
          .canteen-summary-print .shadow-sm,
          .canteen-summary-print .shadow,
          .canteen-summary-print .shadow-lg,
          .canteen-summary-print .shadow-xl,
          .canteen-summary-print .shadow-2xl {
            box-shadow: none !important;
          }
          .canteen-summary-print .grand-total-row td { border-top: 2px solid #bfa892 !important; border-bottom: 1px solid #bfa892 !important; font-size: 13px !important; }
          .canteen-summary-print table th:nth-child(1),
          .canteen-summary-print table td:nth-child(1) { width: 18% !important; }
          .canteen-summary-print table th:nth-child(2),
          .canteen-summary-print table td:nth-child(2) { width: 8% !important; }
          .canteen-summary-print table th:nth-child(n+3),
          .canteen-summary-print table td:nth-child(n+3) { width: 9.25% !important; }
          .canteen-summary-print .footer-table { border-collapse: collapse; width: 100%; max-width: 520px; margin-top: 3mm; color: #000 !important; }
          .canteen-summary-print .footer-table th, .canteen-summary-print .footer-table td { border: 1px solid #888 !important; }
          .canteen-summary-print .footer-table th { background-color: #ffffff !important; }
          .canteen-summary-print .footer-table { page-break-inside: avoid; break-inside: avoid; }
          .canteen-summary-print .footer-section-title { font-size: 8px !important; letter-spacing: 0; text-transform: uppercase; }
          .canteen-summary-print .footer-section-cell { padding: 3px 5px !important; vertical-align: top; }
          .canteen-summary-print .footer-summary-grid { display: grid; grid-template-columns: 155px 1fr; gap: 2px 8px; }
          .canteen-summary-print .footer-return-grid,
          .canteen-summary-print .footer-wastage-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 14px; }
          .canteen-summary-print .footer-manpower-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px 12px; }
          .canteen-summary-print .footer-metric-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 4px; line-height: 1.15; }
          .canteen-summary-print .footer-metric-row span:first-child { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
          .canteen-summary-print .no-wrap-print { white-space: nowrap !important; }
          .canteen-summary-print .canteen-footer-summary {
            margin-top: 5mm !important;
            padding: 0 !important;
            border: none !important;
          }
          .canteen-summary-print .canteen-footer-inner {
            max-width: 115mm !important;
            margin: 0 auto !important;
          }
          .canteen-summary-print .canteen-footer-grid {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 2mm !important;
          }
          .canteen-summary-print .canteen-footer-box {
            border: 1px solid #9b8b7a !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: hidden !important;
          }
          .canteen-summary-print .compact-print-summary {
            display: grid !important;
            grid-template-columns: minmax(48mm, 62mm) minmax(62mm, 90mm) !important;
            gap: 3mm !important;
            max-width: 156mm !important;
            margin: 5mm 0 0 !important;
            color: #000 !important;
            font-size: 13px !important;
            line-height: 1.3 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .canteen-summary-print .compact-print-block {
            border: 1px solid #9b8b7a !important;
            padding: 1.5mm 2mm !important;
          }
          .canteen-summary-print .compact-print-heading {
            font-size: 13px !important;
            font-weight: 900 !important;
            text-transform: uppercase !important;
            margin-bottom: 1mm !important;
            padding-bottom: 0.8mm !important;
            border-bottom: 1px solid #c9b8a5 !important;
          }
          .canteen-summary-print .compact-print-line {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            gap: 4mm !important;
            padding: 0.4mm 0 !important;
          }
          .canteen-summary-print .compact-print-wastage-list {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto auto !important;
            gap: 2mm !important;
          }
          .canteen-summary-print .compact-print-muted {
            color: #555 !important;
            font-style: italic !important;
          }
          .canteen-summary-print .compact-print-total {
            margin-top: 1mm !important;
            padding-top: 1mm !important;
            border-top: 1px solid #c9b8a5 !important;
            text-align: right !important;
            font-weight: 900 !important;
          }

          /* Wrapper div borders hidden in print to avoid clipping and double borders */
          .canteen-summary-print .overflow-x-auto.rounded-md.border {
            border: none !important;
            box-shadow: none !important;
          }

          /* Footer Tables Specific Styling in Print */
          .canteen-summary-print .snapshot-table,
          .canteen-summary-print .wastage-table {
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            border: none !important;
            table-layout: auto !important;
            width: 100% !important;
          }
          .canteen-summary-print .wastage-table table {
            border: none !important;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            table-layout: auto !important;
            width: 100% !important;
          }
          .canteen-summary-print .snapshot-table th, 
          .canteen-summary-print .snapshot-table td,
          .canteen-summary-print .wastage-table th, 
          .canteen-summary-print .wastage-table td {
            font-size: 8px !important;
            padding: 2px 4px !important;
            border: 1px solid #c9b8a5 !important;
          }
          .canteen-summary-print .snapshot-table th,
          .canteen-summary-print .wastage-table th {
            color: #000 !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
          }
          .canteen-summary-print .snapshot-table .devotees-row td {
            font-size: 8px !important;
            font-weight: bold !important;
          }
          .canteen-summary-print .snapshot-table .highlight-row td,
          .canteen-summary-print .wastage-table .highlight-row td {
            font-size: 8px !important;
            font-weight: bold !important;
          }
        }

        /* Custom styles for footer tables to ensure small text and compact padding on screen */
        .snapshot-table,
        .wastage-table {
          font-size: 11px;
        }
        .snapshot-table td,
        .wastage-table td {
          padding: 3px 6px;
        }
        .snapshot-table .devotees-row td {
          font-size: 14px;
          font-weight: bold;
        }
        .snapshot-table .highlight-row td,
        .wastage-table .highlight-row td {
          font-size: 11px;
          font-weight: bold;
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <h2 className="page-title" style={{ fontSize: 20 }}>Mahaprasadam Summary Report</h2>
        <div className="flex items-center gap-2">
          <PrinterSelectDropdown
            context="REPORT_CANTEEN"
            onPrint={handlePrint}
            buttonLabel="Print"
          />
        </div>
      </div>

      <Card className="border-border-temple bg-[#FAF6F0]/30 shadow-md print:hidden">
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            {/* Left Section: Inputs & Controls */}
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3 flex-1">
              
              {/* 1. Date Filter Mode Selector */}
              <div className="space-y-1.5 w-full sm:w-[200px]">
                <Label className="text-xs font-bold text-text-main/70 uppercase tracking-wider">Date Filter</Label>
                <select
                  value={dateFilterMode}
                  onChange={(e) => handleDateFilterModeChange(e.target.value)}
                  className="h-10 w-full rounded-md border border-border-temple/50 bg-white px-3 text-sm text-text-main outline-none focus:border-primary transition-all">
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {dateFilterMode === 'custom' && (
                <>
                  <div className="space-y-1.5 w-full sm:w-[200px]">
                    <Label className="text-xs font-bold text-text-main/70 uppercase tracking-wider">From Date</Label>
                    <Input
                      type="date"
                      value={customFromDate}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomFromDate(value);
                        if (customToDate < value) setCustomToDate(value);
                      }}
                      className="h-10 border-border-temple/50 bg-white text-text-main focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1.5 w-full sm:w-[200px]">
                    <Label className="text-xs font-bold text-text-main/70 uppercase tracking-wider">To Date</Label>
                    <Input
                      type="date"
                      value={customToDate}
                      min={customFromDate}
                      onChange={(e) => setCustomToDate(e.target.value)}
                      className="h-10 border-border-temple/50 bg-white text-text-main focus:border-primary focus:ring-primary"
                    />
                  </div>
                </>
              )}

              {/* 2. With Category Toggle */}
              <div className="flex items-center h-10">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    id="groupByCategory" 
                    checked={groupByCategory} 
                    onChange={(e) => {
                      setGroupByCategory(e.target.checked);
                      if (!e.target.checked) {
                        setSelectedCategory('ALL');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-[#E2D2B8]/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[#E2D2B8] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  <span className="ms-3 text-sm font-semibold text-text-main">With Category</span>
                </label>
              </div>

              {/* Category Dropdown (Only shown when With Category grouping is enabled) */}
              {groupByCategory && (
                <div className="space-y-1.5 w-full sm:w-[200px] animate-in fade-in slide-in-from-left-2">
                  <Label className="text-xs font-bold text-text-main/70 uppercase tracking-wider">Select Category</Label>
                  <div className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-main/60" />
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="h-10 w-full rounded-md border border-border-temple/50 bg-white pl-9 pr-8 text-sm text-text-main outline-none focus:border-primary focus:ring-primary transition-all appearance-none cursor-pointer">
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category === 'ALL' ? 'All Categories' : toEnglishCategory(category)}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-text-main/60">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Consumption Items Only Toggle */}
              <div className="flex items-center h-10">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    id="hideInactive" 
                    checked={hideInactive} 
                    onChange={(e) => setHideInactive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-[#E2D2B8]/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[#E2D2B8] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  <span className="ms-3 text-sm font-semibold text-text-main">Consumption Items Only</span>
                </label>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      <div className="canteen-summary-report-card bg-white border border-border-temple rounded-lg overflow-hidden shadow-sm print:border-none print:shadow-none">
        <div className="canteen-summary-print-header p-6 text-center border-b border-border-temple/40 print:pb-2">
          <h1 className="text-xl font-bold text-text-main uppercase font-temple">ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ (ಅನ್ನದಾನ)</h1>
          <p className="text-sm font-bold text-text-main mt-1">
            MAHAPRASADAM SUMMARY REPORT FOR :{' '}
            <span className="font-extrabold">
              {formatDate(fromDate)} to {formatDate(toDate)}
            </span>
          </p>
        </div>

        <div className="p-4 print:p-0">
          {isLoading ? (
            <div className="py-10 text-center">
              <div className="flex items-center justify-center gap-2 text-text-main">
                Loading report...
              </div>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-text-main/60">No data found matching your filters</div>
          ) : !groupByCategory ? (
            /* FLAT LIST - Single Table */
            <div className="report-table-wrap overflow-x-auto print:overflow-visible rounded-xl border border-border-temple shadow-sm bg-white">
              <table className="w-full table-fixed text-xs border-collapse">
                <thead className="bg-[#FFF4E6] border-b border-border-temple">
                  <tr className="text-text-main font-normal uppercase">
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Item Name</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Rate</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Opening Stock</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Added</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Used</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Usage Value</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Purchase Ret.</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Adjust</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Closing Stock</th>
                    <th className="px-3 py-2 text-left whitespace-normal break-words">Closing Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-temple/10">
                  {filteredRows.map((row) => (
                    <tr key={row.item_id} className="hover:bg-bg-temple/10 transition-colors">
                      <td className="px-3 py-2 border-r border-border-temple/10 font-medium text-text-main whitespace-normal break-words">{row.item_name}</td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main">{formatCurrency(row.rate)}</td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.opening_balance} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.purchase_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.issue_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-nowrap">{formatCurrency(row.issue_value)}</td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.purchase_return_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.stock_adjustment_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 font-bold text-text-main whitespace-normal break-words"><QtyDisplay qty={row.closing_stock} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 text-text-main whitespace-nowrap">{formatCurrency(row.closing_value)}</td>
                    </tr>
                  ))}
                </tbody>
                {grandTotals && (
                  <tbody className="bg-[#FAF3E7] text-black font-black text-[13px] border-t-2 border-border-temple/60">
                    <tr className="grand-total-row text-black">
                      <td colSpan={2} className="px-3 py-5 border-r border-black/10 text-left uppercase tracking-[0.2em] font-black">GRAND TOTAL</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{grandTotals.opening.toFixed(3)}</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{grandTotals.purchase.toFixed(3)}</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{grandTotals.issues.toFixed(3)}</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{formatCurrency(grandTotals.issue_val)}</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{grandTotals.returns.toFixed(3)}</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{grandTotals.adjust.toFixed(3)}</td>
                      <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{grandTotals.closing.toFixed(3)}</td>
                      <td className="px-3 py-5 text-left whitespace-nowrap font-black text-secondary">{formatCurrency(grandTotals.closing_val)}</td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
          ) : (
            /* GROUPED LIST - Multiple Tables */
            <div className="space-y-10">
              {groupedRows.map(([categoryName, rows]) => (
                <section key={categoryName} className="space-y-3 category-print-section">
                  <h2 className="text-sm font-black uppercase tracking-widest text-primary px-1 category-print-title">
                    {toEnglishCategory(categoryName)}
                  </h2>
                  <div className="report-table-wrap overflow-x-auto print:overflow-visible rounded-xl border border-border-temple shadow-sm bg-white">
                    <table className="w-full table-fixed text-xs border-collapse category-print-table">
                      <thead className="bg-[#FFF4E6] border-b border-border-temple">
                        <tr className="text-text-main font-normal uppercase">
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Item Name</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Rate</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Opening Stock</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Added</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Used</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Usage Value</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Purchase Ret.</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Adjust</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Closing Stock</th>
                          <th className="px-3 py-2 text-left whitespace-normal break-words">Closing Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-temple/10">
                        {rows.map((row) => (
                          <tr key={row.item_id} className="hover:bg-bg-temple/10 transition-colors">
                            <td className="px-3 py-2 border-r border-border-temple/10 font-medium text-text-main whitespace-normal break-words">{row.item_name}</td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main">{formatCurrency(row.rate)}</td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.opening_balance} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.purchase_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.issue_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-nowrap">{formatCurrency(row.issue_value)}</td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.purchase_return_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.stock_adjustment_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 font-bold text-text-main whitespace-normal break-words"><QtyDisplay qty={row.closing_stock} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 text-text-main whitespace-nowrap">{formatCurrency(row.closing_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tbody className="bg-[#FAF7F2] font-black text-[11px] border-t-2 border-border-temple/20">
                        <tr className="text-primary">
                          <td colSpan={2} className="px-3 py-3 border-r border-border-temple/10 uppercase tracking-tighter">TOTAL</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{rows.reduce((a, b) => a + Number(b.opening_balance || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{rows.reduce((a, b) => a + Number(b.purchase_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{rows.reduce((a, b) => a + Number(b.issue_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{formatCurrency(rows.reduce((a, b) => a + Number(b.issue_value || 0), 0))}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{rows.reduce((a, b) => a + Number(b.purchase_return_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{rows.reduce((a, b) => a + Number(b.stock_adjustment_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{rows.reduce((a, b) => a + Number(b.closing_stock || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 text-secondary whitespace-nowrap font-black">{formatCurrency(rows.reduce((a, b) => a + Number(b.closing_value || 0), 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              {grandTotals && (
                <div className="report-table-wrap overflow-x-auto print:overflow-visible rounded-xl border border-border-temple shadow-sm bg-white mt-8">
                  <table className="w-full table-fixed text-xs border-collapse">
                    <tbody className="bg-[#FAF3E7] border-t-2 border-border-temple/60 text-black">
                      <tr className="grand-total-row font-black text-[13px]">
                        <td colSpan={2} className="px-3 py-5 border-r border-black/10 text-left uppercase tracking-[0.2em]">GRAND TOTAL</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{grandTotals.opening.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{grandTotals.purchase.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{grandTotals.issues.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{formatCurrency(grandTotals.issue_val)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{grandTotals.returns.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{grandTotals.adjust.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap">{grandTotals.closing.toFixed(3)}</td>
                        <td className="px-3 py-5 text-left whitespace-nowrap">{formatCurrency(grandTotals.closing_val)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
          }
        </div>

        {reportData?.footer && (
          <div className="compact-print-summary hidden">
            <div className="compact-print-block">
              <div className="compact-print-heading">Day Snapshot</div>
              <div className="compact-print-line">
                <span>No. of Mahaprasada Devotees</span>
                <b>{devotees.toLocaleString()}</b>
              </div>
              <div className="compact-print-line">
                <span>No. of Times Cooked</span>
                <b>{timesCooked}</b>
              </div>
            </div>
            <div className="compact-print-block">
              <div className="compact-print-heading">Wastage</div>
              {activeWastageRows.length === 0 ? (
                <div className="compact-print-muted">No wastage recorded.</div>
              ) : (
                <div className="compact-print-wastage-list">
                  {activeWastageRows.map((w) => (
                    <React.Fragment key={`compact-waste-${w.item_name}`}>
                      <span>{w.item_name}</span>
                      <b>
                        <QtyDisplay qty={w.qty} digits={3} unit={unitByItemName.get(w.item_name) || unitByMenuItemName.get(w.item_name) || ''} />
                      </b>
                      <b>{formatCurrency(w.amount)}</b>
                    </React.Fragment>
                  ))}
                </div>
              )}
              <div className="compact-print-total">Total Wastage: {formatCurrency(wastageTotal || 0)}</div>
            </div>
          </div>
        )}

        {reportData?.footer && (
          <div className="canteen-footer-summary p-4 border-t border-border-temple print:hidden" style={{ pageBreakInside: 'avoid' }}>
            <div className="canteen-footer-inner max-w-3xl w-full">
              <div className="canteen-footer-grid grid items-start gap-3 grid-cols-1 md:grid-cols-2 print:grid-cols-2">
                
                {/* Day Snapshot Table (Printed directly with small size rules) */}
                <div className="canteen-footer-box overflow-x-auto rounded-md border border-border-temple shadow-sm bg-white print:break-inside-avoid">
                  <table className="w-full table-auto border-collapse snapshot-table print:text-[8px]">
                    <thead className="bg-[#FAF7F2] border-b border-border-temple">
                      <tr className="text-text-main font-normal uppercase">
                        <th colSpan={2} className="px-2.5 py-1.5 text-left text-primary text-[12px] print:text-[8px] print:font-bold print:uppercase">Day Snapshot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-temple/40">
                      {[
                        ['No. of Mahaprasada Devotees', devotees.toLocaleString()],
                        ['Regular Cooking Persons', Number(footer?.regular_cooking_persons ?? 0)],
                        ['Additional Cooking Persons', Number(footer?.additional_cooking_persons ?? 0)],
                        ['Total Cooking Persons', Number(footer?.total_cooking_persons ?? 0)],
                        ['Regular Serving Persons', Number(footer?.regular_serving_persons ?? 0)],
                        ['Additional Serving Persons', Number(footer?.additional_serving_persons ?? 0)],
                        ['Total Serving Persons', Number(footer?.total_serving_persons ?? 0)],
                        ['Regular Cleaning Persons', Number(footer?.regular_cleaning_persons ?? 0)],
                        ['Additional Cleaning Persons', Number(footer?.additional_cleaning_persons ?? 0)],
                        ['Total Cleaning Persons', Number(footer?.total_cleaning_persons ?? 0)],
                        ['No. of Times Cooked', timesCooked]
                      ].filter(([label]) => {
                        if (hasAdditionalManpower) return true;
                        return label === 'No. of Mahaprasada Devotees' || label === 'No. of Times Cooked';
                      }).map(([label, value]) => (
                        <tr key={`snapshot-${label}`} className={`hover:bg-gray-50/50 transition-colors ${label === 'No. of Mahaprasada Devotees' ? 'devotees-row' : ''}`}>
                          <td className="border-r border-border-temple font-medium px-3 py-1.5 print:text-[8px] print:py-0.5 print:px-1">{label}</td>
                          <td className="text-left font-normal px-3 py-1.5 print:text-[8px] print:py-0.5 print:px-1">
                            {value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Screen View Wastage Table (hidden on print) */}
                <div className="canteen-footer-box overflow-x-auto rounded-md border border-border-temple shadow-sm bg-white max-w-xl print:hidden">
                  <table className="w-full table-auto border-collapse wastage-table">
                    <thead className="bg-[#FAF7F2] border-b border-border-temple">
                      <tr className="text-text-main font-normal uppercase">
                        <th colSpan={3} className="px-2.5 py-1.5 text-left text-primary text-[12px]">Wastage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-temple/40">
                      {activeWastageRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-2.5 py-3 text-center text-text-main/60 font-medium">
                            No wastage recorded.
                          </td>
                        </tr>
                      ) : (
                        activeWastageRows.map((w) => (
                          <tr key={w.item_name} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-2.5 py-1 border-r border-border-temple font-normal whitespace-normal break-words" title={w.item_name}>{w.item_name}</td>
                            <td className="px-2.5 py-1 border-r border-border-temple text-left font-normal whitespace-nowrap">
                              <QtyDisplay qty={w.qty} digits={3} unit={unitByItemName.get(w.item_name) || unitByMenuItemName.get(w.item_name) || ''} />
                            </td>
                            <td className="px-2.5 py-1 text-left font-normal whitespace-nowrap">{formatCurrency(w.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tbody className="bg-white border-t border-border-temple">
                      <tr className="highlight-row">
                        <td colSpan={2} className="border-r border-border-temple text-left font-bold">Total Wastage</td>
                        <td className="text-left font-bold">{formatCurrency(wastageTotal || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Print View: Split 2-Column Wastage Table (only visible on print to save vertical space) */}
                {(() => {
                  const halfLength = Math.ceil(activeWastageRows.length / 2);
                  const leftWastageRows = activeWastageRows.slice(0, halfLength);
                  const rightWastageRows = activeWastageRows.slice(halfLength);
                  return (
                    <div className="canteen-footer-box hidden print:block overflow-x-auto rounded-md border border-border-temple bg-white w-full print:break-inside-avoid">
                      <table className="w-full table-auto border-collapse wastage-table">
                        <thead className="bg-[#FAF7F2] border-b border-border-temple">
                          <tr className="text-text-main font-normal uppercase">
                            <th colSpan={6} className="px-2.5 py-1 text-left text-primary text-[8px] print:text-black">Wastage Summary</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {/* Left Side Sub-Table */}
                            <td className={`p-0 align-top ${activeWastageRows.length === 0 ? 'w-full' : 'border-r border-border-temple w-1/2'}`}>
                              <table className="w-full table-auto border-collapse wastage-table" style={{ tableLayout: 'auto' }}>
                                <tbody className="divide-y divide-border-temple/40">
                                  {leftWastageRows.length === 0 ? (
                                    <tr>
                                      <td colSpan={3} className="px-2 py-1.5 text-left text-text-main/70">No wastage recorded.</td>
                                    </tr>
                                  ) : (
                                    leftWastageRows.map((w) => (
                                      <tr key={`print-l-${w.item_name}`}>
                                        <td className="px-2 py-1 border-r border-border-temple text-left font-normal whitespace-normal break-words" title={w.item_name}>{w.item_name}</td>
                                        <td className="px-2 py-1 border-r border-border-temple text-left font-normal whitespace-nowrap">
                                          <QtyDisplay qty={w.qty} digits={3} unit={unitByItemName.get(w.item_name) || unitByMenuItemName.get(w.item_name) || ''} />
                                        </td>
                                        <td className="px-2 py-1 text-left font-normal whitespace-nowrap">{formatCurrency(w.amount)}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </td>
                            {/* Right Side Sub-Table */}
                            <td className={`p-0 align-top w-1/2 ${activeWastageRows.length === 0 ? 'hidden' : ''}`}>
                              <table className="w-full table-auto border-collapse wastage-table" style={{ tableLayout: 'auto' }}>
                                <tbody className="divide-y divide-border-temple/40">
                                  {rightWastageRows.map((w) => (
                                    <tr key={`print-r-${w.item_name}`}>
                                      <td className="px-2 py-1 border-r border-border-temple text-left font-normal whitespace-normal break-words" title={w.item_name}>{w.item_name}</td>
                                      <td className="px-2 py-1 border-r border-border-temple text-left font-normal whitespace-nowrap">
                                        <QtyDisplay qty={w.qty} digits={3} unit={unitByItemName.get(w.item_name) || unitByMenuItemName.get(w.item_name) || ''} />
                                      </td>
                                      <td className="px-2 py-1 text-left font-normal whitespace-nowrap">{formatCurrency(w.amount)}</td>
                                    </tr>
                                  ))}
                                  {rightWastageRows.length < leftWastageRows.length && (
                                    <tr>
                                      <td colSpan={3} className="px-2 py-1 text-center text-text-main/20"></td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                        <tfoot className="bg-white border-t border-border-temple">
                          <tr className="highlight-row">
                            <td colSpan={6} className="px-3 py-1 text-right font-bold text-[9px] print:text-[8px]">
                              Total Wastage: {formatCurrency(wastageTotal || 0)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        )}
        </div>

      <div className="hidden print:hidden font-sans">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold font-temple">ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ (ಅನ್ನದಾನ)</h1>
          <div className="text-md font-bold uppercase tracking-widest mt-1">
            MAHAPRASAD SUMMARY REPORT : <span className="font-black underline">{formatDate(fromDate)} to {formatDate(toDate)}</span>
          </div>
        </div>

        <div className="space-y-8">
            {groupedRows.map(([categoryName, rows]) =>
          <div key={`print-group-${categoryName}`} className="space-y-2" style={{ pageBreakInside: 'avoid' }}>
                    <div className="flex items-center gap-2 border-b-2 border-black pb-1">
                        <h2 className="text-sm font-black uppercase tracking-widest">{categoryName}</h2>
                    </div>
                    <table className="w-full table-auto text-[9px] border-collapse border border-black">
                        <thead>
                            <tr className="bg-gray-100 font-bold uppercase">
                                <th className="border border-black px-2 py-1 text-left">Item Name</th>
                                <th className="border border-black px-2 py-1 text-left">Rate</th>
                                <th className="border border-black px-2 py-1 text-left">Opening Stock</th>
                                <th className="border border-black px-2 py-1 text-left">Stock Added</th>
                                <th className="border border-black px-2 py-1 text-left">Stock Used</th>
                                <th className="border border-black px-2 py-1 text-left">Usage Value</th>
                                <th className="border border-black px-2 py-1 text-left">Returned</th>
                                <th className="border border-black px-2 py-1 text-left">Adjust</th>
                                <th className="border border-black px-2 py-1 text-left bg-gray-50">Closing Stock</th>
                                <th className="border border-black px-2 py-1 text-left bg-gray-50">Closing Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) =>
                <tr key={`print-row-${row.item_id}`}>
                                    <td className="border border-black px-2 py-1 font-bold">{row.item_name}</td>
                                    <td className="border border-black px-2 py-1 text-left italic">₹{Number(row.rate).toLocaleString()}</td>
                                    <td className="border border-black px-2 py-1 text-left">{Number(row.opening_balance).toFixed(3)}</td>
                                    <td className="border border-black px-2 py-1 text-left">{Number(row.purchase_qty).toFixed(3)}</td>
                                    <td className="border border-black px-2 py-1 text-left">{Number(row.issue_qty).toFixed(3)}</td>
                                    <td className="border border-black px-2 py-1 text-left font-semibold">₹{Number(row.issue_value).toLocaleString()}</td>
                                    <td className="border border-black px-2 py-1 text-left">{Number(row.purchase_return_qty || 0).toFixed(3)}</td>
                                    <td className="border border-black px-2 py-1 text-left">{Number(row.stock_adjustment_qty || 0).toFixed(3)}</td>
                                    <td className="border border-black px-2 py-1 text-left font-black bg-gray-50"><QtyDisplay qty={row.closing_stock} digits={3} unit={row.unit} /></td>
                                    <td className="border border-black px-2 py-1 text-left font-black bg-gray-50">₹{Number(row.closing_value).toLocaleString()}</td>
                                </tr>
                )}
                        </tbody>
                        <tbody className="bg-gray-50 font-black border-t-2 border-black">
                            <tr>
                                <td colSpan={2} className="border border-black px-2 py-1 text-[8px] uppercase">Category Totals</td>
                                <td className="border border-black px-2 py-1 text-left">{rows.reduce((a, b) => a + Number(b.opening_balance), 0).toFixed(3)}</td>
                                <td className="border border-black px-2 py-1 text-left">{rows.reduce((a, b) => a + Number(b.purchase_qty), 0).toFixed(3)}</td>
                                <td className="border border-black px-2 py-1 text-left">{rows.reduce((a, b) => a + Number(b.issue_qty), 0).toFixed(3)}</td>
                                <td className="border border-black px-2 py-1 text-left">₹{rows.reduce((a, b) => a + Number(b.issue_value), 0).toLocaleString()}</td>
                                <td className="border border-black px-2 py-1 text-left">{rows.reduce((a, b) => a + Number(b.purchase_return_qty || 0), 0).toFixed(3)}</td>
                                <td className="border border-black px-2 py-1 text-left">{rows.reduce((a, b) => a + Number(b.stock_adjustment_qty || 0), 0).toFixed(3)}</td>
                                <td className="border border-black px-2 py-1 text-left">{rows.reduce((a, b) => a + Number(b.closing_stock), 0).toFixed(3)}</td>
                                <td className="border border-black px-2 py-1 text-left">₹{rows.reduce((a, b) => a + Number(b.closing_value), 0).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
          )}
        </div>

        {grandTotals &&
        <div className="mt-8 border-t-4 border-black pt-4" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-black uppercase tracking-widest mb-4">Grand Summary Totals</h3>
                <table className="w-full text-[10px] border-collapse border-2 border-black">
                    <tbody>
                        <tr className="bg-gray-100 font-black">
                            <td className="border border-black px-3 py-2">TOTAL OPENING</td>
                            <td className="border border-black px-3 py-2 text-left">{grandTotals.opening.toFixed(3)}</td>
                            <td className="border border-black px-3 py-2">TOTAL PURCHASE</td>
                            <td className="border border-black px-3 py-2 text-left">{grandTotals.purchase.toFixed(3)}</td>
                        </tr>
                        <tr className="bg-white font-black">
                            <td className="border border-black px-3 py-2 text-orange-900">TOTAL STOCK USED</td>
                            <td className="border border-black px-3 py-2 text-left text-orange-900">{grandTotals.issues.toFixed(3)}</td>
                            <td className="border border-black px-3 py-2 text-orange-900">TOTAL USAGE VALUE</td>
                            <td className="border border-black px-3 py-2 text-left text-orange-900">₹{grandTotals.issue_val.toLocaleString()}</td>
                        </tr>
                        <tr className="bg-gray-50 font-black text-lg">
                            <td className="border border-black px-3 py-2 underline">GRAND BALANCE</td>
                            <td className="border border-black px-3 py-2 text-left underline">{grandTotals.closing.toFixed(3)}</td>
                            <td className="border border-black px-3 py-2 underline">GRAND TOTAL VALUE</td>
                            <td className="border border-black px-3 py-2 text-left underline">₹{grandTotals.closing_val.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        }

        <table className="w-full mt-2 text-[8px] border-collapse border border-black footer-table" style={{ pageBreakInside: 'avoid' }}>
          <thead>
            <tr className="bg-gray-100 uppercase font-bold footer-section-title">
              <th className="border border-black p-1 text-left">Daily Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black p-2 align-top footer-section-cell">
                <div className="footer-summary-grid">
                  <b>No. of Mahaprasada Devotees</b> 
                  <span className="font-bold">: {devotees}</span>
                  <b>No. of Times Cooked</b> 
                  <span className="font-bold">: {timesCooked}</span>
                </div>
              </td>
            </tr>
          </tbody>
          <tbody>
            {hasAdditionalManpower && (
              <>
                <tr className="bg-gray-100 uppercase font-bold footer-section-title">
                  <th className="border border-black p-1 text-left">Manpower</th>
                </tr>
                <tr>
                  <td className="border border-black p-2 align-top footer-section-cell">
                    <div className="footer-manpower-grid">
                      {personRows.map(([label, value]) =>
                      <div key={`print-person-${label}`} className="footer-metric-row">
                          <span>{label}</span>
                          <span className="font-bold">: {fmt2(value)}</span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              </>
            )}
            <tr className="bg-gray-100 uppercase font-bold footer-section-title">
              <th className="border border-black p-1 text-left">Wastage</th>
            </tr>
            <tr>
              <td className="border border-black p-2 align-top footer-section-cell">
                <div className="flex flex-col h-full">
                  <div className="footer-wastage-grid flex-1">
                    {activeWastageRows.length === 0 ? (
                      <div className="text-gray-500 italic py-1 text-[7px]">No wastage recorded (all zero).</div>
                    ) : (
                      activeWastageRows.map((w) => (
                        <div key={`print-waste-${w.item_name}`} className="footer-metric-row">
                          <span title={w.item_name}>{w.item_name}</span>
                          <span className="font-semibold">: {Number(w.qty).toFixed(3)} {unitByItemName.get(w.item_name) || unitByMenuItemName.get(w.item_name) || ''}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="text-left font-bold mt-2 pt-1 border-t border-black text-[9px]">
                    Total Wastage: {formatCurrency(wastageTotal || 0)}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>);

};

export default CanteenSummaryPage;
