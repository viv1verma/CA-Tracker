// ═══════════════════════════════════════════════════════════════════════════
// GST REGISTRATION CERTIFICATE (FORM GST REG-06) READER
// ---------------------------------------------------------------------------
// Reads a client's GST certificate and returns the fields needed to create them,
// so a new client is three clicks instead of six fields typed from a PDF.
//
// THE RULE THIS MODULE FOLLOWS: extract, never assume. Every field comes back
// with the confidence it deserves, and the caller SHOWS the user what was read
// before anything is written. A mis-read GSTIN creates a client with the wrong
// tax number, which is worse than typing it by hand — so nothing here writes to
// the database, it only proposes.
//
// PAN is DERIVED, not searched for: characters 3-12 of the GSTIN are the PAN by
// construction. Deriving it is exact where a regex hunt across the page could
// pick up an unrelated PAN (the signatory's, for instance).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// 2 state digits, PAN (5 letters, 4 digits, 1 letter), entity code, Z, checksum
const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b/;

const STATE_CODES = {
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand',
  '06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim',
  '12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya',
  '18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra','29':'Karnataka',
  '30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman and Nicobar Islands',
  '36':'Telangana','37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory'
};

// "Constitution of Business" on the certificate -> the app's Entity Type list.
// Ordered longest-first so "Public Limited Company" cannot match "Limited".
const CONSTITUTION = [
  [/limited\s+liability\s+partnership|\bLLP\b/i,        'LLP'],
  [/one\s+person\s+company|\bOPC\b/i,                   'OPC'],
  [/public\s+(?:limited|sector)\s+company/i,            'Public Company'],
  [/private\s+limited\s+company/i,                      'Pvt Ltd'],
  [/hindu\s+undivided\s+family|\bHUF\b/i,               'HUF'],
  [/proprietorship|proprietary/i,                       'Individual'],
  [/partnership/i,                                      'Partnership'],
  [/trust|society|club|association\s+of\s+persons|\bAOP\b/i, 'Trust'],
  [/government\s+department|local\s+authority|statutory\s+body/i, 'Other'],
  [/\bindividual\b/i,                                   'Individual']
];

// Pull the value that follows a label. Certificates are rendered as PDFs whose
// text layer puts the value on the same line OR the next one, so both are tried.
function valueAfter(text, labels, opts) {
  const o = opts || {};
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
  // Longest label first: "Trade Name, if any" must be tried before "Trade Name",
  // or the shorter one matches and returns ", if any" as the value.
  const ordered = labels.slice().sort((a, b) => b.length - a.length);
  for (const label of ordered) {
    // Certificates number their fields ("1. Legal Name", "4. Address of ..."),
    // so allow an optional leading number before the label.
    const re = new RegExp('^\\s*(?:\\d{1,2}[.)]\\s*)?' + label + '\\s*[:\\-]?\\s*(.*)$', 'i');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      let v = (m[1] || '').trim();
      // A leftover like ", if any" or "of Business" means the label itself was
      // split, not that we found a value. Clear it FIRST so the next-line path
      // below still runs — checking it afterwards skipped that path entirely.
      if (/^[,\-:\s]*$/.test(v) || /^(?:,?\s*if any|of business|of the business)$/i.test(v)) v = '';
      // Value on the following line(s)
      if (!v || v.length < (o.min || 2)) {
        const collected = [];
        for (let j = i + 1; j < Math.min(i + (o.lines || 1) + 1, lines.length); j++) {
          const nxt = lines[j];
          if (!nxt) continue;
          // Stop at the next field. Numbered labels look like "5. Date of Liability".
          if (/^\s*\d{1,2}[.)]\s+[A-Z]/.test(nxt)) break;
          // Only a line ENDING in a colon is a label. The previous test treated
          // any Title/UPPER case line as one, which meant a company name
          // ("AMAN INDUSTRIES PRIVATE LIMITED") was mistaken for the next field
          // and every name came back empty.
          if (/:\s*$/.test(nxt) && !o.allowLabelish) break;
          collected.push(nxt);
          if (!o.lines) break;
        }
        v = collected.join(', ').trim();
      }
      v = v.replace(/\s*\|\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
      // A leftover like ", if any" or "of Business" means we matched part of the
      // label, not a value. Reject it and let the next-line path run instead.
      if (/^[,\-:\s]*$/.test(v) || /^(?:,?\s*if any|of business|of the business)$/i.test(v)) v = '';
      if (v && v.length >= (o.min || 2)) return v;
    }
  }
  return '';
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\b(Pvt|Ltd|Llp|Huf|Opc|Gst|Pan)\b/gi, x => x.toUpperCase());
}

