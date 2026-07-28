import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import { PrinterSelectDropdown } from '../components/PrinterSelectDropdown';

import { Label } from '../components/ui/Label';
import { Card, CardContent } from '../components/ui/Card';

import { cn } from '../utils/cn';

const ManpowerReportPage = () => {
  const { showError } = useNotification();

  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const { fromDate, toDate } = useMemo(() => {
    if (selectedMonth === 'ALL') {
      return {
        fromDate: `${selectedYear}-01-01`,
        toDate: `${selectedYear}-12-31`
      };
    }
    const m = parseInt(selectedMonth);
    const first = new Date(selectedYear, m, 1);
    const last = new Date(selectedYear, m + 1, 0);

    // Adjust for local timezone
    const firstStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}-01`;
    const lastStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;

    return { fromDate: firstStr, toDate: lastStr };
  }, [selectedYear, selectedMonth]);

  const reportGroupBy = useMemo(() => selectedMonth === 'ALL' ? 'month' : 'day', [selectedMonth]);

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['manpower-summary', fromDate, toDate, reportGroupBy],
    queryFn: async () => {
      try {
        const res = await api.get('/reports/get_manpower_summary', {
          params: { from_date: fromDate, to_date: toDate, group_by: reportGroupBy }
        });
        return res.data;
      } catch (err) {
        showError(err.response?.data?.detail || 'Failed to load report data');
        throw err;
      }
    }
  });

  const months = [
  { label: 'All Months', value: 'ALL' },
  { label: 'January', value: '0' },
  { label: 'February', value: '1' },
  { label: 'March', value: '2' },
  { label: 'April', value: '3' },
  { label: 'May', value: '4' },
  { label: 'June', value: '5' },
  { label: 'July', value: '6' },
  { label: 'August', value: '7' },
  { label: 'September', value: '8' },
  { label: 'October', value: '9' },
  { label: 'November', value: '10' },
  { label: 'December', value: '11' }];


  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const handlePrint = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
      showError('No data available to print');
      return;
    }
    window.print();
  };

  const grandTotals = useMemo(() => {
    if (!reportData || !reportData.rows) return null;
    return reportData.rows.reduce((acc, row) => ({
      regular_cooking: acc.regular_cooking + row.regular_cooking,
      additional_cooking: acc.additional_cooking + row.additional_cooking,
      total_cooking: acc.total_cooking + row.total_cooking,
      regular_serving: acc.regular_serving + row.regular_serving,
      additional_serving: acc.additional_serving + row.additional_serving,
      total_serving: acc.total_serving + row.total_serving,
      regular_cleaning: acc.regular_cleaning + row.regular_cleaning,
      additional_cleaning: acc.additional_cleaning + row.additional_cleaning,
      total_cleaning: acc.total_cleaning + row.total_cleaning
    }), {
      regular_cooking: 0,
      additional_cooking: 0,
      total_cooking: 0,
      regular_serving: 0,
      additional_serving: 0,
      total_serving: 0,
      regular_cleaning: 0,
      additional_cleaning: 0,
      total_cleaning: 0
    });
  }, [reportData]);

  const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const formatTimeline = (period) => {
    const parts = period.split('-');
    if (parts.length === 3) {
      // YYYY-MM-DD to DD-MM-YYYY
      const [year, month, day] = parts;
      return `${day}-${month}-${year}`;
    }
    if (parts.length === 2) {
      // YYYY-MM
      const [year, month] = parts;
      return `${months[parseInt(month)].label} ${year}`;
    }
    return period;
  };

  return (
    <div className="space-y-6 print:space-y-2 manpower-report-print">
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
          .manpower-report-print { padding-top: 5mm !important; background: #ffffff !important; background-color: #ffffff !important; }
          .manpower-report-print,
          .manpower-report-print div,
          .manpower-report-print table,
          .manpower-report-print thead,
          .manpower-report-print tbody,
          .manpower-report-print tfoot,
          .manpower-report-print tr,
          .manpower-report-print th,
          .manpower-report-print td {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          .manpower-report-print table { border-collapse: separate !important; border-spacing: 0 !important; width: 100%; border: 1px solid #d7c9ba !important; outline: 1px solid #d7c9ba !important; outline-offset: -1px !important; }
          .manpower-report-print thead { display: table-header-group !important; }
          .manpower-report-print tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .manpower-report-print th, .manpower-report-print td { border: 0 !important; border-left: 1px solid #d7c9ba !important; border-top: 1px solid #d7c9ba !important; border-right: 1px solid #d7c9ba !important; border-bottom: 1px solid #d7c9ba !important; padding: 7px !important; font-size: 12px !important; }
          .manpower-report-print tbody td { border-top: 1px solid #d7c9ba !important; }
          .manpower-report-print th:last-child, .manpower-report-print td:last-child { border-right: 1px solid #d7c9ba !important; }
          .manpower-report-print th { border-top: 1px solid #d7c9ba !important; background-color: #ffffff !important; }
          .manpower-report-print tfoot td { border: 1px solid #cab7a4 !important; font-size: 13px !important; }
          .manpower-report-print .grand-total-row td { font-size: 13px !important; }
          .manpower-report-print .manpower-report-card,
          .manpower-report-print .report-table-wrap {
            border: none !important;
            box-shadow: none !important;
          }
          .manpower-report-print .manpower-print-header {
            border-bottom: none !important;
          }
          .manpower-report-print .shadow-sm,
          .manpower-report-print .shadow,
          .manpower-report-print .shadow-lg,
          .manpower-report-print .shadow-xl,
          .manpower-report-print .shadow-2xl {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <h2 className="page-title">{selectedMonth === 'ALL' ? 'Yearly' : 'Monthly'} Manpower Report</h2>
        <PrinterSelectDropdown
          context="REPORT_MANPOWER"
          onPrint={handlePrint}
          buttonLabel="Print"
        />
      </div>

      <Card className="border-border-temple print:hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-6 items-end">
            <div className="space-y-1.5 min-w-[180px]">
              <Label className="text-text-main font-medium">Report Year</Label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-10 w-full rounded-md border border-border-temple/50 bg-white px-3 text-sm text-text-main outline-none focus:border-border-temple/50 transition-all">
                
                {years.map((year) =>
                <option key={year} value={year}>{year}</option>
                )}
              </select>
            </div>
            <div className="space-y-1.5 min-w-[240px]">
              <Label className="text-text-main font-medium">Report Month</Label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-10 w-full rounded-md border border-border-temple/50 bg-white px-3 text-sm text-text-main outline-none focus:border-border-temple/50 transition-all">
                
                {months.map((m) =>
                <option key={m.value} value={m.value}>{m.label}</option>
                )}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="manpower-report-card bg-white border border-border-temple rounded-lg overflow-hidden shadow-sm">
        <div className="manpower-print-header p-6 text-center border-b border-border-temple/40 print:pb-2">
          <h1 className="text-xl font-bold text-text-main uppercase font-temple">ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ</h1>
          <p className="text-sm font-bold text-text-main mt-1 uppercase tracking-wider">
            {selectedMonth === 'ALL' ? 'YEARLY' : 'MONTHLY'} MANPOWER REPORT — {selectedMonth === 'ALL' ? `YEAR ${selectedYear}` : `${String(parseInt(selectedMonth) + 1).padStart(2, '0')}-${selectedYear}`}
          </p>
        </div>

        <div className="p-6">
          {isLoading ?
          <div className="py-20 text-center">
              <div className="flex items-center justify-center gap-2 text-text-main">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-lg font-bold">Loading report data...</span>
              </div>
            </div> :
          !reportData?.rows || reportData.rows.length === 0 ?
          <div className="py-20 text-center text-text-main/60 font-bold uppercase tracking-widest border-2 border-dashed border-border-temple/40 rounded-xl">
              No data found for this period
            </div> :

          <div className="report-table-wrap overflow-x-auto rounded-lg border border-border-temple">
              <table className="w-full text-base text-left border-collapse">
                <thead>
                  {/* Category Header */}
                  <tr className="bg-white text-[#3E2723] font-bold uppercase text-xs tracking-wider border-b border-border-temple">
                    <th rowSpan={2} className="px-4 py-3 border-r border-border-temple text-left bg-white">Timeline</th>
                    <th colSpan={3} className="px-4 py-3 border-r border-border-temple text-left bg-white">Chef (Cooking)</th>
                    <th colSpan={3} className="px-4 py-3 border-r border-border-temple text-left bg-white">Serving Persons</th>
                    <th colSpan={3} className="px-4 py-3 text-left bg-white">Cleaners</th>
                  </tr>
                  {/* Sub Header */}
                  <tr className="bg-white text-text-light font-bold uppercase text-[11px] tracking-wider border-b border-border-temple">
                    <th className="px-2 py-2 border-r border-border-temple/40 text-left bg-white">Regular</th>
                    <th className="px-2 py-2 border-r border-border-temple/40 text-left bg-white">Extra</th>
                    <th className="px-2 py-2 border-r border-border-temple text-left !text-text-light font-black bg-white">Total</th>
                    
                    <th className="px-2 py-2 border-r border-border-temple/40 text-left">Reg</th>
                    <th className="px-2 py-2 border-r border-border-temple/40 text-left">Addl</th>
                    <th className="px-2 py-2 border-r border-border-temple text-left !text-text-light font-black bg-white">Total</th>
                    
                    <th className="px-2 py-2 border-r border-border-temple/40 text-left bg-white">Regular</th>
                    <th className="px-2 py-2 border-r border-border-temple/40 text-left bg-white">Extra</th>
                    <th className="px-2 py-2 text-left !text-text-light font-black bg-white">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-temple/40">
                  {reportData.rows.map((row, idx) =>
                <tr key={row.period} className={cn("hover:bg-bg-temple/10 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/20")}>
                      <td className="px-4 py-3 border-r border-border-temple/60 font-normal text-text-main">
                        {formatTimeline(row.period)}
                      </td>
                      <td className="px-2 py-3 border-r border-border-temple/30 text-left">{row.regular_cooking}</td>
                      <td className="px-2 py-3 border-r border-border-temple/30 text-left">{row.additional_cooking}</td>
                      <td className="px-2 py-3 border-r border-border-temple text-left font-bold text-text-main">{row.total_cooking}</td>
                      
                      <td className="px-2 py-3 border-r border-border-temple/30 text-left">{row.regular_serving}</td>
                      <td className="px-2 py-3 border-r border-border-temple/30 text-left">{row.additional_serving}</td>
                      <td className="px-2 py-3 border-r border-border-temple text-left font-bold text-text-main">{row.total_serving}</td>
                      
                      <td className="px-2 py-3 border-r border-border-temple/30 text-left">{row.regular_cleaning}</td>
                      <td className="px-2 py-3 border-r border-border-temple/30 text-left">{row.additional_cleaning}</td>
                      <td className="px-2 py-3 text-left font-bold text-text-main">{row.total_cleaning}</td>
                    </tr>
                )}
                </tbody>
                {grandTotals &&
                <tbody className="bg-[#FAF3E7] text-black font-black text-[15px] border-t-2 border-border-temple/60">
                    <tr className="grand-total-row text-black">
                      <td className="px-4 py-5 border-r border-black/10 text-left uppercase tracking-[0.2em] font-black">GRAND TOTAL</td>
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black">{grandTotals.regular_cooking}</td>
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black">{grandTotals.additional_cooking}</td>
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black text-black">{grandTotals.total_cooking}</td>
                      
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black">{grandTotals.regular_serving}</td>
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black">{grandTotals.additional_serving}</td>
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black text-black">{grandTotals.total_serving}</td>
                      
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black">{grandTotals.regular_cleaning}</td>
                      <td className="px-2 py-5 border-r border-black/10 text-left font-black">{grandTotals.additional_cleaning}</td>
                      <td className="px-2 py-5 text-left font-black text-black">{grandTotals.total_cleaning}</td>
                    </tr>
                  </tbody>
              }
              </table>
            </div>
          }
        </div>
      </div>
    </div>);

};

export default ManpowerReportPage;

