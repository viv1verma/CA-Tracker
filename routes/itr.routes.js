// ═══════════════════════════════════════════════════════════
// routes/itr.routes.js — ITR Filing Tracker endpoints
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB } = require('../db');
const { newId, todayStr } = require('../utils/helpers');
const { auth, itrAdmin, isItrAdminUser } = require('../middleware/auth');
const { notifyItrStage, notifConfigStatus } = require('../services/notification.service');

// ── Constants ────────────────────────────────────────────────────────────────
const ITR_STAGES = ['Not Started', 'Docs Received', 'In Preparation', 'Filed', 'Verified'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function itrName(db, id) {
  const u = (db.users || []).find(x => x.id === id);
  return u ? u.name : null;
}

/** Rows visible to the requesting user (mirrors the GET /api/itr/parties filter) */
function itrVisibleParties(db, req) {
  const all = db.itrParties || [];
  if (isItrAdminUser(db, req.user.id, req.user.role)) return all;
  if (req.user.role === 'admin' || req.user.role === 'member')
    return all.filter(p => p.assignedTo === req.user.id || p.reportingTo === req.user.id);
  return [];
}

/** Latest team (non-itrclient) comment formatted for export */
function itrLatestTeamCommentText(p) {
  const cs = (p.comments || []).filter(c => c.role !== 'itrclient');
  if (!cs.length) return '';
  const c = cs[cs.length - 1];
  return `${c.text}  — ${c.authorName || 'Team'}${new Date(c.date).toString() !== 'Invalid Date' ? ' (' + new Date(c.date).toLocaleDateString('en-IN') + ')' : ''}`;
}

// ── GET /api/itr/parties — List ITR parties (role-filtered) ─────────────────
router.get('/parties', auth, (req, res) => {
  const db = readDB();
  const all = db.itrParties || [];
  if (isItrAdminUser(db, req.user.id, req.user.role)) return res.json(all);
  if (req.user.role === 'admin' || req.user.role === 'member') {
    return res.json(all.filter(p => p.assignedTo === req.user.id || p.reportingTo === req.user.id));
  }
  return res.status(403).json({ error: 'Forbidden.' });
});

// ── GET /api/itr/export.xlsx — ITR Excel export ─────────────────────────────
router.get('/export.xlsx', auth, (req, res) => {
  const db = readDB();
  const rows = itrVisibleParties(db, req);
  const XLSX = require('xlsx');
  const header = ['Name','PAN','AY','Type','Assigned To','Reporting To','Stage','Filing Decision','Team Comment','Latest Comment Date','All Comments'];
  const aoa = [header];
  rows.forEach(p => {
    const teamComments = (p.comments || []).filter(c => c.role !== 'itrclient');
    const latest = teamComments[teamComments.length - 1];
    const allC = (p.comments || []).map(c => `[${c.authorName || '?'}${c.role==='itrclient'?' (client)':''}] ${c.text}`).join(' | ');
    aoa.push([
      p.name || '', p.pan || '', p.ay || '', p.type || '',
      p.assignedName || 'Unassigned', p.reportingName || '',
      p.stage || '', p.filingDecision || 'undecided',
      latest ? latest.text : '',
      latest ? new Date(latest.date).toLocaleDateString('en-IN') : '',
      allC
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:24},{wch:12},{wch:9},{wch:12},{wch:16},{wch:16},{wch:16},{wch:14},{wch:40},{wch:14},{wch:60}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ITR Filing');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="ITR_Filing_Report_${todayStr()}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── GET /api/itr/export.pdf — ITR PDF export (print-ready HTML) ─────────────
router.get('/export.pdf', auth, (req, res) => {
  const db = readDB();
  const rows = itrVisibleParties(db, req);
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const trs = rows.map((p, i) => {
    const teamComments = (p.comments || []).filter(c => c.role !== 'itrclient');
    const latest = teamComments[teamComments.length - 1];
    return `<tr style="background:${i%2?'#f8fafc':'#fff'}">
      <td>${esc(p.name||'\u2014')}</td><td style="font-family:monospace">${esc(p.pan||'')}</td>
      <td>${esc(p.ay||'\u2014')}</td><td>${esc(p.type||'\u2014')}</td>
      <td>${esc(p.assignedName||'Unassigned')}</td><td>${esc(p.stage||'\u2014')}</td>
      <td>${esc(p.filingDecision||'undecided')}</td>
      <td style="max-width:260px">${latest?esc(latest.text)+' <span style="color:#94a3b8">\u2014 '+esc(latest.authorName||'Team')+'</span>':'\u2014'}</td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf8"><title>ITR Filing Report</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;color:#1e293b}
    h1{font-size:18px;color:#1e3a8a;margin:0 0 2px}.sub{font-size:11px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#1e3a8a;color:#fff;padding:7px 8px;text-align:left;font-size:9px}
    td{padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    @media print{.noprint{display:none}}
    .btn{background:#1e3a8a;color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer}
  </style></head><body>
  <div class="noprint" style="margin-bottom:14px"><button class="btn" onclick="window.print()">\uD83D\uDDA8 Print / Save as PDF</button></div>
  <h1>GARP &amp; Associates \u2014 ITR Filing Report</h1>
  <div class="sub">Generated ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} \u00B7 ${rows.length} record(s)</div>
  <table><thead><tr>
    <th>Name</th><th>PAN</th><th>AY</th><th>Type</th><th>Assigned To</th><th>Stage</th><th>Decision</th><th>Team Comment</th>
  </tr></thead><tbody>${trs || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No records</td></tr>'}</tbody></table>
  <script>setTimeout(function(){window.print&&window.print();},400);</script>
  </body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ── GET /api/itr/me — ITR client sees own record ────────────────────────────
router.get('/me', auth, (req, res) => {
  if (req.user.role !== 'itrclient') return res.status(403).json({ error: 'Forbidden.' });
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  res.json(p);
});

// ── POST /api/itr/parties/bulk — Bulk upload parties (admin/Annpurna) ───────
router.post('/parties/bulk', auth, itrAdmin, (req, res) => {
  const db = readDB();
  if (!db.itrParties) db.itrParties = [];
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let added = 0, updated = 0;
  rows.forEach(r => {
    const pan = (r.pan || '').trim().toUpperCase();
    if (!pan) return;
    const ay = (r.ay || '').toString().trim();
    const ex = db.itrParties.find(p => (p.pan || '').toUpperCase() === pan && (p.ay || '') === ay);
    if (ex) {
      ex.name = r.name || ex.name; ex.type = r.type || ex.type;
      ex.email = r.email || ex.email; ex.mobile = r.mobile || ex.mobile;
      updated++;
    } else {
      db.itrParties.push({
        id: newId(), pan, name: r.name || '', ay, type: r.type || '',
        email: r.email || '', mobile: r.mobile || '',
        stage: 'Not Started', assignedTo: null, assignedName: null,
        reportingTo: null, reportingName: null, comments: [], createdAt: new Date().toISOString()
      });
      added++;
    }
  });
  writeDB(db);
  res.json({ ok: true, added, updated, total: db.itrParties.length });
});

// ── POST /api/itr/parties — Add single party (admin/Annpurna) ───────────────
router.post('/parties', auth, itrAdmin, (req, res) => {
  const db = readDB();
  if (!db.itrParties) db.itrParties = [];
  const pan = (req.body.pan || '').trim().toUpperCase();
  if (!pan) return res.status(400).json({ error: 'PAN required.' });
  const party = {
    id: newId(), pan, name: req.body.name || '', ay: (req.body.ay || '').toString().trim(),
    type: req.body.type || '', email: req.body.email || '', mobile: req.body.mobile || '',
    stage: 'Not Started', assignedTo: null, assignedName: null,
    reportingTo: null, reportingName: null, comments: [], createdAt: new Date().toISOString()
  };
  db.itrParties.push(party);
  writeDB(db);
  res.json(party);
});

// ── PUT /api/itr/parties/:id/assign — Assign team member + reporting person ─
router.put('/parties/:id/assign', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  if ('assignedTo' in req.body) { p.assignedTo = req.body.assignedTo || null; p.assignedName = req.body.assignedTo ? itrName(db, req.body.assignedTo) : null; }
  if ('reportingTo' in req.body) { p.reportingTo = req.body.reportingTo || null; p.reportingName = req.body.reportingTo ? itrName(db, req.body.reportingTo) : null; }
  writeDB(db);
  res.json(p);
});

// ── PUT /api/itr/parties/:id/stage — Update stage ───────────────────────────
router.put('/parties/:id/stage', auth, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const allowed = isItrAdminUser(db, req.user.id, req.user.role) || p.assignedTo === req.user.id || p.reportingTo === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });
  const stage = req.body.stage;
  if (!ITR_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage.' });
  const changed = p.stage !== stage;
  p.stage = stage;
  if (stage === 'Filed' && !p.filedAt) p.filedAt = new Date().toISOString();
  writeDB(db);
  // Notify the client by email + WhatsApp (unless muted for this party)
  if (changed && p.notify !== false) { try { notifyItrStage(p, db); } catch (e) {} }
  res.json(p);
});

// ── POST /api/itr/parties/:id/comments — Add comment ────────────────────────
router.post('/parties/:id/comments', auth, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment required.' });
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const isOwner = req.user.role === 'itrclient' && req.user.id === p.id;
  const allowed = isItrAdminUser(db, req.user.id, req.user.role) || p.assignedTo === req.user.id || p.reportingTo === req.user.id || isOwner;
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });
  if (!p.comments) p.comments = [];
  const c = { id: newId(), authorId: req.user.id, authorName: req.user.name, role: req.user.role, text, date: new Date().toISOString() };
  p.comments.push(c);
  writeDB(db);
  res.json(c);
});

// ── DELETE /api/itr/parties/:id — Delete party (admin/Annpurna) ─────────────
router.delete('/parties/:id', auth, itrAdmin, (req, res) => {
  const db = readDB();
  db.itrParties = (db.itrParties || []).filter(x => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── PUT /api/itr/parties/:id/decision — Set filing decision ─────────────────
router.put('/parties/:id/decision', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const d = req.body.decision;
  if (![null, 'confirmed', 'parked'].includes(d)) return res.status(400).json({ error: 'Invalid decision.' });
  p.filingDecision = d;
  p.decisionNote = (req.body.note || '').toString().trim();
  p.decisionAt = new Date().toISOString();
  writeDB(db);
  res.json(p);
});

// ── GET /api/itr/notify-status — Notification channel status ────────────────
router.get('/notify-status', auth, itrAdmin, (req, res) => {
  res.json(notifConfigStatus());
});

// ── POST /api/itr/parties/:id/notify-test — Send test notification ──────────
router.post('/parties/:id/notify-test', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  try { notifyItrStage(p, db); } catch (e) {}
  res.json({ ok: true, sentTo: { email: !!p.email, whatsapp: !!p.mobile }, channels: notifConfigStatus() });
});

// ── PUT /api/itr/parties/:id/notify — Toggle notifications for a party ──────
router.put('/parties/:id/notify', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  p.notify = req.body.notify !== false;
  if ('email' in req.body) p.email = String(req.body.email || '').trim();
  if ('mobile' in req.body) p.mobile = String(req.body.mobile || '').trim();
  writeDB(db);
  res.json(p);
});

module.exports = router;
