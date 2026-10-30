// ═══════════════════════════════════════════════════════════
// routes/invoices.routes.js — Invoice register & dashboards
//
// Mount at /api so that /api/clients/:id/invoices etc. resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/invoices.routes'));
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const { readDB, writeDB } = require('../db');
const { auth, adminOnly, clientScope } = require('../middleware/auth');
const { newId, num, addDays } = require('../utils/helpers');
const {
  buildInvoiceDashboard,
  buildPeriodDashboard,
  buildSeries,
  buildPivot,
  pivotCellInvoices,
  buildBankPosition,
  invoiceFilterOptions
} = require('../services/invoice.service');

// ── Admin: replace a client's invoice register with parsed rows ─────────────
router.post('/clients/:id/invoices', auth, adminOnly, (req, res) => {
  const db = readDB();
  const client = (db.clients || []).find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!db.invoices) db.invoices = [];
  // Preserve any actualDate already entered, matching by invoiceNo
  const prior = {};
  db.invoices.filter(iv => iv.clientId === req.params.id).forEach(iv => { if (iv.invoiceNo) prior[iv.invoiceNo] = iv.actualDate || null; });
  // Remove this client's existing invoices, then add the new set
  db.invoices = db.invoices.filter(iv => iv.clientId !== req.params.id);
  const replace = req.body.replace !== false;
  let added = 0;
  rows.forEach(r => {
    const invDate = r.invoiceDate ? String(r.invoiceDate).slice(0, 10) : null;
    if (!invDate && !r.invoiceNo) return;
    const inv = {
      id: newId(), clientId: req.params.id,
      invoiceDate: invDate,
      gstNo: r.gstNo || '', ownGstin: r.ownGstin || '', jobCode: r.jobCode || '', contractNo: r.contractNo || '',
      invoiceNo: r.invoiceNo || '', customerName: r.customerName || '', state: r.state || '', address: r.address || '',
      invoiceValue: num(r.invoiceValue), taxableValue: num(r.taxableValue), gst: num(r.gst), tds: num(r.tds),
      retention: num(r.retention), gstTds: num(r.gstTds), gstWithholding: num(r.gstWithholding),
      forexLd: num(r.forexLd), otherDeduction: num(r.otherDeduction),
      netReceivable: num(r.netReceivable),
      estimatedDate: addDays(invDate, 30),
      actualDate: (replace && prior[r.invoiceNo]) ? prior[r.invoiceNo] : (r.actualDate ? String(r.actualDate).slice(0, 10) : null),
      uploadedAt: new Date().toISOString()
    };
    db.invoices.push(inv); added++;
  });
  // Bank balances & outflows (replace this client's set)
  if (!db.bankBalances) db.bankBalances = [];
  if (!db.outflows) db.outflows = [];
  if (Array.isArray(req.body.banks)) {
    db.bankBalances = db.bankBalances.filter(b => b.clientId !== req.params.id);
    req.body.banks.forEach(b => {
      if (!b.bankName) return;
      db.bankBalances.push({ id: newId(), clientId: req.params.id, bankName: b.bankName, accountLast4: b.accountLast4 || '', openingBalance: num(b.openingBalance), asOnDate: b.asOnDate || null });
    });
  }
  if (Array.isArray(req.body.outflows)) {
    db.outflows = db.outflows.filter(o => o.clientId !== req.params.id);
    req.body.outflows.forEach(o => {
      if (!o.date || !o.amount) return;
      db.outflows.push({ id: newId(), clientId: req.params.id, date: String(o.date).slice(0, 10), bankName: o.bankName || '', paidTo: o.paidTo || '', category: o.category || '', description: o.description || '', amount: num(o.amount) });
    });
  }
  if (!db.fixedExpenses) db.fixedExpenses = [];
  if (Array.isArray(req.body.fixedExpenses)) {
    db.fixedExpenses = db.fixedExpenses.filter(f => f.clientId !== req.params.id);
    req.body.fixedExpenses.forEach(f => {
      if (!f.name || !f.monthlyAmount) return;
      let day = parseInt(f.dueDay) || 1; if (day < 1) day = 1; if (day > 31) day = 31;
      const freq = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].includes(f.frequency) ? f.frequency : 'Monthly';
      db.fixedExpenses.push({ id: newId(), clientId: req.params.id, name: f.name, category: f.category || '', bankName: f.bankName || '', frequency: freq, firstMonth: f.firstMonth || 'April', dueDay: day, monthlyAmount: num(f.monthlyAmount) });
    });
  }
  // Credit notes (negative, reduce sales) & Debit notes (positive, increase sales)
  if (!db.salesNotes) db.salesNotes = [];
  const incomingNotes = [].concat(Array.isArray(req.body.creditNotes) ? req.body.creditNotes : [], Array.isArray(req.body.debitNotes) ? req.body.debitNotes : []);
  if (Array.isArray(req.body.creditNotes) || Array.isArray(req.body.debitNotes)) {
    db.salesNotes = db.salesNotes.filter(n => n.clientId !== req.params.id);
    incomingNotes.forEach(n => {
      const amt = num(n.amount != null ? n.amount : (n.taxableValue || n.netReceivable));
      if (!n.date || (!amt && !num(n.netReceivable))) return;
      db.salesNotes.push({
        id: newId(), clientId: req.params.id, date: String(n.date).slice(0, 10),
        noteNo: n.noteNo || '', customerName: n.customerName || '', gstNo: n.gstNo || '', ownGstin: n.ownGstin || '',
        against: n.against || '', reason: n.reason || '', jobCode: n.jobCode || '', contractNo: n.contractNo || '',
        state: n.state || '', address: n.address || '',
        invoiceValue: num(n.invoiceValue), taxableValue: num(n.taxableValue), gst: num(n.gst), tds: num(n.tds),
        netReceivable: num(n.netReceivable),
        amount: amt, type: amt < 0 ? 'credit' : 'debit'
      });
    });
  }
  writeDB(db);
  res.json({ ok: true, count: added, banks: (req.body.banks || []).length, outflows: (req.body.outflows || []).length, notes: incomingNotes.length });
});

