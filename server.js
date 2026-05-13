const express = require('express');
const path = require('path');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Convert PDF to base64 images for Claude Vision
app.post('/api/extract', upload.single('pdf'), async (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deed-'));
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const pdfPath = path.join(tmpDir, 'deed.pdf');
    fs.writeFileSync(pdfPath, req.file.buffer);
    execSync(`pdftoppm -r 200 -jpeg "${pdfPath}" "${path.join(tmpDir, 'page')}"`, { timeout: 30000 });
    const images = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('page') && f.endsWith('.jpg'))
      .sort()
      .slice(0, 4)
      .map(f => fs.readFileSync(path.join(tmpDir, f)).toString('base64'));
    if (images.length === 0) return res.status(400).json({ error: 'Could not convert PDF' });
    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
});

// Generate DOCX deed on server using docx-js
app.post('/api/generate-docx', async (req, res) => {
  try {
    const d = req.body;
    // Write a temp JS file and execute it
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
    const scriptPath = path.join(tmpDir, 'gen.js');
    const outPath = path.join(tmpDir, 'deed.docx');

    const script = generateDeedScript(d, outPath);
    fs.writeFileSync(scriptPath, script);

    execSync(`node "${scriptPath}"`, { timeout: 30000 });

    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Deed_${(d.grantor||'deed').replace(/[^A-Za-z0-9]/g,'_').substring(0,20)}.docx"`);
    res.send(buf);

    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateDeedScript(d, outPath) {
  const esc = s => (s||'').replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$');
  return `
const { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType } = require('docx');
const fs = require('fs');

function p(text, opts={}) {
  const runs = typeof text === 'string'
    ? [new TextRun({ text, font: 'Times New Roman', size: 24, ...opts.run })]
    : text;
  return new Paragraph({ children: runs, spacing: { after: 120 }, ...opts.para });
}

function bold(text) { return new TextRun({ text, font: 'Times New Roman', size: 24, bold: true }); }
function normal(text) { return new TextRun({ text, font: 'Times New Roman', size: 24 }); }
function line() { return p(''); }

const d = ${JSON.stringify(d)};

const granteeClause = d.newGrantee
  ? d.newGrantee + (d.trustDate ? ', a Trust, dated ' + d.trustDate : '') + (d.trustee ? ', ' + d.trustee + ', Trustee' : '')
  : d.grantor;

const being = (d.priorGrantees && d.priorBook)
  ? 'BEING the same premises conveyed to ' + d.priorGrantees + ', by Deed dated ' + d.priorDeedDate + ' and recorded on ' + d.priorRecordedDate + ' in the ' + (d.priorCounty||'Burlington') + ' County Clerk/Register\\'s Office, in Deed Book ' + d.priorBook + ', Page ' + d.priorPage + '.'
  : '';

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      ${d.preparedBy ? `p('Prepared by: ' + d.preparedBy),` : 'p(\' \'),'}
      ${d.returnTo ? `p('Return to: ' + d.returnTo),` : 'p(\' \'),'}
      line(),
      new Paragraph({ children: [bold('DEED')], alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
      p('This Deed is made on ' + (d.signingDate||'_______________') + ','),
      line(),
      new Paragraph({ children: [bold('BETWEEN '), normal(d.grantor + ',')], spacing: { after: 120 } }),
      line(),
      p('whose address is ' + d.grantorAddr + ' referred to as Grantor,'),
      line(),
      new Paragraph({ children: [bold('AND '), normal(granteeClause + ',')], spacing: { after: 120 } }),
      line(),
      p('whose address is ' + (d.granteeAddr || d.grantorAddr) + ' referred to as Grantee.'),
      line(),
      p('The words "Grantor" and "Grantee" shall mean all Grantors and all Grantees listed above.'),
      line(),
      new Paragraph({ children: [new TextRun({ text: 'Transfer of Ownership.', bold: true, font: 'Times New Roman', size: 24 }), normal(' The Grantor grants and conveys (transfer of ownership) all the Grantor\\'s ownership in the property described below to the Grantee. This transfer is made for the sum of One and No/100 ($1.00) Dollar. The Grantor acknowledges receipt of this money.')], spacing: { after: 120 } }),
      line(),
      new Paragraph({ children: [new TextRun({ text: 'Tax Map Reference.', bold: true, font: 'Times New Roman', size: 24 }), normal(' (N.J.S.A. 46:26A-1) Municipality of ' + d.municipality + ', County of ' + (d.county||'Burlington') + ', State of New Jersey, Block No. ' + d.block + ', Lot No. ' + d.lot + '.')], spacing: { after: 120 } }),
      line(),
      new Paragraph({ children: [new TextRun({ text: 'Property.', bold: true, font: 'Times New Roman', size: 24 }), normal(' The property consists of the land and all the buildings and structures on the land in the Municipality of ' + d.municipality + ', County of ' + (d.county||'Burlington') + ', and State of New Jersey. The legal description is: ___ X ___ please see attached Legal Description annexed hereto and made part hereof. (check if applicable).')], spacing: { after: 120 } }),
      line(),
      p('The street address of the property is: ' + d.propAddr),
      line(),
      new Paragraph({ children: [new TextRun({ text: 'Promises by the Grantor.', bold: true, font: 'Times New Roman', size: 24 }), normal(' The grantor promises that the Grantor has done no act to encumber the Property. This promise is called a "covenant as to grantor\\'s acts" (N.J.S.A. 46:4-6). This promise means that the Grantor has not allowed anyone else to obtain any legal rights which affect the Property (such as by making a mortgage or allowing a judgement to be entered against the Grantor).')], spacing: { after: 120 } }),
      line(),
      p('NOTE FOR INFORMATION PURPOSES ONLY: Being Lot: ' + d.lot + ' Block: ' + d.block + '; Tax Map of the Municipality of ' + d.municipality + ', County of ' + (d.county||'Burlington') + ', State of New Jersey.'),
      line(),
      p(being),
      line(),
      new Paragraph({ children: [new TextRun({ text: 'Signatures.', bold: true, font: 'Times New Roman', size: 24 }), normal(' The Grantors sign this Deed as of the date at the top of the first page.')], spacing: { after: 240 } }),
      p('_______________________________          ' + d.grantor),
      ...(d.grantor2 ? [p('_______________________________          ' + d.grantor2)] : []),
      line(),
      p('STATE OF NEW JERSEY'),
      p('SS.:'),
      p('COUNTY OF ' + (d.county||'BURLINGTON').toUpperCase()),
      line(),
      p('I CERTIFY that on ' + (d.signingDate||'_______________') + ', ' + d.grantor + (d.grantor2 ? ' and ' + d.grantor2 : '') + ', personally came before me and acknowledged under oath, to my satisfaction, that this person:'),
      p('(a) were the makers of this Deed;'),
      p('(b) executed this Deed as their own act;'),
      p('(c) made this Deed for $1.00 as full and actual consideration paid or to be paid for the transfer of title. (Such consideration is defined in N.J.S.A. 46:15-5.)'),
      line(),
      p('_________________'),
      p('Notary Public, State of New Jersey'),
      line(),
      new Paragraph({ children: [bold('Legal Description')], spacing: { after: 120 } }),
      p(d.legalDesc || ''),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('${esc(outPath)}', buf);
  console.log('done');
});
`;
}

// Proxy Claude API
app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Deed Processor running on port ${PORT}`));
