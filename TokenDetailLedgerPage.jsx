import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar
} from 'lucide-react';
import api from '../api/axios';
import { DataTable } from '../components/ui/DataTable';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardContent } from '../components/ui/Card';
import { PrinterSelectDropdown } from '../components/PrinterSelectDropdown';
import { formatDate, safeFormatTime } from '../utils/date';





















const PAGE_SIZE = 50;

const hourOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const to24h = (h12, m, ampm) => {
  let h = parseInt(h12);
  if (h === 12) h = ampm === 'AM' ? 0 : 12;
  else if (ampm === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m}`;
};

const from24h = (time) => {
  if (!time) return { hour: '12', minute: '00', ampm: 'AM' };
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = String(hour % 12 || 12).padStart(2, '0');
  return { hour: h12, minute: m, ampm };
};

const getLocalDateInputValue = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TimeSelect = ({ value, onChange }) => {
  const { hour, minute, ampm } = from24h(value);
  const set = (field) => (e) => {
    const val = e.target.value;
    const h = field === 'hour' ? val : hour;
    const m = field === 'minute' ? val : minute;
    const a = field === 'ampm' ? val : ampm;
    onChange(to24h(h, m, a));
  };

  return (
    <div className="flex gap-1">
      <select value={hour} onChange={set('hour')} className="h-8 w-14 rounded-md border border-border-temple/50 bg-white px-1 text-xs text-text-main outline-none focus:border-primary">
        {hourOptions.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-text-light leading-8 text-xs">:</span>
      <select value={minute} onChange={set('minute')} className="h-8 w-14 rounded-md border border-border-temple/50 bg-white px-1 text-xs text-text-main outline-none focus:border-primary">
        {minuteOptions.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={ampm} onChange={set('ampm')} className="h-8 w-16 rounded-md border border-border-temple/50 bg-white px-1 text-xs text-text-main outline-none focus:border-primary">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

const TokenDetailLedgerPage = () => {
  const navigate = useNavigate();
  const { date: routeDate } = useParams();
  const [page, setPage] = useState(1);

  // Date state
  const [selectedDate, setSelectedDate] = useState(routeDate || getLocalDateInputValue());
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');

  const timeError = fromTime && toTime && fromTime > toTime;

  const { data, isLoading } = useQuery({
    queryKey: ['token-ledger-details', selectedDate, fromTime, toTime, page],
    enabled: !timeError,
    queryFn: async () => {
      const params = {
        page,
        page_size: PAGE_SIZE,
        start_date: selectedDate || null,
        end_date: selectedDate || null
      };
      if (fromTime) params.start_time = fromTime;
      if (toTime) params.end_time = toTime;
      const res = await api.get('/tokens/get_token_history_ledger', { params });
      return res.data;
    }
  });

  const details = data?.items || [];
  const totalEntries = data?.total || 0;

  // Fallback calculation if backend total is null/undefined but items exist
  const totalDevotees = useMemo(() => {
    if (data && data.total_tokens !== undefined && data.total_tokens !== null) {
      return data.total_tokens;
    }
    return details.reduce((sum, item) => sum + Number(item.token_count || 0), 0);
  }, [data, details]);

  const totalPages = data?.total_pages || 0;

  const handlePrint = () => {
    window.print();
  };

  const columns = useMemo(() => [
  {
    accessorKey: 'receipt_display_number',
    header: 'Receipt No',
    cell: (info) => <span className="font-bold text-primary">{info.getValue() || info.row.original.receipt_number}</span>
  },
  {
    accessorKey: 'created_at',
    header: 'Time',
    cell: (info) =>
    <span className="text-text-main font-medium">
          {info.getValue() ? safeFormatTime(info.getValue(), { hour: '2-digit', minute: '2-digit' }) : '-'}
        </span>

  },
  {
    accessorKey: 'token_count',
    header: () => <div className="text-center w-full">Devotees Count</div>,
    cell: (info) =>
    <div className="text-center">
          <span className="inline-flex items-center px-4 py-1 rounded-lg text-sm font-black text-primary">
            {info.getValue()}
          </span>
        </div>

  }],
  []);

  return (
    <div className="space-y-6 token-ledger-print">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          header, aside, footer, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .lg\\:pl-64 { padding-left: 0 !important; }
          html, body, #root, main, .token-ledger-print {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .token-ledger-print {
            padding: 0 !important; margin: 0 !important; width: 100% !important;
          }
          .token-ledger-print .border-border-temple {
            border: 1px solid #d7c9ba !important;
          }
          .token-ledger-print .shadow-sm { box-shadow: none !important; }
          
          .token-ledger-print table { 
            width: 100% !important; 
            border-collapse: separate !important; 
            border-spacing: 0 !important;
            border: 1px solid #d7c9ba !important;
            outline: 1px solid #d7c9ba !important;
            outline-offset: -1px !important;
            table-layout: fixed !important;
          }
          .token-ledger-print th, .token-ledger-print td { 
            border: 0 !important;
            border-left: 1px solid #d7c9ba !important;
            border-top: 1px solid #d7c9ba !important;
            border-right: 1px solid #d7c9ba !important;
            border-bottom: 1px solid #d7c9ba !important;
            padding: 7px !important;
            font-size: 12px !important;
          }
          .token-ledger-print tbody td { border-top: 1px solid #d7c9ba !important; }
          .token-ledger-print th:last-child, .token-ledger-print td:last-child { border-right: 1px solid #d7c9ba !important; }
          .token-ledger-print thead { 
            display: table-header-group !important; 
          }
          .token-ledger-print thead th {
            background-color: #FFF4E6 !important;
            color: #000 !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
          }
          
          .token-ledger-print .token-print-header {
            display: block !important;
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #d7c9ba;
            padding-bottom: 15px;
          }

          /* Hide DataTable pagination and other UI elements */
          .token-ledger-print .flex.items-center.justify-between.px-2.py-1,
          .token-ledger-print .pagination-controls,
          .token-ledger-print button {
            display: none !important;
          }

          .token-ledger-print .rounded-md.border.border-gray-200 {
            border: none !important;
          }
        }
        .token-print-header { display: none; }
      `}</style>

      {/* Canteen-style Print Header */}
      <div className="token-print-header text-center">
        <h1 className="text-xl font-bold text-text-main uppercase font-temple">ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ, ಕುಂಭಾಸಿ (ಅನ್ನದಾನ)</h1>
        <p className="text-sm font-bold text-text-main mt-1">
          TOKEN DETAILS REPORT FOR DATE : <span className="font-extrabold">{formatDate(selectedDate)}</span>
        </p>
      </div>

      <div className="flex items-center gap-4 print:hidden">
        <button
          onClick={() => navigate('/reports/tokens')}
          className="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-all">
          <ArrowLeft className="w-6 h-6 text-text-main group-hover:-translate-x-1 transition-transform" />
        </button>
        <h2 className="page-title mb-0">
          Token Details: {selectedDate && formatDate(selectedDate)}
        </h2>
        <div className="ml-auto">
          <PrinterSelectDropdown
            context="REPORT_TOKEN"
            onPrint={handlePrint}
            buttonLabel="Print"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
        {/* Date & Time Filter Card */}
        <Card className="md:col-span-3 border-border-temple shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-text-main">Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
                    className="pl-10 h-10 w-full text-sm bg-white" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-text-main">From Time</Label>
                <TimeSelect value={fromTime} onChange={(v) => { setFromTime(v); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-text-main">To Time</Label>
                <TimeSelect value={toTime} onChange={(v) => { setToTime(v); setPage(1); }} />
              </div>
            </div>
            {timeError && (
              <p className="text-[10px] text-red-500 mt-1">From time must be before To time</p>
            )}
          </CardContent>
        </Card>

        {/* Total Devotees Card */}
        <Card className="md:col-span-1 border-border-temple shadow-sm">
          <CardContent className="p-3 flex items-center justify-center h-full">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-text-main tracking-widest whitespace-nowrap">Devotees:</span>
              <span className="text-2xl font-black text-primary leading-none">{totalDevotees.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={details}
        loading={isLoading}
        manualPagination
        pageCount={totalPages}
        pageIndex={page - 1}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => setPage(p)}
        totalCount={totalEntries}
        className="print:border-none" />

      {/* Snapshot section for print only - Moved to bottom */}
      <div className="hidden print:block mt-8">
        <div className="inline-block border border-border-temple rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="min-w-[320px] border-collapse">
            <thead className="bg-[#FAF7F2] border-b border-border-temple">
              <tr>
                <th colSpan={2} className="text-left text-primary uppercase text-[11px] font-bold p-3 tracking-wider">Summary Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-temple/40">
              <tr>
                <td className="p-3 font-medium text-text-main">Total Mahaprasada Devotees</td>
                <td className="p-3 font-bold text-lg text-primary text-right">{totalDevotees.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="p-3 text-text-main">Filter Range</td>
                <td className="p-3 text-xs text-text-main text-right font-medium">{fromTime} to {toTime}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
    </div>);

};

export default TokenDetailLedgerPage;