// ── Admin: list a client's invoices ─────────────────────────────────────────
router.get('/clients/:id/invoices', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.invoices || []).filter(iv => iv.clientId === req.params.id)
    .sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || '')));
});

// ── Accountant/admin: set the actual payment date on an invoice ─────────────
router.put('/invoices/:invId', auth, (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Clients cannot edit invoices.' });
  const db = readDB();
  const i = (db.invoices || []).findIndex(iv => iv.id === req.params.invId);
  if (i === -1) return res.status(404).json({ error: 'Invoice not found.' });
  if (req.body.actualDate !== undefined) db.invoices[i].actualDate = req.body.actualDate ? String(req.body.actualDate).slice(0, 10) : null;
  writeDB(db);
  res.json(db.invoices[i]);
});

// ── Client: their own invoice dashboard ─────────────────────────────────────
router.get('/client/invoice-dashboard', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildInvoiceDashboard(db, sc.ids, { customer: req.query.customer, gstin: req.query.gstin, fy: req.query.fy }));
});

// ── Client: distinct customers + GSTINs for filter dropdowns ────────────────
router.get('/client/invoice-filters', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(invoiceFilterOptions(db, sc.ids));
});

// ── Admin: preview a client's dashboard ─────────────────────────────────────
router.get('/clients/:id/invoice-dashboard', auth, adminOnly, (req, res) => {
  res.json(buildInvoiceDashboard(readDB(), req.params.id));
});

// ── Period dashboard ────────────────────────────────────────────────────────
router.get('/client/period-dashboard', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const type = ['month','quarter','half','fy'].includes(req.query.type) ? req.query.type : 'month';
  { const db = readDB(); const sc = clientScope(req, db); res.json(buildPeriodDashboard(db, sc.ids, type, req.query.anchor)); }
});
router.get('/clients/:id/period-dashboard', auth, adminOnly, (req, res) => {
  const type = ['month','quarter','half','fy'].includes(req.query.type) ? req.query.type : 'month';
  res.json(buildPeriodDashboard(readDB(), req.params.id, type, req.query.anchor));
});

// ── Billing/Cashflow SERIES ─────────────────────────────────────────────────
router.get('/client/billing-series', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const gran = ['month','quarter','half','annual','all'].includes(req.query.gran) ? req.query.gran : 'month';
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildSeries(db, sc.ids, req.query.fy || 'all', gran, { customer: req.query.customer, gstin: req.query.gstin }));
});
router.get('/clients/:id/billing-series', auth, adminOnly, (req, res) => {
  const gran = ['month','quarter','half','annual','all'].includes(req.query.gran) ? req.query.gran : 'month';
  res.json(buildSeries(readDB(), req.params.id, req.query.fy || 'all', gran));
});

// ── Billing PIVOT ───────────────────────────────────────────────────────────
router.get('/client/billing-pivot', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildPivot(db, sc.ids, req.query.gran, { customer: req.query.customer, gstin: req.query.gstin }));
});
router.get('/clients/:id/billing-pivot', auth, adminOnly, (req, res) => {
  res.json(buildPivot(readDB(), req.params.id, req.query.gran));
});

// ── Pivot cell drill-down ───────────────────────────────────────────────────
router.get('/client/pivot-cell', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(pivotCellInvoices(db, sc.ids, req.query.gran || 'month', req.query.row, req.query.fy, req.query.metric, { customer: req.query.customer, gstin: req.query.gstin }));
});
router.get('/clients/:id/pivot-cell', auth, adminOnly, (req, res) => {
  res.json(pivotCellInvoices(readDB(), req.params.id, req.query.gran || 'month', req.query.row, req.query.fy, req.query.metric, { customer: req.query.customer, gstin: req.query.gstin }));
});

// ── Bank cash position ──────────────────────────────────────────────────────
router.get('/client/bank-position', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildBankPosition(db, sc.ids, req.query.fy, { customer: req.query.customer, gstin: req.query.gstin }));
});
router.get('/clients/:id/bank-position', auth, adminOnly, (req, res) => {
  res.json(buildBankPosition(readDB(), req.params.id, req.query.fy));
});

module.exports = router;
