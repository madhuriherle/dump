import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '../api/axios';
import { useNotification } from '../context/NotificationContext';
import { PrinterSelectDropdown } from '../components/PrinterSelectDropdown';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/date';

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PurchaseReportPage = () => {
  const today = toDateInputValue(new Date());
  const firstOfMonth = toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { showError } = useNotification();
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);

  const { data: details = [], isLoading } = useQuery({
    queryKey: ['purchase-details', fromDate, toDate],
    queryFn: async () => {
      const res = await api.get('/reports/get_purchase_details', {
        params: { from_date: fromDate, to_date: toDate },
      });
      return res.data;
    },
    enabled: Boolean(fromDate && toDate),
  });

  const totals = useMemo(() => {
    return details.reduce(
      (acc, d) => ({
        count: acc.count + 1,
        amount: acc.amount + Number(d.total_amount || 0),
      }),
      { count: 0, amount: 0 }
    );
  }, [details]);

  const handlePrint = useCallback(() => {
    if (!details.length) {
      showError('No data available to print');
      return;
    }
    window.print();
  }, [details, showError]);

  return (
    <div className="space-y-6 purchase-report-print">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body, #root, main {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          header, aside, footer, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .lg\\:pl-64 { padding-left: 0 !important; }
          .purchase-report-print {
            padding: 0 !important; margin: 0 !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          .purchase-report-print { padding-top: 8mm !important; background: #ffffff !important; background-color: #ffffff !important; }
          .purchase-report-print,
          .purchase-report-print div,
          .purchase-report-print section,
          .purchase-report-print table,
          .purchase-report-print thead,
          .purchase-report-print tbody,
          .purchase-report-print tfoot,
          .purchase-report-print tr,
          .purchase-report-print th,
          .purchase-report-print td {
            background: #ffffff !important;
            background-color: #ffffff !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          .purchase-report-print .report-table-wrap {
            border: none !important;
            box-shadow: none !important;
          }
          .purchase-report-print table {
            table-layout: fixed;
            width: 100% !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            border: 1.25px solid #8f7d6d !important;
            outline: 1.25px solid #8f7d6d !important;
            outline-offset: -1px !important;
          }
          .purchase-report-print thead { display: table-header-group !important; }
          .purchase-report-print tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .purchase-report-print th,
          .purchase-report-print td {
            border: 0 !important;
            border-left: 1.25px solid #8f7d6d !important;
            border-top: 1.25px solid #8f7d6d !important;
            border-right: 1.25px solid #8f7d6d !important;
            border-bottom: 1.25px solid #8f7d6d !important;
            padding: 7px !important;
            font-size: 12px !important;
          }
          .purchase-report-print tbody td { border-top: 1.25px solid #8f7d6d !important; }
          .purchase-report-print th:last-child, .purchase-report-print td:last-child { border-right: 1.25px solid #8f7d6d !important; }
          .purchase-report-print tfoot td {
            border: 1.25px solid #8f7d6d !important;
            font-weight: 800 !important;
            font-size: 13px !important;
          }
          .purchase-report-print .shadow-sm,
          .purchase-report-print .shadow,
          .purchase-report-print .shadow-lg,
          .purchase-report-print .shadow-xl,
          .purchase-report-print .shadow-2xl {
            box-shadow: none !important;
          }
          .purchase-report-print .purchase-print-header {
            border-bottom: none !important;
          }
        }
      `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <h2 className="page-title">Purchase Report</h2>
        <PrinterSelectDropdown
          context="REPORT_PURCHASE"
          onPrint={handlePrint}
          buttonLabel="Print"
        />
      </div>

      <Card className="border-border-temple print:hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="font-medium text-text-main">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 text-text-main"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-medium text-text-main">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 text-text-main"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="report-table-wrap overflow-hidden rounded-lg border border-border-temple bg-white shadow-sm print:border-none print:shadow-none">
        <div className="purchase-print-header border-b border-border-temple/40 p-5 text-center">
          <h1 className="font-temple text-xl font-bold uppercase text-text-main">
            ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ
          </h1>
          <p className="mt-1 text-sm font-bold uppercase text-text-main">
            Purchase Report From {formatDate(fromDate)} To {formatDate(toDate)}
          </p>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border-temple bg-[#FFF4E6] text-xs font-bold uppercase tracking-wider text-text-main">
              <tr>
                <th className="border border-border-temple px-4 py-3 w-[12%]">Date</th>
                <th className="border border-border-temple px-4 py-3 w-[18%]">Vendor</th>
                <th className="border border-border-temple px-4 py-3 w-[10%]">Bill No</th>
                <th className="border border-border-temple px-4 py-3 w-[36%]">Items</th>
                <th className="border border-border-temple px-4 py-3 text-right w-[12%]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="border border-border-temple px-4 py-12 text-center text-sm font-medium text-text-light">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading purchase report...
                    </div>
                  </td>
                </tr>
              ) : details.length ? (
                details.map((d, i) => (
                  <tr key={i} className="hover:bg-[#fffaf4]">
                    <td className="border border-border-temple px-4 py-3 text-text-main whitespace-nowrap">
                      {formatDate(d.purchase_date)}
                    </td>
                    <td className="border border-border-temple px-4 py-3 text-text-main">{d.vendor_name}</td>
                    <td className="border border-border-temple px-4 py-3 text-text-main">{d.bill_no || '-'}</td>
                    <td className="border border-border-temple px-4 py-3 text-text-main">
                      {d.items.map((it, j) => (
                        <span key={j} className="block">
                          {it.item_name} - {it.quantity} × {it.price}
                        </span>
                      ))}
                    </td>
                    <td className="border border-border-temple px-4 py-3 text-right font-semibold text-text-main whitespace-nowrap">
                      {formatCurrency(d.total_amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="border border-border-temple px-4 py-12 text-center font-bold text-text-main">
                    No purchases found
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-border-temple bg-[#FAF3E7] font-black text-text-main">
              <tr>
                <td colSpan={2} className="border border-border-temple px-4 py-4 uppercase tracking-wider">Grand Total</td>
                <td className="border border-border-temple px-4 py-4">{totals.count} entries</td>
                <td className="border border-border-temple"></td>
                <td className="border border-border-temple px-4 py-4 text-right">{formatCurrency(totals.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReportPage;
