import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash, Upload, FileText, Clock, History, X } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { cn } from '../utils/cn';
import { DataTable } from '../components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../components/ui/Dialog';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Label } from '../components/ui/Label';
import { DetailItem } from '../components/ui/DetailItem';
import { formatDate, getTodayDateInput, safeFormatTime, safeFormatDate } from '../utils/date';
import { formatCurrency } from '../utils/currency';
import { QtyDisplay } from '../components/ui/QtyDisplay';
import { usePermission } from '../hooks/usePermission';
import { toDisplayCase } from '../utils/text';

// Helper to validate and transform text input to number
const numericString = z.string()
  .refine((val) => !isNaN(Number(val)) && val.trim() !== '', { message: "Must be a valid number" })
  .transform((val) => Number(val));

const purchaseItemSchema = z.object({
  item_id: z.coerce.number().min(1, 'Item is required'),
  quantity: numericString.pipe(z.number().min(0.001, 'Please enter qty')),
  price: numericString.pipe(z.number().min(0, 'Price cannot be negative')),
  search_id: z.string().optional()
});

const purchaseSchema = z.object({
  vendor_id: z.coerce.number().min(1, 'Vendor is required'),
  purchase_date: z.string().min(1, 'Date is required'),
  bill_no: z.string().optional(),
  invoice_amount: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), { message: "Invalid amount" })
    .transform((val) => (val ? Number(val) : 0)),
  items: z.array(purchaseItemSchema).min(1, 'At least one item is required')
});

const PurchasesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccess, showError, showConfirm } = useNotification();
  const { hasPermission } = usePermission();
  const canWrite = hasPermission('purchases.write');
  const canDelete = hasPermission('purchases.delete');
  const canReadActivityLogs = hasPermission('purchases.read');

  // Filter States
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const [open, setOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);

  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState(null);
  const [viewBillPreviewUrl, setViewBillPreviewUrl] = useState(null);
  const [viewBillPreviewType, setViewBillPreviewType] = useState(null);
  const [viewBillPreviewLoading, setViewBillPreviewLoading] = useState(false);
  const [viewSummaryPanelWidth, setViewSummaryPanelWidth] = useState(40);
  const viewCompareWrapRef = useRef(null);
  const [selectedBillFile, setSelectedBillFile] = useState(null);
  const [removeExistingBill, setRemoveExistingBill] = useState(false);
  const [showVendorAddress, setShowVendorAddress] = useState(false);
  const MAX_BILL_FILE_SIZE = 20 * 1024 * 1024;
  const ALLOWED_BILL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf'];

  const { data: purchasesData, isLoading: purchasesLoading } = useQuery({
    queryKey: ['purchases', search, page, pageSize, fromDate, toDate],
    queryFn: async () => {
      const params = {
        q: search.trim(),
        from_date: fromDate || null,
        to_date: toDate || null,
        page,
        page_size: pageSize
      };
      const res = await api.get('/purchases/list_purchases', { params });
      return res.data;
    }
  });

  const [activityExpanded, setActivityExpanded] = useState(false);
  const activityDrawerRef = useRef(null);

  useEffect(() => {
    if (!activityExpanded) return undefined;

    const handleOutsideClick = (event) => {
      if (
        activityDrawerRef.current &&
        !activityDrawerRef.current.contains(event.target)
      ) {
        setActivityExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [activityExpanded]);

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['purchase-activities'],
    queryFn: async () => {
      const res = await api.get('/audit/page_activity', { params: { page: 'purchases', page_size: 20 } });
      return res.data?.items || [];
    },
    enabled: !!canReadActivityLogs,
    retry: false,
    refetchInterval: 15000
  });

  const getActivityMeta = (log) => {
    if (log.method === 'POST') {
      return { title: 'Purchase Added', verb: 'created' };
    }
    if (log.method === 'PUT') {
      return { title: 'Purchase Edited', verb: 'updated' };
    }
    return { title: 'Purchase Deleted', verb: 'deleted' };
  };

  const getActivitySentenceParts = (log) => {
    const { verb } = getActivityMeta(log);
    const actorName = log.meta?.actor_name || log.username || 'System';
    const vendorName = log.meta?.vendor_name;
    const billNo = log.meta?.bill_no;
    const actionText = billNo ? `${verb} purchase Bill No. ${billNo}` : `${verb} a purchase`;
    return { actorName, actionText, targetName: vendorName, targetPrefix: ' from ' };
  };

  const formatActivityDay = (value) => {
    const activityDate = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (isSameDay(activityDate, today)) return 'Today';
    if (isSameDay(activityDate, yesterday)) return 'Yesterday';
    return safeFormatDate(activityDate, { day: '2-digit', month: 'short' });
  };

  const groupedActivityData = useMemo(() => {
    return (activityData || []).reduce((groups, log) => {
      const day = formatActivityDay(log.activity_at);
      if (!groups[day]) groups[day] = [];
      groups[day].push(log);
      return groups;
    }, {});
  }, [activityData]);

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors/list_vendors')).data
  });
  const vendors = useMemo(() => vendorsData?.items || [], [vendorsData]);

  const { data: itemsData } = useQuery({
    queryKey: ['items-list'],
    queryFn: async () => (await api.get('/items/list_items', { params: { page_size: 100 } })).data
  });
  const items = useMemo(() => {
    const list = itemsData?.items || [];
    return [...list].sort((a, b) => {
      const codeA = (a.serial_numbers || []).find((s) => Number(s?.status ?? 1) === 1)?.serial_number || '';
      const codeB = (b.serial_numbers || []).find((s) => Number(s?.status ?? 1) === 1)?.serial_number || '';
      const numA = parseInt(codeA, 10);
      const numB = parseInt(codeB, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
  }, [itemsData]);

  const serialToItemIdMap = useMemo(() => {
    const map = new Map();
    items.filter((i) => i.status === 1).forEach((i) => {
      (i.serial_numbers || []).forEach((s) => {
        const serial = String(s?.serial_number || '').trim().toLowerCase();
        if (serial) map.set(serial, i.id);
      });
    });
    return map;
  }, [items]);

  const itemCodeByItemIdMap = useMemo(() => {
    const map = new Map();
    items.forEach((i) => {
      const serial = (i.serial_numbers || []).find((s) => Number(s?.status ?? 1) === 1)?.serial_number;
      if (serial) map.set(Number(i.id), String(serial));
    });
    return map;
  }, [items]);

  const { register, handleSubmit, control, watch, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      purchase_date: getTodayDateInput(),
      invoice_amount: '0',
      items: [{ item_id: '', quantity: '0', price: '0', search_id: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  const watchedItems = watch('items');
  const watchedVendorId = watch('vendor_id');
  const watchedBillNo = watch('bill_no');

  const selectedVendor = useMemo(
    () => vendors?.find((v) => Number(v.id) === Number(watchedVendorId)),
    [vendors, watchedVendorId]
  );

  const selectedVendorAddress = useMemo(() => {
    if (!selectedVendor) return '';
    return [
      selectedVendor.address_line1,
      selectedVendor.address_line2,
      selectedVendor.city,
      selectedVendor.state,
      selectedVendor.postal_code
    ].filter((part) => String(part || '').trim().length > 0).join(', ');
  }, [selectedVendor]);

  const previousVendorIdRef = useRef(undefined);
  const vendorConfirmBaselineRef = useRef(null);

  useEffect(() => {
    if (!watchedVendorId) {
      previousVendorIdRef.current = watchedVendorId;
      setShowVendorAddress(false);
      vendorConfirmBaselineRef.current = null;
      return;
    }
    if (previousVendorIdRef.current !== watchedVendorId) {
      setShowVendorAddress(true);
      previousVendorIdRef.current = watchedVendorId;
      vendorConfirmBaselineRef.current = {
        billNo: String(watchedBillNo || ''),
        items: JSON.stringify(watchedItems || []),
        fileName: selectedBillFile?.name || ''
      };
    }
  }, [watchedVendorId, watchedBillNo, watchedItems, selectedBillFile]);

  useEffect(() => {
    if (!showVendorAddress || !vendorConfirmBaselineRef.current) return;
    const current = {
      billNo: String(watchedBillNo || ''),
      items: JSON.stringify(watchedItems || []),
      fileName: selectedBillFile?.name || ''
    };
    const baseline = vendorConfirmBaselineRef.current;
    const changedSinceVendorPick =
      current.billNo !== baseline.billNo ||
      current.items !== baseline.items ||
      current.fileName !== baseline.fileName;
    if (changedSinceVendorPick) {
      setShowVendorAddress(false);
    }
  }, [showVendorAddress, watchedBillNo, watchedItems, selectedBillFile]);

  const totalAmount = (watchedItems || []).reduce((sum, item) => {
    const q = Number(item.quantity) || 0;
    const p = Number(item.price) || 0;
    return sum + q * p;
  }, 0);

  useEffect(() => {
    setValue('invoice_amount', String(totalAmount));
  }, [totalAmount, setValue]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const { id, isEditMode, billFile, removeBill, ...data } = payload;
      if (isEditMode && !id) {
        throw new Error('Missing purchase ID for update');
      }
      const cleanData = {
        ...data,
        items: data.items.map(({ search_id, ...rest }) => rest)
      };

      let saveRes;
      if (id) {
        saveRes = await api.put(`/purchases/update_purchase/${id}`, { ...cleanData, user_id: user?.id, status: 1 });
      } else {
        saveRes = await api.post('/purchases/create_purchase', { ...cleanData, user_id: user?.id, status: 1 });
      }

      let billUploaded = false;
      if (billFile) {
        const formData = new FormData();
        formData.append('bill_file', billFile);
        try {
          await api.post(`/purchases/upload_bill/${saveRes.data.id}`, formData);
          billUploaded = true;
        } catch (uploadErr) {
          throw new Error(uploadErr?.response?.data?.detail || 'Purchase saved, but bill upload failed');
        }
      }
      if (removeBill) {
        const targetId = saveRes?.data?.id || id;
        if (targetId) {
          try {
            await api.delete(`/purchases/delete_bill/${targetId}`);
          } catch (removeErr) {
            throw new Error(removeErr?.response?.data?.detail || 'Purchase saved, but bill removal failed');
          }
        }
      }
      return { saveRes, billUploaded };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });

      const actionText = variables?.isEditMode ? 'updated' : 'recorded';
      const billText = result?.billUploaded ? ' with bill file' : '';
      showSuccess(`Purchase ${actionText} successfully${billText}`);

      handleClose();
    },
    onError: (err) => {
      showError(err.response?.data?.detail || 'Failed to save purchase');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => api.delete(`/purchases/delete_purchase/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      showSuccess('Purchase deleted successfully');
    },
    onError: (err) => showError(err.response?.data?.detail || 'Failed to delete purchase')
  });

  const handleOpen = async (purchase = null) => {
    setSelectedBillFile(null);
    setRemoveExistingBill(false);
    if (purchase) {
      try {
        const res = await api.get(`/purchases/get_purchase/${purchase.id}`);
        const fullData = res.data;

        setEditingPurchase(fullData);
        reset({
          purchase_date: fullData.purchase_date,
          vendor_id: fullData.vendor_id,
          bill_no: fullData.bill_no || '',
          invoice_amount: String(fullData.invoice_amount || 0),
          items: fullData.items.map((item) => ({
            item_id: item.item_id,
            quantity: String(item.quantity),
            price: String(item.price),
            search_id: itemCodeByItemIdMap.get(Number(item.item_id)) || ''
          }))
        });
      } catch (err) {
        showError('Failed to fetch purchase details');
        return;
      }
    } else {
      setEditingPurchase(null);
      reset({
        purchase_date: getTodayDateInput(),
        vendor_id: '',
        bill_no: '',
        invoice_amount: '0',
        items: [{ item_id: '', quantity: '0', price: '0', search_id: '' }]
      });
    }
    setOpen(true);
  };

  const handleDownloadBill = async (purchaseId, fallbackName) => {
    try {
      const res = await api.get(`/purchases/download_bill/${purchaseId}`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fallbackName || 'purchase_bill';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      showError('Failed to download bill file');
    }
  };

  const handleView = async (purchase) => {
    try {
      const res = await api.get(`/purchases/get_purchase/${purchase.id}`);
      setViewingPurchase(res.data);
      setViewDialogOpen(true);
    } catch (err) {
      showError('Failed to fetch purchase details');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEditingPurchase(null);
    setSelectedBillFile(null);
    setRemoveExistingBill(false);
  };

  const handleBillFileChange = (file) => {
    if (!file) {
      setSelectedBillFile(null);
      return;
    }

    const name = file.name.toLowerCase();
    const hasAllowedExt = ALLOWED_BILL_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!hasAllowedExt) {
      showError('Unsupported file format. Allowed: .jpg, .jpeg, .png, .webp, .heic, .pdf');
      return;
    }

    if (file.size > MAX_BILL_FILE_SIZE) {
      showError('File size exceeds 20MB limit');
      return;
    }

    setRemoveExistingBill(false);
    setSelectedBillFile(file);
  };

  const handleRemoveCurrentBill = async () => {
    const confirmed = await showConfirm(
      'Remove Current Bill',
      'Are you sure you want to remove the current bill attachment?'
    );
    if (!confirmed) return;
    setSelectedBillFile(null);
    setRemoveExistingBill(true);
  };

  useEffect(() => {
    const loadBillPreview = async () => {
      const latestBill = viewingPurchase?.bills?.[0];
      if (!viewDialogOpen || !viewingPurchase?.id || !latestBill) {
        setViewBillPreviewUrl(null);
        setViewBillPreviewType(null);
        setViewBillPreviewLoading(false);
        return;
      }

      setViewBillPreviewLoading(true);
      try {
        const res = await api.get(`/purchases/download_bill/${viewingPurchase.id}?t=${new Date().getTime()}`, { responseType: 'blob' });
        const blob = res.data;
        const blobUrl = window.URL.createObjectURL(blob);
        const mime = (blob.type || '').toLowerCase();
        const fileName = String(latestBill.file_name || '').toLowerCase();
        const isPdf = mime.includes('pdf') || fileName.endsWith('.pdf');
        const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);

        setViewBillPreviewUrl(blobUrl);
        setViewBillPreviewType(isPdf ? 'pdf' : isImage ? 'image' : null);
      } catch {
        setViewBillPreviewUrl(null);
        setViewBillPreviewType(null);
      } finally {
        setViewBillPreviewLoading(false);
      }
    };

    loadBillPreview();
  }, [viewDialogOpen, viewingPurchase]);

  useEffect(() => {
    return () => {
      if (viewBillPreviewUrl) {
        window.URL.revokeObjectURL(viewBillPreviewUrl);
      }
    };
  }, [viewBillPreviewUrl]);

  const onSubmit = async (data) => {
    const calculatedGrandTotal = Number(totalAmount.toFixed(2));
    const payloadData = { ...data, invoice_amount: calculatedGrandTotal };

    const confirmed = await showConfirm(
      editingPurchase ? "Confirm Update" : "Confirm Save",
      `Are you sure you want to ${editingPurchase ? 'update' : 'save'} this purchase?`
    );

    if (confirmed) {
      mutation.mutate({
        ...payloadData,
        id: editingPurchase?.id,
        isEditMode: Boolean(editingPurchase),
        billFile: selectedBillFile,
        removeBill: removeExistingBill
      });
    }
  };

  const handleViewPanelResizeStart = (e) => {
    e.preventDefault();
    const wrap = viewCompareWrapRef.current;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const onMove = (ev) => {
      const next = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(72, Math.max(35, next));
      setViewSummaryPanelWidth(clamped);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'purchase_date',
      header: 'Date',
      cell: (info) => <span className="text-text-main">{formatDate(info.getValue())}</span>
    },
    {
      accessorKey: 'bill_no',
      header: 'Invoice No',
      cell: (info) => <span className="text-text-main font-medium">{info.getValue() || '-'}</span>
    },
    {
      accessorKey: 'vendor_id',
      header: 'Vendor',
      cell: (info) => {
        const vendor = vendors?.find((v) => v.id === info.getValue());
        return <span className="text-text-main">{toDisplayCase(vendor ? vendor.vendor_name : info.getValue())}</span>;
      }
    },
    {
      accessorKey: 'invoice_amount',
      header: 'Grand Total',
      cell: (info) => {
        const entry = info.row.original;
        const total = Number(entry.invoice_amount || entry.total_amount);
        return <span className="text-text-main">{formatCurrency(total)}</span>;
      }
    },
    {
      id: 'actions',
      header: () => <div className="text-center">Actions</div>,
      cell: (info) => (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => handleView(info.row.original)} className="action-btn-view">View</button>
          {canWrite && <button onClick={() => handleOpen(info.row.original)} className="action-btn-edit">Edit</button>}
          {canDelete && (
            <button
              onClick={async () => {
                const confirmed = await showConfirm('Delete Purchase', `Are you sure you want to delete this purchase entry?`);
                if (confirmed) deleteMutation.mutate(info.row.original.id);
              }}
              className="action-btn-delete"
            >
              Delete
            </button>
          )}
        </div>
      )
    }
  ], [vendors, deleteMutation, showConfirm, canWrite, canDelete]);

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Purchase Entries</h2>
        </div>
        {canWrite && (
          <Button onClick={() => handleOpen()} className="flex items-center gap-2">
            Add New Purchase
          </Button>
        )}
      </div>

      <Card className="border-border-temple">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5 w-full sm:w-44">
                <Label className="text-text-main font-medium">From Date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="text-text-main"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-44">
                <Label className="text-text-main font-medium">To Date</Label>
                <Input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-text-main"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-72">
                <Label className="text-text-main font-medium">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-main/50" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 text-text-main"
                  />
                </div>
              </div>
            </div>
            {canReadActivityLogs && (
              <button
                onClick={() => setActivityExpanded(!activityExpanded)}
                className={cn(
                  "relative flex h-10 w-10 shrink-0 items-center justify-center self-end text-primary transition-colors hover:text-primary/80 active:scale-95 group",
                  activityExpanded && "text-primary/70"
                )}
                title={activityExpanded ? "Close History" : "View Purchase History"}
              >
                <History className="w-6 h-6 transition-colors" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border-temple overflow-hidden bg-white">
        <DataTable
          columns={columns}
          data={purchasesData?.items || []}
          loading={purchasesLoading}
          manualPagination
          pageCount={purchasesData?.total_pages || 0}
          pageIndex={page - 1}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          totalCount={purchasesData?.total || 0}
        />
      </div>

      {canReadActivityLogs && (
        <div className={cn(
          "fixed top-0 right-0 h-full w-[360px] max-w-[94vw] bg-white shadow-[-10px_0_40px_rgba(0,0,0,0.08)] border-l border-border-temple/40 z-30 transition-transform duration-300 ease-out transform",
          activityExpanded ? "translate-x-0" : "translate-x-full"
        )} ref={activityDrawerRef}>
          <div className="flex h-full flex-col">
            <div className="m-0 flex items-center justify-between border-b border-border-temple/40 bg-[#FAF7F2] px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary shadow-sm border border-border-temple/40">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-secondary font-temple uppercase tracking-widest">Recent Activity</h3>
              </div>
              <button onClick={() => setActivityExpanded(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-main/40 hover:bg-white hover:text-text-main">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#FFFCF8] px-5 py-4 custom-scrollbar">
              {activityLoading ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="mb-4 animate-pulse space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <div className="h-3 bg-bg-temple rounded w-3/4"></div>
                    <div className="h-2 bg-bg-temple rounded w-1/2"></div>
                  </div>
                ))
              ) : (!activityData || activityData.length === 0) ? (
                <div className="p-10 text-center space-y-2">
                  <div className="w-12 h-12 bg-bg-temple rounded-full flex items-center justify-center mx-auto opacity-40">
                    <History className="w-6 h-6 text-text-main" />
                  </div>
                  <p className="text-xs text-text-main/40 italic">No recent activities</p>
                </div>
              ) : (
                Object.entries(groupedActivityData).map(([day, logs]) => (
                  <div key={day} className="mb-5 last:mb-0">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-text-main/40">{day}</div>
                    <div className="relative divide-y divide-border-temple/40 bg-white before:absolute before:left-[14px] before:top-3 before:bottom-3 before:w-px before:bg-primary/45">
                      {logs.map((log) => {
                        const { actorName, actionText, targetName, targetPrefix } = getActivitySentenceParts(log);
                        return (
                          <div key={log.id} className="relative py-3 pl-7 pr-3 transition-colors">
                            <div className="absolute left-[14px] top-[19px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold leading-tight text-text-main">
                                    <span className="font-bold text-primary">{actorName}</span>
                                    <span className="text-text-main"> {actionText}</span>
                                    {targetName && (
                                      <>
                                        <span className="text-text-main">{targetPrefix}</span>
                                        <span className="font-bold text-primary">{targetName}</span>
                                      </>
                                    )}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[10px] font-bold text-text-main/70">
                                  {safeFormatTime(log.activity_at, { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="w-[96vw] max-w-[1800px] max-h-[94vh] overflow-y-auto border-border-temple">
          <DialogHeader className="border-b border-border-temple/40 pb-4">
            <DialogTitle className="text-text-main font-temple">Purchase Summary</DialogTitle>
            <DialogDescription className="sr-only">Detailed breakdown of the selected purchase entry.</DialogDescription>
          </DialogHeader>

          <div
            ref={viewCompareWrapRef}
            className="mt-4 flex flex-col xl:flex-row xl:items-start"
            style={{ '--summary-width': viewingPurchase?.bills?.length > 0 ? `${viewSummaryPanelWidth}%` : '100%' }}
          >
            <div className={`space-y-4 w-full xl:w-[var(--summary-width)] ${viewingPurchase?.bills?.length > 0 ? 'xl:pr-3' : ''}`}>
              <div className="space-y-0">
                <DetailItem label="Purchase Date" value={formatDate(viewingPurchase?.purchase_date)} />
                <DetailItem label="Invoice No" value={viewingPurchase?.bill_no} />
                <DetailItem label="Vendor" value={toDisplayCase(vendors?.find((v) => v.id === viewingPurchase?.vendor_id)?.vendor_name)} />
              </div>

              <div className="space-y-2">
                <h4 className="text-base font-bold text-primary uppercase tracking-wider">Items Purchased</h4>
                <div className="rounded-lg border border-border-temple overflow-x-auto">
                  <table className="w-full text-base text-left">
                    <thead className="bg-bg-temple border-b border-border-temple">
                      <tr>
                        <th className="px-4 py-2 font-bold text-text-main">Item Name</th>
                        <th className="px-4 py-2 font-bold text-text-main text-right">Qty</th>
                        <th className="px-4 py-2 font-bold text-text-main text-right">Price</th>
                        <th className="px-4 py-2 font-bold text-text-main text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-temple/40">
                      {viewingPurchase?.items?.map((item, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="px-4 py-2 text-text-main">{toDisplayCase(items?.find((i) => i.id == item.item_id)?.item_name)}</td>
                          <td className="px-4 py-2 text-text-main text-right">
                            <QtyDisplay qty={item.quantity} unit={items?.find((i) => i.id == item.item_id)?.unit} />
                          </td>
                          <td className="px-4 py-2 text-text-main text-right">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-2 text-text-main text-right font-medium">{formatCurrency(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Card className="bg-bg-temple/40 border-border-temple/40 border shadow-none">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-bold uppercase text-base">Grand Total</span>
                    <span className="text-primary font-bold text-xl">
                      {formatCurrency(viewingPurchase?.total_amount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {viewingPurchase?.bills?.length > 0 && (
              <>
                <div
                  className="hidden xl:flex w-3 cursor-col-resize select-none items-center justify-center"
                  onMouseDown={handleViewPanelResizeStart}
                  title="Drag to resize panels"
                >
                  <div className="h-16 w-[2px] rounded bg-[#D9C8AF]" />
                </div>

                <div className="rounded-lg border border-border-temple bg-white overflow-hidden h-[72vh] min-h-[300px] sm:min-h-[620px] w-full xl:w-[calc(100%-var(--summary-width))] xl:pl-3">
                  <div className="px-4 py-2 border-b border-border-temple bg-bg-temple/40 flex items-center justify-between">
                    <span className="text-base font-bold text-primary uppercase tracking-wider">Uploaded Bill Preview</span>
                    <button
                      type="button"
                      className="action-btn-view"
                      onClick={() => handleDownloadBill(viewingPurchase.id, viewingPurchase.bills?.[0]?.file_name)}
                    >
                      Download
                    </button>
                  </div>

                  <div className="h-[calc(100%-45px)] bg-[#FAF7F2]">
                    {viewBillPreviewLoading && (
                      <div className="h-full flex items-center justify-center text-sm text-text-main/70">Loading preview...</div>
                    )}
                    {!viewBillPreviewLoading && !viewBillPreviewType && (
                      <div className="h-full flex items-center justify-center text-sm text-text-main/70">Preview not supported for this file type</div>
                    )}
                    {!viewBillPreviewLoading && viewBillPreviewType === 'image' && viewBillPreviewUrl && (
                      <img src={viewBillPreviewUrl} alt="Uploaded bill" className="w-full h-full object-contain" />
                    )}
                    {!viewBillPreviewLoading && viewBillPreviewType === 'pdf' && viewBillPreviewUrl && (
                      <iframe src={viewBillPreviewUrl} title="Uploaded bill PDF" className="w-full h-full border-0" />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="!px-6 !py-4 border-t border-border-temple/40 flex justify-end shrink-0 bg-[#F3E8D4]">
            <Button onClick={() => setViewDialogOpen(false)} className="px-6 h-10 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold border-none shadow-md">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(val) => {
        if (!val && !mutation.isPending) {
          handleClose();
        }
      }}>
        <DialogContent
          className="max-w-5xl max-h-[90vh] overflow-hidden border-border-temple p-0 flex flex-col"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="m-0">
            <DialogTitle className="text-text-main font-temple">
              {editingPurchase ? 'Edit Purchase Entry' : 'Record New Purchase'}
            </DialogTitle>
            <DialogDescription className="sr-only">Form to record or update a purchase from a vendor.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
                e.preventDefault();
              }
            }}
          >
            <div className="bg-white space-y-6 px-6 pt-4 pb-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 justify-items-start">
                <div className="space-y-1.5 w-full max-w-[320px]">
                  <Label className="text-text-main">Select Vendor *</Label>
                  <Controller
                    name="vendor_id"
                    control={control}
                    render={({ field }) => (
                      <Select {...field} className="w-full h-10">
                        <option value="">Choose Vendor</option>
                        {vendors?.filter((v) => v.status === 1 || v.id === editingPurchase?.vendor_id).map((v) => (
                          <option key={v.id} value={v.id}>{toDisplayCase(v.vendor_name)}</option>
                        ))}
                      </Select>
                    )}
                  />
                  {errors.vendor_id && <p className="text-xs text-red-500 font-medium">{errors.vendor_id.message}</p>}
                  {selectedVendorAddress && showVendorAddress && (
                    <p className="text-[11px] text-text-main/70 leading-4">
                      {selectedVendorAddress}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 w-full max-w-[320px]">
                  <Label className="text-text-main">Purchase Date *</Label>
                  <Input type="date" {...register('purchase_date')} className="h-10 text-text-main" />
                  {errors.purchase_date && <p className="text-xs text-red-500 font-medium">{errors.purchase_date.message}</p>}
                </div>
                <div className="space-y-1.5 w-full max-w-[320px]">
                  <Label className="text-text-main">Invoice/Bill Number</Label>
                  <Input {...register('bill_no')} className="h-10 text-text-main" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2">
                  <h4 className="text-base font-bold text-primary uppercase tracking-widest">Items in Purchase</h4>
                </div>

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-white p-3 rounded-lg border border-border-temple/40 shadow-sm relative">
                      <div className="sm:col-span-1 space-y-1.5">
                        {index === 0 && <Label className="text-sm font-bold text-text-main">Code</Label>}
                        <Input
                          type="text"
                          className="h-10 text-base text-center text-text-main border-primary/30 px-1"
                          {...register(`items.${index}.search_id`)}
                          onChange={(e) => {
                            const val = String(e.target.value || '').trim();
                            const normalized = val.toLowerCase();
                            setValue(`items.${index}.search_id`, val);

                            if (normalized) {
                              const matchedId = serialToItemIdMap.get(normalized);
                              if (matchedId) {
                                setValue(`items.${index}.item_id`, matchedId);
                              } else {
                                setValue(`items.${index}.item_id`, '');
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="sm:col-span-5 space-y-1.5">
                        {index === 0 && <Label className="text-base font-bold text-text-main">Item Name *</Label>}
                        <Controller
                          name={`items.${index}.item_id`}
                          control={control}
                          render={({ field: itemField }) => (
                            <SearchableSelect
                              ref={itemField.ref}
                              value={itemField.value}
                              onChange={(val) => {
                                const itemId = Number(val);
                                itemField.onChange(itemId);
                                setValue(`items.${index}.search_id`, itemCodeByItemIdMap.get(itemId) || '');
                              }}
                              options={(items || [])
                                .filter((i) => i.status === 1 || Number(watchedItems?.[index]?.item_id) === Number(i.id))
                                .map((i) => ({
                                  value: i.id,
                                  label: toDisplayCase(i.item_name)
                                }))}
                              placeholder="Search & Select Item..."
                              className="text-base"
                            />
                          )}
                        />
                        {errors.items?.[index]?.item_id && <p className="text-[10px] text-red-500 font-bold">Required</p>}
                      </div>
                      <div className="sm:col-span-2 space-y-1.5">
                        {index === 0 && <Label className="text-base font-bold text-text-main">Qty *</Label>}
                        <Input
                          type="text"
                          {...register(`items.${index}.quantity`)}
                          className="h-10 text-base text-text-main"
                          onFocus={(e) => {
                            if (!editingPurchase && e.target.value === '0') {
                              setValue(`items.${index}.quantity`, '');
                            }
                          }}
                        />
                        {errors.items?.[index]?.quantity && <p className="text-[10px] text-red-500 font-bold">{(errors.items[index]?.quantity).message}</p>}
                      </div>
                      <div className="sm:col-span-2 space-y-1.5">
                        {index === 0 && <Label className="text-base font-bold text-text-main">Price *</Label>}
                        <Input
                          type="text"
                          {...register(`items.${index}.price`)}
                          className="h-10 text-base text-text-main"
                          onFocus={(e) => {
                            if (!editingPurchase && e.target.value === '0') {
                              setValue(`items.${index}.price`, '');
                            }
                          }}
                        />
                        {errors.items?.[index]?.price && <p className="text-[10px] text-red-500 font-bold uppercase">{(errors.items[index]?.price).message}</p>}
                      </div>
                      <div className="sm:col-span-1 space-y-1.5">
                        {index === 0 && <Label className="text-base font-bold text-text-main w-full">Total</Label>}
                        <div className="h-9 flex items-center">
                          <span className="font-bold text-text-main text-base whitespace-nowrap">
                            {formatCurrency((Number(watchedItems?.[index]?.quantity) || 0) * (Number(watchedItems?.[index]?.price) || 0))}
                          </span>
                        </div>
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1} className="h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 gap-4">
                  <Button type="button" size="sm" variant="outline" onClick={() => append({ item_id: '', quantity: '0', price: '0', search_id: '' })} className="h-10 text-base font-bold border-primary text-primary hover:bg-primary hover:text-white transition-colors">
                    <Plus className="h-3 w-3 mr-1" /> Add Item
                  </Button>

                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-bold text-text-main/50 uppercase tracking-widest">Grand Total</span>
                      <span className="text-2xl font-black text-primary">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-text-main font-bold">Bill Attachment</Label>
                <label
                  htmlFor="bill-file-upload"
                  className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-dashed border-[#D9C8AF] bg-[#FAF7F2] px-4 py-3 transition hover:bg-[#F4E9D8] hover:border-primary"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-[#D9C8AF] text-primary">
                      {selectedBillFile ? <FileText className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-main">Upload Invoice / Bill</p>
                      {selectedBillFile && <p className="text-[11px] text-text-main/60 truncate">{selectedBillFile.name}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-md bg-white px-3 py-1.5 text-[11px] font-bold text-primary border border-[#D9C8AF]">
                    Choose File
                  </div>
                  <input
                    id="bill-file-upload"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => handleBillFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                {selectedBillFile && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                    Bill selected successfully: <span className="font-semibold">{selectedBillFile.name}</span>
                  </div>
                )}
                {!selectedBillFile && !removeExistingBill && editingPurchase?.bills?.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-[#D9C8AF] bg-white px-3 py-2 text-xs">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-text-main/70 truncate">
                      Current: {editingPurchase.bills?.[0]?.file_name || 'Attached file'}
                    </span>
                    <button
                      type="button"
                      className="action-btn-view"
                      onClick={() => handleDownloadBill(editingPurchase.id, editingPurchase.bills?.[0]?.file_name)}
                    >
                      Download
                    </button>
                    <button type="button" className="action-btn-delete" onClick={handleRemoveCurrentBill}>
                      Remove
                    </button>
                  </div>
                )}
                {removeExistingBill && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Current bill will be removed when you click Save.
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-3 m-0 bg-[#F3E8D4] sticky bottom-0 z-10 border-t border-border-temple/40">
              <Button type="button" variant="ghost" onClick={handleClose} className="w-28 h-10 bg-white border border-[#D9C8AF] text-text-main hover:bg-[#FAF7F2] font-bold">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="w-32 h-10 bg-primary hover:bg-primary/90 text-white font-black shadow-lg border-none">
                {mutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchasesPage;
