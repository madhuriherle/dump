import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter } from 'lucide-react';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import { PrinterSelectDropdown } from '../components/PrinterSelectDropdown';
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

export const StockSummaryPage = () => {
  const { showError } = useNotification();
  const [dateFilterMode, setDateFilterMode] = useState('today');
  const [customFromDate, setCustomFromDate] = useState(getTodayDateInput());
  const [customToDate, setCustomToDate] = useState(getTodayDateInput());
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

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
    queryKey: ['detailed-stock-summary', fromDate, toDate],
    queryFn: async () => {
      const res = await api.get('/reports/get_detailed_stock_summary', {
        params: { from_date: fromDate, to_date: toDate }
      });
      return res.data;
    }
  });

  const { data: itemsData } = useQuery({
    queryKey: ['items-list-all-stock-summary'],
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
      // Sort by category name first
      const catA = a.category_name || 'Uncategorized';
      const catB = b.category_name || 'Uncategorized';
      const catComp = catA.localeCompare(catB);
      if (catComp !== 0) return catComp;

      // Within category, sort by code
      const codeA = itemCodeMap[a.item_name] ?? 999;
      const codeB = itemCodeMap[b.item_name] ?? 999;
      if (codeA !== codeB) return codeA - codeB;

      // Then by name
      return String(a.item_name || '').localeCompare(String(b.item_name || ''));
    });
  }, [reportData, itemCodeMap]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    orderedRows.forEach((row) => set.add(row.category_name || 'Uncategorized'));
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [orderedRows]);

  const filteredRows = useMemo(() => {
    if (selectedCategory === 'ALL') return orderedRows;
    return orderedRows.filter((row) => (row.category_name || 'Uncategorized') === selectedCategory);
  }, [orderedRows, selectedCategory]);

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

  return (
    <div className="space-y-6 print:space-y-2 stock-summary-print">
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
          .stock-summary-print { padding-top: 8mm !important; background: #ffffff !important; background-color: #ffffff !important; }
          .stock-summary-print, .stock-summary-print * { overflow: visible !important; }
          .stock-summary-print,
          .stock-summary-print div,
          .stock-summary-print section,
          .stock-summary-print table,
          .stock-summary-print thead,
          .stock-summary-print tbody,
          .stock-summary-print tfoot,
          .stock-summary-print tr,
          .stock-summary-print th,
          .stock-summary-print td {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          .stock-summary-print table { table-layout: fixed; width: 100%; border-collapse: separate !important; border-spacing: 0 !important; border: 1px solid #d7c9ba !important; outline: 1px solid #d7c9ba !important; outline-offset: -1px !important; }
          .stock-summary-print table .hidden {
            display: table-cell !important;
          }
          .stock-summary-print thead { display: table-header-group !important; }
          .stock-summary-print tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .stock-summary-print .category-print-section { break-inside: avoid-page !important; page-break-inside: avoid !important; }
          .stock-summary-print .category-print-title { break-after: avoid !important; page-break-after: avoid !important; }
          .stock-summary-print .category-print-table thead { display: table-header-group !important; }
          .stock-summary-print .category-print-table tbody tr:first-child { break-inside: avoid !important; page-break-inside: avoid !important; }
          .stock-summary-print th, .stock-summary-print td { padding: 7px !important; font-size: 12px !important; border: 0 !important; border-left: 1px solid #d7c9ba !important; border-top: 1px solid #d7c9ba !important; border-right: 1px solid #d7c9ba !important; border-bottom: 1px solid #d7c9ba !important; }
          .stock-summary-print thead th, .stock-summary-print thead th * { font-size: 12px !important; line-height: 1.05 !important; padding-top: 7px !important; padding-bottom: 7px !important; }
          .stock-summary-print table thead tr,
          .stock-summary-print table thead tr *,
          .stock-summary-print table thead th {
            font-size: 12px !important;
            line-height: 1.05 !important;
          }
          .stock-summary-print tbody td { border-top: 1px solid #d7c9ba !important; }
          .stock-summary-print th:last-child, .stock-summary-print td:last-child { border-right: 1px solid #d7c9ba !important; }
          .stock-summary-print tfoot td { border: 1px solid #cab7a4 !important; }
          .stock-summary-print .stock-summary-report-card,
          .stock-summary-print .report-table-wrap {
            border: none !important;
            box-shadow: none !important;
          }
          .stock-summary-print .stock-summary-print-header {
            border-bottom: none !important;
          }
          .stock-summary-print .shadow-sm,
          .stock-summary-print .shadow,
          .stock-summary-print .shadow-lg,
          .stock-summary-print .shadow-xl,
          .stock-summary-print .shadow-2xl {
            box-shadow: none !important;
          }
          .stock-summary-print .grand-total-row td { border-top: 2px solid #bfa892 !important; border-bottom: 1px solid #bfa892 !important; font-size: 13px !important; }
          .stock-summary-print table th:nth-child(1),
          .stock-summary-print table td:nth-child(1) { width: 18% !important; }
          .stock-summary-print table th:nth-child(2),
          .stock-summary-print table td:nth-child(2) { width: 8% !important; }
          .stock-summary-print table th:nth-child(n+3),
          .stock-summary-print table td:nth-child(n+3) { width: 9.25% !important; }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>Stock Summary Report</h2>
        </div>
        <PrinterSelectDropdown
          context="REPORT_STOCK"
          onPrint={handlePrint}
          buttonLabel="Print"
        />
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


            </div>

          </div>
        </CardContent>
      </Card>

      <div className="stock-summary-report-card bg-white border border-border-temple rounded-lg overflow-hidden shadow-sm print:border-none print:shadow-none">
        <div className="stock-summary-print-header p-6 text-center border-b border-border-temple/40 print:pb-2">
          <h1 className="text-xl font-bold text-text-main uppercase font-temple">ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ (ಅನ್ನದಾನ)</h1>
          <p className="text-sm font-bold text-text-main mt-1">
            STOCK SUMMARY REPORT FOR :{' '}
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
                  <tr className="text-text-main font-bold uppercase">
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Item Name</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Rate</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Opening Stock</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Added</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Used</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Usage Value</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Purchase Ret.</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Stock Adjust</th>
                    <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Closing Stock</th>
                    <th className="px-3 py-2 text-left whitespace-normal break-words hidden sm:table-cell">Closing Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-temple/10">
                  {filteredRows.map((row) => (
                    <tr key={row.item_id} className="hover:bg-bg-temple/10 transition-colors">
                      <td className="px-3 py-2 border-r border-border-temple/10 font-medium text-text-main whitespace-normal break-words">{row.item_name}</td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main hidden sm:table-cell">{formatCurrency(row.rate)}</td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.opening_balance} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.purchase_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.issue_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-nowrap hidden sm:table-cell">{formatCurrency(row.issue_value)}</td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words hidden sm:table-cell"><QtyDisplay qty={row.purchase_return_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words hidden sm:table-cell"><QtyDisplay qty={row.stock_adjustment_qty} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 border-r border-border-temple/10 font-bold text-text-main whitespace-normal break-words"><QtyDisplay qty={row.closing_stock} digits={3} unit={row.unit} /></td>
                      <td className="px-3 py-2 text-text-main whitespace-nowrap hidden sm:table-cell">{formatCurrency(row.closing_value)}</td>
                    </tr>
                  ))}
                </tbody>
                {grandTotals && (
                <tbody className="bg-[#FAF3E7] border-t-2 border-border-temple/60 text-black">
                  <tr className="grand-total-row font-extrabold text-[13px]">
                    <td colSpan={2} className="px-3 py-5 border-r border-black/10 text-left uppercase tracking-[0.2em] !font-extrabold">GRAND TOTAL</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words !font-extrabold">{grandTotals.opening.toFixed(3)}</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words !font-extrabold">{grandTotals.purchase.toFixed(3)}</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words !font-extrabold">{grandTotals.issues.toFixed(3)}</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap !font-extrabold">{formatCurrency(grandTotals.issue_val)}</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words !font-extrabold">{grandTotals.returns.toFixed(3)}</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words !font-extrabold">{grandTotals.adjust.toFixed(3)}</td>
                    <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words !font-extrabold">{grandTotals.closing.toFixed(3)}</td>
                    <td className="px-3 py-5 text-left whitespace-nowrap !font-extrabold">{formatCurrency(grandTotals.closing_val)}</td>
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
                        <tr className="text-text-main font-bold uppercase">
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Item Name</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Rate</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Opening Stock</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Added</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Stock Used</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Usage Value</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Purchase Ret.</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words hidden sm:table-cell">Stock Adjust</th>
                          <th className="px-3 py-2 border-r border-border-temple/40 text-left whitespace-normal break-words">Closing Stock</th>
                          <th className="px-3 py-2 text-left whitespace-normal break-words hidden sm:table-cell">Closing Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-temple/10">
                        {rows.map((row) => (
                          <tr key={row.item_id} className="hover:bg-bg-temple/10 transition-colors">
                            <td className="px-3 py-2 border-r border-border-temple/10 font-medium text-text-main whitespace-normal break-words">{row.item_name}</td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main hidden sm:table-cell">{formatCurrency(row.rate)}</td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.opening_balance} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.purchase_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words"><QtyDisplay qty={row.issue_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-nowrap hidden sm:table-cell">{formatCurrency(row.issue_value)}</td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words hidden sm:table-cell"><QtyDisplay qty={row.purchase_return_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 text-text-main whitespace-normal break-words hidden sm:table-cell"><QtyDisplay qty={row.stock_adjustment_qty} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 border-r border-border-temple/10 font-bold text-text-main whitespace-normal break-words"><QtyDisplay qty={row.closing_stock} digits={3} unit={row.unit} /></td>
                            <td className="px-3 py-2 text-text-main whitespace-nowrap hidden sm:table-cell">{formatCurrency(row.closing_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tbody className="bg-[#FAF7F2] font-black text-[11px] border-t-2 border-border-temple/20">
                        <tr className="text-primary">
                          <td colSpan={2} className="px-3 py-3 border-r border-border-temple/10 uppercase tracking-tighter">TOTAL</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-normal break-words">{rows.reduce((a, b) => a + Number(b.opening_balance || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-normal break-words">{rows.reduce((a, b) => a + Number(b.purchase_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-normal break-words">{rows.reduce((a, b) => a + Number(b.issue_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-nowrap">{formatCurrency(rows.reduce((a, b) => a + Number(b.issue_value || 0), 0))}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-normal break-words">{rows.reduce((a, b) => a + Number(b.purchase_return_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-normal break-words">{rows.reduce((a, b) => a + Number(b.stock_adjustment_qty || 0), 0).toFixed(3)}</td>
                          <td className="px-3 py-3 border-r border-border-temple/10 text-black whitespace-normal break-words">{rows.reduce((a, b) => a + Number(b.closing_stock || 0), 0).toFixed(3)}</td>
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
                        <td colSpan={2} className="px-3 py-5 border-r border-black/10 text-left uppercase tracking-[0.2em] font-black">GRAND TOTAL</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words font-black">{grandTotals.opening.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words font-black">{grandTotals.purchase.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words font-black">{grandTotals.issues.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-nowrap font-black">{formatCurrency(grandTotals.issue_val)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words font-black">{grandTotals.returns.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words font-black">{grandTotals.adjust.toFixed(3)}</td>
                        <td className="px-3 py-5 border-r border-black/10 text-left whitespace-normal break-words font-black">{grandTotals.closing.toFixed(3)}</td>
                        <td className="px-3 py-5 text-left whitespace-nowrap font-black text-secondary">{formatCurrency(grandTotals.closing_val)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
          }
        </div>

      </div>
    </div>);

};

export default StockSummaryPage;

