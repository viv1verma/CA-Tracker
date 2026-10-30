// ═══════════════════════════════════════════════════════════
// routes/compliance.routes.js — Compliance tracker endpoints
//
// Mount at /api so that /api/clients/:id/compliance etc. resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/compliance.routes'));
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const { readDB, writeDB } = require('../db');
const { auth, adminOnly, clientScope } = require('../middleware/auth');
const { newId } = require('../utils/helpers');

// ── Compliance definitions & statuses ───────────────────────────────────────
const COMPLIANCE_DEFS = [
  { key: 'gstr1',  label: 'GSTR-1',          group: 'GST', freq: 'monthly',   amt1: 'GST Liability', gstinWise: true },
  { key: 'gstr3b', label: 'GSTR-3B',         group: 'GST', freq: 'monthly',   amt1: 'Net Liability', amt2: 'GST Input (ITC)', gstinWise: true },
  { key: 'gst_tds',label: 'GST-TDS (GSTR-7)',group: 'GST', freq: 'monthly',   amt1: 'TDS u/s 51', gstinWise: true },
  { key: 'isd',    label: 'ISD (GSTR-6)',    group: 'GST', freq: 'monthly',   amt1: 'ITC Distributed', gstinWise: true },
  { key: 'tds_pay',label: 'TDS Payment',     group: 'TDS', freq: 'monthly',   amt1: 'TDS Paid' },
  { key: 'tds_ret',label: 'TDS Return',      group: 'TDS', freq: 'quarterly' },
  { key: 'pf',     label: 'PF',              group: 'PF/ESI', freq: 'monthly', amt1: 'PF Paid' },
  { key: 'esi',    label: 'ESI',             group: 'PF/ESI', freq: 'monthly', amt1: 'ESI Paid' },
  { key: 'itr',    label: 'ITR',             group: 'Annual', freq: 'annual' },
  { key: 'gstr9',  label: 'GSTR-9 / 9C',     group: 'Annual', freq: 'annual', gstinWise: true },
  { key: 'roc',    label: 'ROC (AOC-4/MGT-7)', group: 'Annual', freq: 'annual' }
];
const COMPLIANCE_STATUSES = ['pending', 'filed', 'overdue', 'na'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function complianceScopeIds(req, db) {
  // client logs in -> only own; admin uses :id route
  if (req.params && req.params.id) return [req.params.id];
  const sc = clientScope(req, db);
  return sc.ids || [];
}

function getComplianceFor(db, clientId, fy) {
  db.compliance = db.compliance || {};
  const all = db.compliance[clientId] || [];
  return fy ? all.filter(r => String(r.fy) === String(fy)) : all;
}

function upsertCompliance(db, clientId, body) {
  db.compliance = db.compliance || {};
  db.compliance[clientId] = db.compliance[clientId] || [];
  const arr = db.compliance[clientId];
  const fy = String(body.fy || '');
  const period = String(body.period || '');     // e.g. '2026-04' month, '2026-Q1' qtr, or 'FY' for annual
  const obligation = String(body.obligation || '');
  const gstin = String(body.gstin || '').trim(); // '' for entity-wide obligations
  if (!fy || !period || !obligation) return { error: 'fy, period and obligation are required.' };
  if (!COMPLIANCE_DEFS.some(d => d.key === obligation)) return { error: 'Unknown obligation.' };
  let rec = arr.find(r => String(r.fy) === fy && String(r.period) === period && r.obligation === obligation && String(r.gstin || '') === gstin);
  if (!rec) { rec = { id: 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), fy, period, obligation, gstin }; arr.push(rec); }
  rec.gstin = gstin;
  if (body.status !== undefined) rec.status = COMPLIANCE_STATUSES.includes(body.status) ? body.status : 'pending';
  if (body.dueDate !== undefined) rec.dueDate = body.dueDate || '';
  if (body.filedDate !== undefined) rec.filedDate = body.filedDate || '';
  if (body.lateFee !== undefined) rec.lateFee = Number(body.lateFee) || 0;
  if (body.amount !== undefined) rec.amount = Number(body.amount) || 0;
  if (body.amount2 !== undefined) rec.amount2 = Number(body.amount2) || 0;
  if (body.note !== undefined) rec.note = (body.note || '').toString().slice(0, 500);
  rec.updatedAt = new Date().toISOString();
  return rec;
}

// ── Excel import helpers ────────────────────────────────────────────────────
const MONTH_TO_NUM = { april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,january:1,february:2,march:3 };

function fyStartYear(fyLabel) { // 'FY26-27' -> 2026
  const mm = String(fyLabel||'').match(/FY?\s*(\d{2})/i); return mm ? 2000 + parseInt(mm[1]) : null;
}

function periodForMonth(fyLabel, monthName) {
  const y = fyStartYear(fyLabel); const mn = MONTH_TO_NUM[String(monthName||'').trim().toLowerCase()];
  if(!y||!mn) return null;
  const year = mn >= 4 ? y : y+1;
  return year + '-' + String(mn).padStart(2,'0');
}

