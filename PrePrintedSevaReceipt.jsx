import React, { forwardRef } from 'react';
import { format } from 'date-fns';

if (typeof document !== 'undefined' && !document.getElementById('noto-kannada-font')) {
  const link = document.createElement('link');
  link.id = 'noto-kannada-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;500;600;700;800;900&display=swap';
  document.head.appendChild(link);
}

/**
 * PrePrintedSevaReceipt - Adjusted for A6 Landscape with "Recorded By" and minimum top space.
 */
const PrePrintedSevaReceipt = forwardRef(({ donation, settings }, ref) => {
  if (!donation) return null;

  const styles = {
    page: {
      width: '148mm',
      height: '105mm',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Noto Sans Kannada', 'Nirmala UI', sans-serif",
      color: '#000',
      backgroundColor: 'transparent',
    },
    label: {
      position: 'absolute',
      fontSize: '9pt',
      fontWeight: '700',
    },
    value: {
      position: 'absolute',
      fontSize: '9pt',
      fontWeight: '500',
    },
    header: {
      position: 'absolute',
      top: '0mm',
      left: '0mm',
      width: '148mm',
      minHeight: '20mm',
      textAlign: 'center',
      lineHeight: '1.25',
    },
    container: {
      position: 'relative',
      top: '0mm',
      left: '0mm',
      width: '100%',
      height: '100%',
    },
    bodyBorder: {
      position: 'absolute',
      top: '28mm',
      left: '5mm',
      width: '138mm',
      minHeight: '74mm',
      border: '1.5pt solid black',
      boxSizing: 'border-box',
      overflow: 'visible',
    },
    detailsBlock: {
      position: 'relative',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '2mm',
      padding: '1mm 2mm 0mm',
      boxSizing: 'border-box',
    },
    receiptTitle: {
      textAlign: 'center',
      fontWeight: '900',
      fontSize: '9.5pt',
      color: '#1F3D78',
      letterSpacing: '0.5px',
      lineHeight: '1.1',
    },
    detailsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 42mm',
      columnGap: '8mm',
      fontSize: '9pt',
      lineHeight: '1.55',
    },
    detailLine: {
      minHeight: '5mm',
    },
    rightDetailLine: {
      minHeight: '5mm',
      textAlign: 'right',
    },
    table: {
      position: 'relative',
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      marginTop: '3mm',
    },
    th: {
      border: '0.5pt solid #666',
      fontFamily: "'Noto Sans Kannada', 'Nirmala UI', sans-serif",
      fontSize: '7.5pt',
      fontWeight: '700',
      lineHeight: '1.1',
      padding: '1mm 0.5mm',
      textAlign: 'center',
      boxSizing: 'border-box',
      wordBreak: 'break-word',
    },
    td: {
      border: '0.5pt solid #666',
      fontFamily: "'Noto Sans Kannada', 'Nirmala UI', sans-serif",
      fontSize: '8pt',
      padding: '1mm 1mm',
      verticalAlign: 'top',
      wordBreak: 'break-word',
      boxSizing: 'border-box',
    },
    itemTd: {
      border: '0.5pt solid #666',
      borderBottom: '0.5pt solid #666',
      fontFamily: "'Noto Sans Kannada', 'Nirmala UI', sans-serif",
      fontSize: '9pt',
      padding: '1.5mm 1.5mm',
      verticalAlign: 'top',
    },
    mobalaguTh: {
      letterSpacing: '0',
    },
    subDescription: {
      fontSize: '8.5pt',
      color: '#444',
      marginTop: '1.5mm',
      paddingLeft: '3mm',
      fontStyle: 'italic',
      lineHeight: '1.2',
    },
  };

  const toTitleCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b(\w)/g, s => s.toUpperCase());
  };

  const receiptDate = new Date(donation.created_at || donation.donation_date);
  // User Code / Username for the "Recorded By" value
  const recordedByValue = donation.user_code || donation.user?.full_name || donation.user?.username || '';
  const showTempleName = settings?.show_temple_name ?? true;
  const showTempleNameKn = settings?.show_temple_name_kn ?? true;
  const showTempleAddress = settings?.show_temple_address ?? true;
  const showTempleContact = settings?.show_temple_contact ?? true;
  const showAlternateContact = settings?.show_alternate_contact ?? true;
  const templeName = settings?.temple_name || 'ANEGUDDE SRI VINAYAKA TEMPLE';
  const templeNameKn = settings?.temple_name_kn || 'ಆನೆಗುಡ್ಡೆ ಶ್ರೀ ವಿನಾಯಕ ದೇವಸ್ಥಾನ';
  const templeAddress = settings?.temple_address || 'Kumbhasi - 576 257, Kundapura Taluk, Udupi Dist';
  const officeContact = settings?.receipt_office_contact || '74060 93533';
  const sevaCounterContact = settings?.receipt_seva_counter_contact || '94802 72221';
  const guestHouseContact = settings?.receipt_guest_house_contact || '97406 73533';
  const contactLine = [
    officeContact
      ? `Office: ${officeContact}`
      : showTempleContact && settings?.temple_contact
        ? `Office: ${settings.temple_contact}`
        : null,
    sevaCounterContact
      ? `Seva Counter: ${sevaCounterContact}`
      : showAlternateContact && settings?.alternate_contact
        ? `Seva Counter: ${settings.alternate_contact}`
        : null,
    guestHouseContact ? `Guest House: ${guestHouseContact}` : null,
  ].filter(Boolean).join(' | ');
  const devoteeAddress = [donation.address, donation.city, donation.state, donation.pincode]
    .filter(Boolean)
    .join(', ');
  const donationTypeName = donation.donation_type_master?.type_name || 'Donation';
  
  const isItemDonation = donation.donation_mode === 0 || donation.donation_type_master?.is_item_donation;
  const totalAmount = isItemDonation ? 0 : parseFloat(donation.total_gross_amount || 0);
  
  // Build Sub-Description (Items or Notes)
  const subItems = (donation.items || []).map(it => {
    const unitName = it.item?.unit?.unit_name || '';
    const itemName = it.item?.item_name || 'Unknown Item';
    const qtyVal = parseFloat(it.quantity || 0);
    return `${itemName} - ${qtyVal} ${unitName}`;
  }).join(', ');

  const notes = [donation.amount_note, donation.remarks].filter(Boolean).join('\n');

  const DetailRow = ({ left, right }) => (
    <div style={{ display: 'flex', fontFamily: "'Noto Sans Kannada', 'Nirmala UI', sans-serif", fontSize: '8pt', lineHeight: '1.35', minHeight: '4.5mm' }}>
      <span style={{ flex: '0 0 58%', wordBreak: 'break-word' }}>{left}</span>
      <span style={{ flex: '0 0 42%', paddingLeft: '1.5mm', wordBreak: 'break-word' }}>{right}</span>
    </div>
  );

  return (
    <div ref={ref} style={styles.page} className="print-only">
      <div style={styles.container}>

        {/* --- HEADER SECTION --- */}
        <div className="preview-only-header" style={styles.header}>
          <div
            style={{
              minHeight: '20mm',
              paddingTop: '2mm',
              paddingBottom: '1mm',
              backgroundColor: '#E6C62F',
              color: '#303030',
              borderBottom: '0.8pt solid #8A7A22',
              boxSizing: 'border-box',
              wordBreak: 'break-word',
            }}
          >
            {(showTempleNameKn || showTempleName) && (
              <div style={{ fontSize: '10pt', fontWeight: '800', textTransform: 'uppercase' }}>
                {[
                  showTempleNameKn && templeNameKn,
                  showTempleName && templeName,
                ].filter(Boolean).join('  ')}
              </div>
            )}
            {showTempleAddress && (
              <div style={{ marginTop: '0.5mm', fontSize: '7pt', fontWeight: '600' }}>{templeAddress}</div>
            )}
            {contactLine && (
              <div style={{ marginTop: '0.5mm', fontSize: '7pt', fontWeight: '600' }}>{contactLine}</div>
            )}
          </div>
        </div>

        {/* --- DONATION DETAILS SECTION --- */}
        <div className="preview-only-border" style={styles.bodyBorder}>

        <div style={styles.detailsBlock}>
          <div style={{ ...styles.receiptTitle, color: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <span className="print-invisible">
              ಸೇವಾ ರಶೀದಿ / SEVA RECEIPT
            </span>
            {recordedByValue && (
              <span style={{ position: 'absolute', right: '2mm', fontSize: '9pt', fontWeight: '800', color: '#000', whiteSpace: 'nowrap' }}>
                {recordedByValue}
              </span>
            )}
          </div>
          <DetailRow
            left={<><strong style={{ fontWeight: 800 }}>Receipt No</strong> : {donation.receipt_display_number || donation.id}</>}
            right={<><strong style={{ fontWeight: 800 }}>Date</strong> : {format(receiptDate, 'dd-MM-yyyy')}&nbsp;&nbsp;<strong style={{ fontWeight: 800 }}>Time</strong> : {format(receiptDate, 'HH:mm:ss')}</>}
          />
          <DetailRow
            left={<><strong style={{ fontWeight: 800 }}>Name</strong> : {toTitleCase(donation.devotee_name)}</>}
            right={<><strong style={{ fontWeight: 800 }}>Mobile No</strong> : {donation.phone_number || ''}</>}
          />
          <DetailRow
            left={<><strong style={{ fontWeight: 800 }}>Address</strong> : {devoteeAddress}</>}
            right={<></>}
          />
        </div>

        {/* --- TABLE SECTION --- */}
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '37%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr style={{ height: '6mm' }}>
              <th style={styles.th}>ಕ್ರ.ಸಂ.</th>
              <th style={styles.th}>ಸೇವಾ ವಿವರ</th>
              <th style={styles.th}>ಪ್ರಮಾಣ</th>
              <th style={styles.th}>ದರ</th>
              <th style={{ ...styles.th, ...styles.mobalaguTh }}>ಮೊಬಲಗು</th>
            </tr>
          </thead>
          <tbody>
            {/* Main Seva Row */}
            <tr style={{ height: '10mm' }}>
              <td style={{ ...styles.td, textAlign: 'center', verticalAlign: 'middle' }}>1</td>

              <td style={{ ...styles.td, verticalAlign: 'middle' }}>
                {donationTypeName}
              </td>

              <td style={{ ...styles.td, textAlign: 'center', verticalAlign: 'middle' }}>
                1
              </td>

              <td style={{ ...styles.td, textAlign: 'center', verticalAlign: 'middle' }}>
                {isItemDonation ? '0.00' : totalAmount.toFixed(2)}
              </td>

              <td style={{ ...styles.td, textAlign: 'center', verticalAlign: 'middle' }}>
                {totalAmount.toFixed(2)}
              </td>
            </tr>

            {/* Item / Notes Row + TOTAL */}
            <tr style={{ height: '10mm' }}>
              <td colSpan="3"
                  style={{
                    ...styles.td,
                    fontWeight: '400',
                    fontSize: '9pt',
                    padding: '1.5mm 3mm',
                    whiteSpace: 'pre-line',
                    verticalAlign: 'middle'
                  }}>
                {donation.donation_mode === 0
                  ? [subItems, notes].filter(Boolean).join('\n')
                  : [`${donationTypeName} on ${format(receiptDate, 'dd-MM-yyyy')}`, notes].filter(Boolean).join('\n')}
              </td>

              <td
                style={{
                  ...styles.td,
                  textAlign: 'center',
                  fontWeight: '800',
                  verticalAlign: 'middle'
                }}
              >
                TOTAL
              </td>

              <td
                style={{
                  ...styles.td,
                  textAlign: 'center',
                  verticalAlign: 'middle'
                }}
              >
                {totalAmount.toFixed(2)}
              </td>
            </tr>

          </tbody>
        </table>
        </div>

      </div>
    </div>
  );
});

PrePrintedSevaReceipt.displayName = 'PrePrintedSevaReceipt';

export default PrePrintedSevaReceipt;
