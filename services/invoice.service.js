// ═══════════════════════════════════════════════════════════
// services/invoice.service.js — Invoice dashboard helpers
// ═══════════════════════════════════════════════════════════
const { MS_DAY } = require('../config');
const { num, saleValue, addDays, monthKeyOf } = require('../utils/helpers');

// ── Date-range helpers (Indian Financial Year: Apr–Mar) ─────────────────────

function monthName(m) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];
}

// Returns {start, end (exclusive), label} for a period containing `anchor`.
function periodRange(type, anchor) {
  const d = new Date(anchor); const Y = d.getFullYear(); const M = d.getMonth(); // 0-based
  const mk = (y, m) => new Date(y, m, 1);
  const fyStartYear = (M >= 3) ? Y : Y - 1; // FY starts in April (month index 3)
  if (type === 'month') {
    return { start: mk(Y, M), end: mk(Y, M + 1), label: monthName(M) + " '" + String(Y).slice(2) };
  }
  if (type === 'quarter') {
    // FY quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
    const fq = Math.floor(((M + 9) % 12) / 3); // 0..3 where 0=Apr
    const qStartMonth = (3 + fq * 3) % 12;
    const qStartYear = (qStartMonth < 3) ? fyStartYear + 1 : fyStartYear;
    return { start: mk(qStartYear, qStartMonth), end: mk(qStartYear, qStartMonth + 3), label: 'Q' + (fq + 1) + ' FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
  }
  if (type === 'half') {
    // H1 Apr-Sep, H2 Oct-Mar
    const isH1 = (M >= 3 && M <= 8);
    if (isH1) return { start: mk(fyStartYear, 3), end: mk(fyStartYear, 9), label: 'H1 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
    return { start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3), label: 'H2 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
  }
  // financial year
  return { start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3), label: 'FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
}

function prevPeriodAnchor(type, anchor) {
  const r = periodRange(type, anchor);
  return new Date(r.start.getTime() - 86400000); // one day before start = previous period
}

function inRange(dateStr, range) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

// Aggregate one period's figures from a client's invoices
function periodFigures(invs, range) {
  let billed = 0, received = 0, estimatedInflow = 0, actualInflow = 0, billedCount = 0, recvCount = 0;
  let collectedFromPeriod = 0, pendingFromPeriod = 0; // of invoices BILLED in this period
  invs.forEach(iv => {
    const recvAmt = iv.netReceivable || 0;
    const saleAmt = saleValue(iv);
    if (inRange(iv.invoiceDate, range)) {
      billed += saleAmt; billedCount++;
      // Of the invoices billed this period: how much has been collected vs still outstanding (receivable)
      if (iv.actualDate) collectedFromPeriod += recvAmt; else pendingFromPeriod += saleAmt;
    }
    if (iv.actualDate && inRange(iv.actualDate, range)) { received += recvAmt; actualInflow += recvAmt; recvCount++; }
    if (iv.estimatedDate && inRange(iv.estimatedDate, range)) { estimatedInflow += recvAmt; }
  });
  return { billed, received, estimatedInflow, actualInflow, billedCount, recvCount, collectedFromPeriod, pendingFromPeriod };
}

function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0; // null = no baseline
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

// ── Sanitization & filtering ────────────────────────────────────────────────

// fyStartYear of a date (Apr–Mar). Returns the FY label like "FY24-25".
function fyOf(dateStr) {
  const d = new Date(dateStr); if (isNaN(d)) return null;
  const y = d.getFullYear(), m = d.getMonth();
  const s = (m >= 3) ? y : y - 1;
  return { startYear: s, label: 'FY' + String(s).slice(2) + '-' + String(s + 1).slice(2) };
}

// Keep only invoices with a plausible invoice date (drops phantom years like FY99-00).
function inSaneRange(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const y = d.getFullYear();
  return y >= 2010 && y <= new Date().getFullYear() + 5;
}

function sanitizeInvoices(invs) {
  return invs.filter(iv => inSaneRange(iv.invoiceDate)).map(iv => ({
    ...iv,
    // Null out any out-of-range actual/estimated dates so they can't create phantom periods
    actualDate: inSaneRange(iv.actualDate) ? iv.actualDate : null,
    estimatedDate: inSaneRange(iv.estimatedDate) ? iv.estimatedDate : (inSaneRange(iv.invoiceDate) ? addDays(iv.invoiceDate, 30) : null)
  }));
}

// Like sanitizeInvoices but KEEPS every row (does not drop rows with missing/odd invoice dates)
// so dashboard totals always reconcile with the source template. Only cleans payment/estimated dates.
function sanitizeInvoicesKeepAll(invs) {
  return invs.map(iv => ({
    ...iv,
    actualDate: inSaneRange(iv.actualDate) ? iv.actualDate : null,
    estimatedDate: inSaneRange(iv.estimatedDate) ? iv.estimatedDate : (inSaneRange(iv.invoiceDate) ? addDays(iv.invoiceDate, 30) : null)
  }));
}

// Apply optional customer / GSTIN filters (opts may be undefined)
function applyInvFilter(invs, opts) {
  if (!opts) return invs;
  let out = invs;
  if (opts.customer && opts.customer !== 'all') out = out.filter(iv => (iv.customerName || '') === opts.customer);
  if (opts.gstin && opts.gstin !== 'all') out = out.filter(iv => (iv.ownGstin || '') === opts.gstin);
  return out;
}

// Convert credit/debit notes for the given clients into invoice-like billing adjustments.
// Credit notes are negative (reduce sales), debit notes positive (increase sales).
function notesForClients(db, idset) {
  return (db.salesNotes || []).filter(n => idset.includes(n.clientId) && inSaneRange(n.date)).map(n => {
    const taxable = (n.taxableValue != null && n.taxableValue !== 0) ? n.taxableValue : (n.amount || 0);
    const net = (n.netReceivable != null && n.netReceivable !== 0) ? n.netReceivable : (n.amount || 0);
    return {
      id: 'note-' + n.id, clientId: n.clientId, invoiceDate: n.date,
      invoiceNo: (n.type === 'credit' ? 'CN-' : 'DN-') + (n.noteNo || ''),
      customerName: n.customerName || '', ownGstin: n.ownGstin || '', gstNo: n.gstNo || '',
      netReceivable: net, invoiceValue: (n.invoiceValue || net), taxableValue: taxable,
      estimatedDate: null, actualDate: null, isNote: true, noteType: n.type
    };
  });
}

// Distinct customers and GSTINs for a client's invoices (for filter dropdowns)
function invoiceFilterOptions(db, clientIds) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = (db.invoices || []).filter(iv => idset.includes(iv.clientId));
  const custs = [...new Set(invs.map(iv => iv.customerName).filter(Boolean))].sort();
  const gstins = [...new Set(invs.map(iv => iv.ownGstin).filter(Boolean))].sort();
  return { customers: custs, gstins };
}

// ── Bucket / series helpers ─────────────────────────────────────────────────

// List the period buckets for a given FY (or all FYs) at a granularity
function bucketsFor(granularity, fyStartYear) {
  const mk = (y, m) => new Date(y, m, 1);
  const out = [];
  if (granularity === 'month') {
    for (let i = 0; i < 12; i++) { const m = (3 + i) % 12; const y = m < 3 ? fyStartYear + 1 : fyStartYear; out.push({ start: mk(y, m), end: mk(y, m + 1), label: monthName(m) + " '" + String(y).slice(2) }); }
  } else if (granularity === 'quarter') {
    for (let q = 0; q < 4; q++) { const sm = (3 + q * 3) % 12; const y = sm < 3 ? fyStartYear + 1 : fyStartYear; out.push({ start: mk(y, sm), end: mk(y, sm + 3), label: 'Q' + (q + 1) + ' FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) }); }
  } else if (granularity === 'half') {
    out.push({ start: mk(fyStartYear, 3), end: mk(fyStartYear, 9), label: 'H1 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) });
    out.push({ start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3), label: 'H2 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) });
  } else { // annual = whole FY as one bucket
    out.push({ start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3), label: 'FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) });
  }
  return out;
}

// Does a fixed expense fall due in FY month index i (0=April … 11=March)?
function fixedDueInMonth(f, i) {
  const MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March'];
  let firstIdx = MONTHS.indexOf(f.firstMonth || 'April');
  if (firstIdx < 0) firstIdx = 0;
  const freq = f.frequency || 'Monthly';
  if (freq === 'Monthly') return true; // every month regardless of firstMonth
  const step = freq === 'Quarterly' ? 3 : freq === 'Half-Yearly' ? 6 : 12; // Yearly = once
  if (i < firstIdx) return false;
  return ((i - firstIdx) % step) === 0;
}

// ── Dashboard builders ──────────────────────────────────────────────────────

// Build the dashboard payload for a client's invoices
function buildInvoiceDashboard(db, clientIds, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  // Use the FULL set (don't drop rows with missing/odd dates) so totals reconcile with the template.
  // sanitizeInvoices is only used to null out-of-range payment/estimated dates, not to exclude rows.
  let invs = applyInvFilter(sanitizeInvoicesKeepAll((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  // Optional financial-year filter (by invoice date)
  if (opts && opts.fy && opts.fy !== 'all') {
    const y = parseInt(opts.fy);
    if (!isNaN(y)) invs = invs.filter(iv => { const f = fyOf(iv.invoiceDate); return f && f.startYear === y; });
  }
  // Monthly billing summary keyed by invoice month
  const monthly = {}; // mk -> {billed, received, pending}
  const inflow = {};   // estimated-date month -> amount still expected
  const byCustomer = {}; // customerName -> {totalDays, paidCount, outstanding}
  invs.forEach(iv => {
    // Sales/billing amount = taxable value (notes carry their value in taxableValue too)
    const saleAmt = saleValue(iv);
    // Debtor/receivable amount = net receivable (cash); pending shown on taxable basis per requirement
    const recvAmt = iv.netReceivable || 0;
    const mk = monthKeyOf(iv.invoiceDate);
    if (mk) {
      if (!monthly[mk]) monthly[mk] = { billed: 0, received: 0, pending: 0 };
      monthly[mk].billed += saleAmt;
      if (iv.actualDate) monthly[mk].received += recvAmt; else monthly[mk].pending += saleAmt;
    }
    // Estimated cash inflow: unpaid invoices grouped by estimated month (receivable amount)
    if (!iv.actualDate && iv.estimatedDate) {
      const em = monthKeyOf(iv.estimatedDate);
      inflow[em] = (inflow[em] || 0) + recvAmt;
    }
    // Debtor recovery period per customer
    const cust = iv.customerName || '—';
    if (!byCustomer[cust]) byCustomer[cust] = { totalDays: 0, paidCount: 0, outstanding: 0, billed: 0, receivable: 0 };
    byCustomer[cust].billed += saleAmt;
    byCustomer[cust].receivable += recvAmt;
    if (iv.actualDate && iv.invoiceDate) {
      const days = Math.round((new Date(iv.actualDate) - new Date(iv.invoiceDate)) / MS_DAY);
      if (days >= 0) { byCustomer[cust].totalDays += days; byCustomer[cust].paidCount += 1; }
    } else if (!iv.actualDate) {
      byCustomer[cust].outstanding += saleAmt;
    }
  });
  const monthlyArr = Object.keys(monthly).sort().map(mk => ({ month: mk, ...monthly[mk] }));
  const inflowArr = Object.keys(inflow).sort().map(mk => ({ month: mk, amount: inflow[mk] }));
  const recovery = Object.keys(byCustomer).sort().map(name => {
    const c = byCustomer[name];
    return { customer: name, avgDays: c.paidCount ? Math.round(c.totalDays / c.paidCount) : null,
      paidInvoices: c.paidCount, outstanding: c.outstanding, totalBilled: c.billed, received: (c.receivable - c.outstanding) };
  });
  const taxableOf = saleValue;
  const totals = {
    billed: invs.reduce((s, iv) => s + taxableOf(iv), 0),
    received: invs.filter(iv => iv.actualDate).reduce((s, iv) => s + (iv.netReceivable || 0), 0),
    pending: invs.filter(iv => !iv.actualDate).reduce((s, iv) => s + taxableOf(iv), 0),
    count: invs.length
  };
  return { monthly: monthlyArr, inflow: inflowArr, recovery, totals, hasData: invs.length > 0 };
}

// Period-aware billing + cashflow for a client
function buildPeriodDashboard(db, clientIds, type, anchorStr) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId)));
  const anchor = anchorStr ? new Date(anchorStr) : new Date();
  const curRange = periodRange(type, anchor);
  const prevRange = periodRange(type, prevPeriodAnchor(type, anchor));
  const cur = periodFigures(invs, curRange);
  const prev = periodFigures(invs, prevRange);
  // Monthly breakdown within the current period (for the chart)
  const months = [];
  let m = new Date(curRange.start);
  while (m < curRange.end) {
    const mr = { start: new Date(m.getFullYear(), m.getMonth(), 1), end: new Date(m.getFullYear(), m.getMonth() + 1, 1) };
    const f = periodFigures(invs, mr);
    months.push({ month: m.toISOString().slice(0, 7),
      billed: f.billed, received: f.collectedFromPeriod, pending: f.pendingFromPeriod,
      estimatedInflow: f.estimatedInflow, actualInflow: f.actualInflow });
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  }
  return {
    hasData: invs.length > 0,
    type, periodLabel: curRange.label, prevLabel: prevRange.label,
    current: cur, previous: prev,
    change: {
      billed: pctChange(cur.billed, prev.billed),
      received: pctChange(cur.received, prev.received),
      estimatedInflow: pctChange(cur.estimatedInflow, prev.estimatedInflow),
      actualInflow: pctChange(cur.actualInflow, prev.actualInflow)
    },
    months
  };
}

function buildSeries(db, clientIds, fyParam, granularity, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  if (!invs.length) return { hasData: false, fyList: [], series: [] };
  // Determine all FYs present (by invoice date, estimated date, actual date)
  const fySet = {};
  invs.forEach(iv => { [iv.invoiceDate, iv.estimatedDate, iv.actualDate].forEach(dt => { if (dt) { const f = fyOf(dt); if (f) fySet[f.startYear] = f.label; } }); });
  const fyYears = Object.keys(fySet).map(Number).sort();
  const fyList = fyYears.map(y => ({ value: String(y), label: fySet[y] }));
  // Which FYs to include
  const targetYears = (fyParam && fyParam !== 'all') ? [parseInt(fyParam)] : fyYears;
  let buckets = [];
  if (granularity === 'all') {
    // One bucket per FY (same as annual across all selected years)
    targetYears.forEach(y => buckets.push(...bucketsFor('annual', y)));
  } else {
    targetYears.forEach(y => buckets.push(...bucketsFor(granularity, y)));
  }
  const series = buckets.map(b => {
    const f = periodFigures(invs, b);
    // invoices billed in this bucket, for drill-down
    const billedInvs = invs.filter(iv => inRange(iv.invoiceDate, b)).map(iv => ({
      invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName,
      netReceivable: iv.netReceivable, taxableValue: saleValue(iv), estimatedDate: iv.estimatedDate, actualDate: iv.actualDate
    }));
    const estInvs = invs.filter(iv => inRange(iv.estimatedDate, b)).map(iv => ({
      invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName,
      netReceivable: iv.netReceivable, estimatedDate: iv.estimatedDate, actualDate: iv.actualDate
    }));
    const actInvs = invs.filter(iv => iv.actualDate && inRange(iv.actualDate, b)).map(iv => ({
      invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName,
      netReceivable: iv.netReceivable, estimatedDate: iv.estimatedDate, actualDate: iv.actualDate
    }));
    return {
      label: b.label,
      billed: f.billed, received: f.collectedFromPeriod, pending: f.pendingFromPeriod,
      estimatedInflow: f.estimatedInflow, actualInflow: f.actualInflow,
      billedInvoices: billedInvs, estimatedInvoices: estInvs, actualInvoices: actInvs
    };
  });
  return { hasData: true, fyList, series };
}

function buildPivot(db, clientIds, granularity, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  if (!invs.length) return { hasData: false, fyList: [], rows: [] };
  granularity = ['month','quarter','half','annual'].includes(granularity) ? granularity : 'month';
  // Determine FYs present
  const fySet = {};
  invs.forEach(iv => { [iv.invoiceDate, iv.estimatedDate, iv.actualDate].forEach(dt => { if (dt) { const f = fyOf(dt); if (f) fySet[f.startYear] = f.label; } }); });
  const fyYears = Object.keys(fySet).map(Number).sort();
  const fyCols = fyYears.map(y => ({ startYear: y, label: fySet[y] }));
  // Row labels (period within a FY) — generic names independent of year
  const rowDefs = (() => {
    if (granularity === 'month') return ['April','May','June','July','August','September','October','November','December','January','February','March'].map((nm, i) => ({ key: 'm' + i, label: nm, monthOffset: i }));
    if (granularity === 'quarter') return [0,1,2,3].map(q => ({ key: 'q' + q, label: 'Q' + (q + 1), q }));
    if (granularity === 'half') return [0,1].map(h => ({ key: 'h' + h, label: 'H' + (h + 1), h }));
    return [{ key: 'fy', label: 'Full Year', fy: true }];
  })();
  const mk = (y, m) => new Date(y, m, 1);
  // Build a range for a row within a given FY start year
  function rangeFor(rowDef, fyStartYear) {
    if (granularity === 'month') { const off = rowDef.monthOffset; const m = (3 + off) % 12; const y = m < 3 ? fyStartYear + 1 : fyStartYear; return { start: mk(y, m), end: mk(y, m + 1) }; }
    if (granularity === 'quarter') { const sm = (3 + rowDef.q * 3) % 12; const y = sm < 3 ? fyStartYear + 1 : fyStartYear; return { start: mk(y, sm), end: mk(y, sm + 3) }; }
    if (granularity === 'half') { return rowDef.h === 0 ? { start: mk(fyStartYear, 3), end: mk(fyStartYear, 9) } : { start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3) }; }
    return { start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3) };
  }
  const rows = rowDefs.map(rd => {
    const cells = fyCols.map(fc => {
      const f = periodFigures(invs, rangeFor(rd, fc.startYear));
      return { fy: fc.label, billed: f.billed, received: f.collectedFromPeriod, pending: f.pendingFromPeriod, estimated: f.estimatedInflow, actual: f.actualInflow };
    });
    const allZero = cells.every(c => !c.billed && !c.received && !c.pending && !c.estimated && !c.actual);
    return { label: rd.label, cells, allZero };
  });
  // Which FY columns actually carry data (drop entirely-empty years like a phantom FY99-00)
  const colHasData = fyCols.map((_, ci) => rows.some(r => { const c = r.cells[ci]; return c.billed || c.received || c.pending || c.estimated || c.actual; }));
  const keptCols = fyCols.filter((_, ci) => colHasData[ci]);
  const trimmedRows = rows
    .filter(r => !r.allZero)
    .map(r => ({ label: r.label, cells: r.cells.filter((_, ci) => colHasData[ci]) }));
  return { hasData: trimmedRows.length > 0 && keptCols.length > 0, fyCols: keptCols, rows: trimmedRows, granularity };
}

// Invoices behind a pivot cell. params: gran, row (label), fy (FY label), metric (billed|pending|actual|estimated)
function pivotCellInvoices(db, clientIds, gran, rowLabel, fyLabel, metric, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  // find FY start year from label like "FY24-25"
  const m = /FY(\d{2})-(\d{2})/.exec(fyLabel || ''); if (!m) return [];
  const fyStartYear = 2000 + parseInt(m[1]);
  const mk = (y, mo) => new Date(y, mo, 1);
  // resolve the row's date range within that FY
  let range = null;
  const months = ['April','May','June','July','August','September','October','November','December','January','February','March'];
  if (gran === 'month') { const off = months.indexOf(rowLabel); if (off < 0) return []; const mo = (3 + off) % 12; const y = mo < 3 ? fyStartYear + 1 : fyStartYear; range = { start: mk(y, mo), end: mk(y, mo + 1) }; }
  else if (gran === 'quarter') { const q = parseInt((rowLabel.match(/Q(\d)/) || [])[1]) - 1; if (isNaN(q)) return []; const sm = (3 + q * 3) % 12; const y = sm < 3 ? fyStartYear + 1 : fyStartYear; range = { start: mk(y, sm), end: mk(y, sm + 3) }; }
  else if (gran === 'half') { const h = rowLabel.indexOf('1') >= 0 ? 0 : 1; range = h === 0 ? { start: mk(fyStartYear, 3), end: mk(fyStartYear, 9) } : { start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3) }; }
  else { range = { start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3) }; }
  const pick = invs.filter(iv => {
    if (metric === 'billed') return inRange(iv.invoiceDate, range);
    if (metric === 'pending') return inRange(iv.invoiceDate, range) && !iv.actualDate;
    if (metric === 'actual') return iv.actualDate && inRange(iv.actualDate, range);
    if (metric === 'estimated') return iv.estimatedDate && inRange(iv.estimatedDate, range);
    return false;
  });
  return pick.map(iv => ({ invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName, netReceivable: iv.netReceivable, taxableValue: saleValue(iv), estimatedDate: iv.estimatedDate, actualDate: iv.actualDate, isNote: iv.isNote }));
}

function buildBankPosition(db, clientIds, fyParam, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))), opts);
  const banks = (db.bankBalances || []).filter(b => idset.includes(b.clientId));
  const outflows = (db.outflows || []).filter(o => idset.includes(o.clientId) && inSaneRange(o.date));
  const fixedExp = (db.fixedExpenses || []).filter(f => idset.includes(f.clientId));
  const fixedMonthly = fixedExp.reduce((s, f) => s + (f.monthlyAmount || 0), 0);
  const openingTotal = banks.reduce((s, b) => s + (b.openingBalance || 0), 0);
  // Determine FYs present from invoice/actual/outflow dates
  const fySet = {};
  invs.forEach(iv => { [iv.invoiceDate, iv.actualDate].forEach(dt => { if (dt) { const f = fyOf(dt); if (f) fySet[f.startYear] = f.label; } }); });
  outflows.forEach(o => { const f = fyOf(o.date); if (f) fySet[f.startYear] = f.label; });
  const fyYears = Object.keys(fySet).map(Number).sort();
  const fyList = fyYears.map(y => ({ value: String(y), label: fySet[y] }));
  if (!fyYears.length) return { hasData: banks.length > 0 || fixedExp.length > 0, fyList, openingTotal, banks, fixedExpenses: fixedExp, fixedMonthly, months: [] };
  const targetYear = (fyParam && fyParam !== 'all') ? parseInt(fyParam) : fyYears[fyYears.length - 1]; // default latest FY
  const mk = (y, m) => new Date(y, m, 1);
  let running = openingTotal;
  const monthsArr = [];
  for (let i = 0; i < 12; i++) {
    const mo = (3 + i) % 12; const y = mo < 3 ? targetYear + 1 : targetYear;
    const range = { start: mk(y, mo), end: mk(y, mo + 1) };
    const inflowAmt = invs.filter(iv => iv.actualDate && inRange(iv.actualDate, range)).reduce((s, iv) => s + (iv.netReceivable || 0), 0);
    const variableOut = outflows.filter(o => inRange(o.date, range)).reduce((s, o) => s + (o.amount || 0), 0);
    const fixedOut = fixedExp.filter(f => fixedDueInMonth(f, i)).reduce((s, f) => s + (f.monthlyAmount || 0), 0);
    const outflow = variableOut + fixedOut;
    const opening = running;
    running = opening + inflowAmt - outflow;
    monthsArr.push({ month: mk(y, mo).toISOString().slice(0, 7), label: monthName(mo) + " '" + String(y).slice(2), opening, inflow: inflowAmt, fixedOut, variableOut, outflow, closing: running });
  }
  return { hasData: banks.length > 0 || fixedExp.length > 0 || monthsArr.some(m => m.inflow || m.outflow), fyList, fyStartYear: targetYear, fyLabel: fySet[targetYear], openingTotal, banks, fixedExpenses: fixedExp, fixedMonthly, months: monthsArr };
}

module.exports = {
  buildInvoiceDashboard,
  buildPeriodDashboard,
  buildSeries,
  buildPivot,
  pivotCellInvoices,
  buildBankPosition,
  invoiceFilterOptions
};
