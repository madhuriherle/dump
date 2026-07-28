import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Label } from '../components/ui/Label';
import { Select } from '../components/ui/Select';
import { PrinterSelectDropdown } from '../components/PrinterSelectDropdown';
import { Button } from '../components/ui/Button';
import { formatDate } from '../utils/date';
import { QtyDisplay } from '../components/ui/QtyDisplay';
import { useAuth } from '../context/AuthContext';

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DonationReportPage = () => {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  const { data: donations, isLoading } = useQuery({
    queryKey: ['detailed-donations-report', fromDate, toDate, searchTerm, selectedItemId],
    queryFn: async () => {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (searchTerm) params.q = searchTerm;
      if (selectedItemId) params.item_id = selectedItemId;
      const res = await api.get('/reports/get_detailed_donations_report', { params });
      return res.data;
    }
  });

  const reportData = useMemo(() => {
    return donations || [];
  }, [donations]);

  const { data: itemsData } = useQuery({
    queryKey: ['items-list-all'],
    queryFn: async () => (await api.get('/items/list_items', { params: { page_size: 100 } })).data
  });

  const items = useMemo(() => {
    const list = itemsData?.items || [];
    return [...list].sort((a, b) => {
      const codeA = a?.serial_numbers?.[0]?.serial_number || '';
      const codeB = b?.serial_numbers?.[0]?.serial_number || '';
      const numA = parseInt(codeA, 10);
      const numB = parseInt(codeB, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return codeA.localeCompare(codeB);
    });
  }, [itemsData]);

  const handlePrint = () => {
    window.print();
  };

  const activeFinancialYear = user?.active_financial_year?.name || (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 3 ?
    `${year}-${(year + 1).toString().slice(-2)}` :
    `${year - 1}-${year.toString().slice(-2)}`;
  })();

  return (
    <div className="space-y-6 donation-report-print">
      <style>{`
        @media print {
          @page { 
            size: A4 landscape; 
            margin: 8mm; 
          }
          header, aside, footer, .print\\:hidden { 
            display: none !important; 
          }
          main { 
            padding: 0 !important; 
            margin: 0 !important; 
          }
          .lg\\:pl-64 { 
            padding-left: 0 !important; 
          }
          html, body, #root, main {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          body { 
            background: white !important; 
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .donation-report-print { 
            padding: 0 !important; 
            margin: 0 !important; 
            width: 100% !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          .donation-report-print, .donation-report-print * {
            overflow: visible !important;
          }
          .donation-report-print,
          .donation-report-print div,
          .donation-report-print section,
          .donation-report-print table,
          .donation-report-print thead,
          .donation-report-print tbody,
          .donation-report-print tfoot,
          .donation-report-print tr,
          .donation-report-print th,
          .donation-report-print td {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          .donation-report-print .rounded-xl { 
            border: none !important; 
            border-radius: 0 !important; 
            box-shadow: none !important;
          }
          .donation-report-print table { 
            width: 100% !important; 
            table-layout: fixed !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            border: 1px solid #d7c9ba !important;
            outline: 1px solid #d7c9ba !important;
            outline-offset: -1px !important;
          }
          .donation-report-print thead { display: table-header-group !important; }
          .donation-report-print tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .donation-report-print th, .donation-report-print td { 
            border: 0 !important;
            border-left: 1px solid #d7c9ba !important;
            border-top: 1px solid #d7c9ba !important;
            border-right: 1px solid #d7c9ba !important;
            border-bottom: 1px solid #d7c9ba !important;
            padding: 7px !important;
            font-size: 12px !important;
          }
          .donation-report-print th {
            border-top: 0 !important;
          }
          .donation-report-print tbody td {
            border-top: 1px solid #d7c9ba !important;
          }
          .donation-report-print th:last-child,
          .donation-report-print td:last-child {
            border-right: 1px solid #d7c9ba !important;
          }
          .donation-report-print tfoot td {
            border: 1px solid #cab7a4 !important;
          }
          .donation-report-print .report-table-wrap {
            border: none !important;
            box-shadow: none !important;
          }
          .donation-report-print .grand-total-row td {
            border-top: 2px solid #bfa892 !important;
            border-bottom: 1px solid #bfa892 !important;
            font-size: 13px !important;
          }
          .donation-report-print th {
            background-color: #ffffff !important;
            font-weight: bold !important;
          }
          .donation-report-print .donation-print-header {
            border-bottom: none !important;
          }
          .donation-report-print .print-financial-year {
            display: none !important;
          }
          }
          `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <h2 className="page-title">Donation Report</h2>
        <div className="flex items-center gap-2">
          <PrinterSelectDropdown
            context="REPORT_DONATION"
            onPrint={handlePrint}
            buttonLabel="Print"
          />
        </div>
      </div>

      <Card className="border-border-temple print:hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-text-main font-medium">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 text-text-main" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-text-main font-medium">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 text-text-main" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-text-main font-medium">Search Devotee / Phone</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-main/40" />
                <Input
                  placeholder="Name or Phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 text-text-main" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-text-main font-medium">Item Filter</Label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="h-10 w-full rounded-md border border-border-temple/50 bg-white px-3 text-sm text-text-main outline-none focus:border-primary transition-all"
              >
                <option value="">All Items</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.item_name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

          <div className="overflow-hidden rounded-xl border border-border-temple bg-white shadow-sm print:border-none print:shadow-none">
          <div className="donation-print-header border-b border-border-temple bg-white px-5 pb-7 pt-5">
          <div className="relative text-center">
            <div className="absolute right-0 top-0 hidden print:block bg-[#F8E6D1] border border-[#B08968] px-3 py-1.5 rounded-md print-financial-year">
               <span className="text-[11px] font-bold text-[#5C2E1F] whitespace-nowrap">
                  Financial Year : {activeFinancialYear}
               </span>
            </div>

            <h1 className="font-temple text-xl font-bold text-text-main">
              ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ
            </h1>
            <p className="mt-1 text-sm font-bold uppercase text-text-main">
              {fromDate && toDate && fromDate === toDate ?
              <>Report of : <span className="font-extrabold">{formatDate(fromDate)}</span></> :
              fromDate && toDate ?
              <>Donation Report From Date : <span className="font-extrabold">{formatDate(fromDate)}</span>
                {' '}To Date : <span className="font-extrabold">{formatDate(toDate)}</span></> :
              fromDate ?
              <>Report of : <span className="font-extrabold">{formatDate(fromDate)}</span></> :
              toDate ?
              <>Report up to : <span className="font-extrabold">{formatDate(toDate)}</span></> :

              <>Donation Report</>
              }
            </p>
          </div>
          </div>

          <div className="report-table-wrap overflow-x-auto pt-3 print:overflow-visible">
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-[#ead9c9] bg-[#f8efe5] text-xs font-bold uppercase tracking-wider text-text-main print:bg-gray-100">
                <th className="w-[10%] px-4 py-3 whitespace-nowrap">Date</th>
                <th className="w-[12%] px-4 py-3 whitespace-nowrap">Receipt No</th>
                <th className="w-[10%] px-4 py-3 whitespace-normal break-words">Devotee</th>
                <th className="w-[12%] px-4 py-3 whitespace-nowrap">Phone</th>
                <th className="w-[30%] px-3 py-3 whitespace-normal break-words">Donated Item & Quantity</th>
                <th className="w-[26%] px-4 py-3 whitespace-normal break-words">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e5da]">
              {isLoading ?
              <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm font-medium text-text-light">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading donation report...
                    </div>
                  </td>
                </tr> :
              reportData.length ?
              reportData.map((row, index) =>
              <tr key={`${row.donation_date}-${row.id}-${index}`} className="transition-colors hover:bg-[#fffaf4] align-top text-text-main print:break-inside-avoid">
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-normal print:px-2">
                      {formatDate(row.donation_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-normal print:px-2">
                      {row.receipt_display_number || '-'}
                    </td>
                    <td className="px-4 py-4 print:px-2 whitespace-normal break-words">
                      <div className="font-normal">{row.devotee_name || '-'}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-normal print:px-2">
                      {row.phone_number || '-'}
                    </td>
                    <td className="px-3 py-4 print:px-2 whitespace-normal break-words">
                      <div className="space-y-1.5">
                        {(row.items || []).map((it, idx) =>
                    <div key={idx} className="flex flex-col leading-tight">
                            <span className="text-sm font-normal text-text-main print:text-black">
                              {it.item?.item_name || '-'} - <span className="font-normal text-text-main print:text-black"><QtyDisplay qty={it.quantity} unit={it.item?.unit} /></span>
                            </span>
                          </div>
                    )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-normal print:px-2 whitespace-normal break-all">
                      <span className="block" title={row.remarks || '-'}>
                        {row.remarks || '-'}
                      </span>
                    </td>
                  </tr>
              ) :

              <tr>
                  <td colSpan={6} className="px-5 py-12 text-center font-bold text-text-main">
                    No donations found
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>
      </div>
    </div>);

};

export default DonationReportPage;