function normStatus(s) { s=String(s||'').trim().toLowerCase(); if(s.startsWith('file'))return 'filed'; if(s.startsWith('overd'))return 'overdue'; if(s.startsWith('pend'))return 'pending'; if(s==='na'||s==='not applicable'||s==='n/a')return 'na'; return s||''; }

function cellNum(v) { if(v===undefined||v===null||v==='')return undefined; const n=Number(String(v).replace(/[, ]/g,'')); return isNaN(n)?undefined:n; }

function cellDate(v) { if(v===undefined||v===null||v==='')return ''; return String(v).trim(); }

// ── Routes ──────────────────────────────────────────────────────────────────

// List records for a client + FY (admin route)
router.get('/clients/:id/compliance', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json({ defs: COMPLIANCE_DEFS, statuses: COMPLIANCE_STATUSES, records: getComplianceFor(db, req.params.id, req.query.fy) });
});

// Client self-view
router.get('/client/compliance', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const ids = (clientScope(req, db).ids) || [];
  let records = [];
  ids.forEach(id => { records = records.concat(getComplianceFor(db, id, req.query.fy)); });
  res.json({ defs: COMPLIANCE_DEFS, statuses: COMPLIANCE_STATUSES, records });
});

// Upsert a compliance record
router.put('/clients/:id/compliance', auth, adminOnly, (req, res) => {
  const db = readDB();
  const rec = upsertCompliance(db, req.params.id, req.body);
  if (rec.error) return res.status(400).json(rec);
  writeDB(db);
  res.json(rec);
});

// Delete a compliance record
router.delete('/clients/:id/compliance/:recId', auth, adminOnly, (req, res) => {
  const db = readDB();
  db.compliance = db.compliance || {};
  db.compliance[req.params.id] = (db.compliance[req.params.id] || []).filter(r => r.id !== req.params.recId);
  writeDB(db);
  res.json({ ok: true });
});