// ── the extractor ───────────────────────────────────────────────────────────
function parseGstCertificate(rawText) {
  const text = String(rawText || '');
  const flat = text.replace(/\s+/g, ' ');
  const out = { ok: false, fields: {}, confidence: {}, warnings: [] };

  // 1. GSTIN \u2014 the anchor for everything else.
  const g = flat.match(GSTIN_RE);
  if (!g) {
    out.warnings.push('No GSTIN found. This may not be a GST registration certificate, or the PDF is a scan with no text layer.');
    return out;
  }
  const gstin = g[1];
  out.fields.gstin = gstin;
  out.confidence.gstin = 'high';

  // 2. PAN is characters 3-12 of the GSTIN, by construction. Deriving beats
  //    searching: a regex hunt could pick up the signatory's PAN instead.
  out.fields.pan = gstin.slice(2, 12);
  out.confidence.pan = 'high';

  // 3. State from the leading code \u2014 useful for the address line.
  const st = STATE_CODES[gstin.slice(0, 2)];
  if (st) { out.fields.state = st; out.confidence.state = 'high'; }

  // 4. Names. Legal Name is the registered entity; Trade Name is what they
  //    trade as. Prefer Legal Name \u2014 it is what appears on filings.
  const legal = valueAfter(text, ['Legal Name of Business', 'Legal Name', 'Name of Business']);
  const trade = valueAfter(text, ['Trade Name,? if any', 'Trade Name']);
  if (legal) { out.fields.legalName = legal; out.confidence.legalName = 'high'; }
  if (trade && trade.toLowerCase() !== 'na' && trade !== '-') {
    out.fields.tradeName = trade; out.confidence.tradeName = 'high';
  }
  out.fields.clientName = legal || trade || '';
  if (!out.fields.clientName) out.warnings.push('Could not read the legal or trade name \u2014 type it in.');

  // 5. Constitution -> Entity Type
  const con = valueAfter(text, ['Constitution of Business', 'Constitution']);
  if (con) {
    out.fields.constitution = con;
    for (const [re, mapped] of CONSTITUTION) {
      if (re.test(con)) { out.fields.entityType = mapped; out.confidence.entityType = 'high'; break; }
    }
    if (!out.fields.entityType) {
      out.fields.entityType = 'Other';
      out.confidence.entityType = 'low';
      out.warnings.push('Constitution read as "' + con + '" \u2014 mapped to Other; check the Entity Type.');
    }
  }

  // 6. Address. Certificates print this across several lines, so take a few.
  const addr = valueAfter(text,
    ['Address of Principal Place of Business', 'Principal Place of Business', 'Address'],
    { lines: 4, min: 8 });
  if (addr) {
    out.fields.address = addr.replace(/\s*,\s*,\s*/g, ', ').replace(/,\s*$/, '');
    out.confidence.address = 'medium';
  } else {
    out.warnings.push('Address not found \u2014 add it manually.');
  }

  // 7. Registration date, for the record.
  const dt = valueAfter(text, ['Date of Liability', 'Date of Validity', 'Period of Validity']);
  const dm = String(dt || flat).match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (dm) { out.fields.registrationDate = dm[3] + '-' + dm[2] + '-' + dm[1]; out.confidence.registrationDate = 'medium'; }

  out.ok = true;
  return out;
}

module.exports = { parseGstCertificate, GSTIN_RE, STATE_CODES, CONSTITUTION };