// ── Import compliance from the GARP Excel template ──────────────────────────
router.post('/clients/:id/compliance/import', auth, adminOnly, (req, res) => {
  const XLSX = require('xlsx');
  const b64 = (req.body && req.body.fileBase64) || '';
  if(!b64) return res.status(400).json({ error: 'No file provided.' });
  let wb;
  try { wb = XLSX.read(Buffer.from(b64.split(',').pop(), 'base64'), { type:'buffer' }); }
  catch(e){ return res.status(400).json({ error: 'Could not read the Excel file.' }); }
  const db = readDB();
  const clientId = req.params.id;
  let imported = 0; const errors = [];

  // header→column index helper (handles the two-row grouped header on Monthly)
  function sheetRows(name){ const ws = wb.Sheets[name]; if(!ws) return null; return XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' }); }

  // ---- Compliance Monthly ----
  const mRows = sheetRows('Compliance Monthly');
  if(mRows){
    // group header is the row containing 'GSTR-1'; sub header is next row
    let gHdr=-1; for(let i=0;i<mRows.length;i++){ if(mRows[i].some(c=>String(c).trim()==='GSTR-1')){ gHdr=i; break; } }
    if(gHdr>=0){
      const groupRow=mRows[gHdr], subRow=mRows[gHdr+1]||[];
      // map each obligation group to its starting column and field offsets
      const GMAP=[['GSTR-1','gstr1'],['GSTR-3B','gstr3b'],['GST-TDS (GSTR-7)','gst_tds'],['ISD (GSTR-6)','isd'],['TDS Payment','tds_pay'],['PF','pf'],['ESI','esi']];
      // find FY / Month / GSTIN columns from subRow/groupRow
      const findCol=(rowA,rowB,name)=>{ for(let c=0;c<Math.max(rowA.length,rowB.length);c++){ if(String(rowA[c]).trim()===name||String(rowB[c]).trim()===name) return c; } return -1; };
      const fyC=findCol(groupRow,subRow,'Financial Year');
      const moC=findCol(groupRow,subRow,'Month');
      const gstinC=findCol(groupRow,subRow,'GSTIN');
      // for each group, locate its block start in groupRow, then fields by subRow labels within block
      const blocks=[];
      for(const [glabel,okey] of GMAP){
        let start=-1; for(let c=0;c<groupRow.length;c++){ if(String(groupRow[c]).trim()===glabel){ start=c; break; } }
        if(start<0) continue;
        // block runs until next non-empty group label
        let end=groupRow.length-1;
        for(let c=start+1;c<groupRow.length;c++){ if(String(groupRow[c]).trim()!==''){ end=c-1; break; } }
        const fieldCol=(lbl)=>{ for(let c=start;c<=end;c++){ if(String(subRow[c]).trim()===lbl) return c; } return -1; };
        blocks.push({ okey, cStatus:fieldCol('Status'), cDue:fieldCol('Due Date'), cFile:fieldCol('Filing Date'), cLF:fieldCol('Late Fee'),
          cAmt: (()=>{ // first amount-ish column that's not status/due/filing/latefee
            for(let c=start;c<=end;c++){ const l=String(subRow[c]).trim(); if(l && !['Status','Due Date','Filing Date','Late Fee','GST Input (ITC)'].includes(l)) return c; } return -1; })(),
          cAmt2: fieldCol('GST Input (ITC)') });
      }
      for(let i=gHdr+2;i<mRows.length;i++){
        const row=mRows[i]; if(!row||!row.length) continue;
        const fy=String(row[fyC]||'').trim(); const mo=String(row[moC]||'').trim();
        if(!fy||!mo) continue;
        const period=periodForMonth(fy,mo); if(!period) continue;
        const gstin=gstinC>=0?String(row[gstinC]||'').trim():'';
        for(const b of blocks){
          const status=b.cStatus>=0?normStatus(row[b.cStatus]):'';
          const amount=b.cAmt>=0?cellNum(row[b.cAmt]):undefined;
          const amount2=b.cAmt2>=0?cellNum(row[b.cAmt2]):undefined;
          const due=b.cDue>=0?cellDate(row[b.cDue]):'';
          const filed=b.cFile>=0?cellDate(row[b.cFile]):'';
          const lf=b.cLF>=0?cellNum(row[b.cLF]):undefined;
          // skip totally empty cells
          if(!status && amount===undefined && amount2===undefined && !filed && (lf===undefined||lf===0)) continue;
          const def=COMPLIANCE_DEFS.find(d=>d.key===b.okey)||{};
          const body={ fy, period, obligation:b.okey, gstin: def.gstinWise?gstin:'', status, dueDate:due, filedDate:filed };
          if(amount!==undefined) body.amount=amount;
          if(amount2!==undefined) body.amount2=amount2;
          if(lf!==undefined) body.lateFee=lf;
          const r=upsertCompliance(db, clientId, body); if(!r.error) imported++;
        }
      }
    }
  }

  // ---- Compliance Quarterly (TDS Return) ----
  const qRows = sheetRows('Compliance Quarterly');
  if(qRows){
    let h=-1; for(let i=0;i<qRows.length;i++){ if(qRows[i].some(c=>String(c).trim()==='Quarter')){ h=i; break; } }
    if(h>=0){ const H=qRows[h].map(x=>String(x).trim());
      const ci=n=>H.indexOf(n);
      for(let i=h+1;i<qRows.length;i++){ const row=qRows[i]; const fy=String(row[ci('Financial Year')]||'').trim(); const ql=String(row[ci('Quarter')]||'').trim();
        if(!fy||!ql) continue; const qm=ql.match(/Q([1-4])/); if(!qm) continue;
        const period=fyStartYear(fy)+'-Q'+qm[1];
        const status=normStatus(row[ci('Status')]); const filed=cellDate(row[ci('Filing Date')]); const due=cellDate(row[ci('Due Date')]); const lf=cellNum(row[ci('Late Fee')]);
        if(!status && !filed && (lf===undefined||lf===0)) continue;
        const r=upsertCompliance(db, clientId, { fy, period, obligation:'tds_ret', status, dueDate:due, filedDate:filed, lateFee:lf||0 }); if(!r.error) imported++;
      }
    }
  }

  // ---- Compliance Annual ----
  const aRows = sheetRows('Compliance Annual');
  if(aRows){
    let h=-1; for(let i=0;i<aRows.length;i++){ if(aRows[i].some(c=>String(c).trim()==='Obligation')){ h=i; break; } }
    if(h>=0){ const H=aRows[h].map(x=>String(x).trim()); const ci=n=>H.indexOf(n);
      const OB={ 'ITR':'itr','GSTR-9 / 9C':'gstr9','ROC (AOC-4 / MGT-7)':'roc' };
      for(let i=h+1;i<aRows.length;i++){ const row=aRows[i]; const fy=String(row[ci('Financial Year')]||'').trim(); const ob=String(row[ci('Obligation')]||'').trim();
        if(!fy||!ob||!OB[ob]) continue;
        const status=normStatus(row[ci('Status')]); const filed=cellDate(row[ci('Filing Date')]); const due=cellDate(row[ci('Due Date')]); const lf=cellNum(row[ci('Late Fee')]);
        const gstinCi=ci('GSTIN (if GST)'); const gstinV=gstinCi>=0?String(row[gstinCi]||'').trim():'';
        if(!status && !filed && (lf===undefined||lf===0)) continue;
        const def=COMPLIANCE_DEFS.find(d=>d.key===OB[ob])||{};
        const r=upsertCompliance(db, clientId, { fy, period:'FY', obligation:OB[ob], gstin:def.gstinWise?(gstinV==='-'?'':gstinV):'', status, dueDate:due, filedDate:filed, lateFee:lf||0 }); if(!r.error) imported++;
      }
    }
  }

  writeDB(db);
  res.json({ ok:true, imported, errors });
});

module.exports = router;
