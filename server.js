const express = require('express');
const path = require('path');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/generate-docx', async (req, res) => {
  try {
    const d = req.body;
    const t = (text, opts = {}) => new TextRun({ text: text || '', font: 'Times New Roman', size: 24, ...opts });
    const tb = (text) => new TextRun({ text: text || '', font: 'Times New Roman', size: 24, bold: true });
    const p = (children, paraOpts = {}) => new Paragraph({
      children: Array.isArray(children) ? children : [t(children)],
      spacing: { after: 120 },
      ...paraOpts
    });
    const blank = () => new Paragraph({ children: [t('')], spacing: { after: 120 } });

    const granteeClause = d.newGrantee
      ? d.newGrantee + (d.trustDate ? ', a Trust, dated ' + d.trustDate : '') + (d.trustee ? ', ' + d.trustee + ', Trustee' : '')
      : d.grantor;

    const being = (d.priorGrantees && d.priorBook)
      ? `BEING the same premises conveyed to ${d.priorGrantees}, by Deed dated ${d.priorDeedDate} and recorded on ${d.priorRecordedDate} in the ${d.priorCounty || 'Burlington'} County Clerk/Register's Office, in Deed Book ${d.priorBook}, Page ${d.priorPage}.`
      : '';

    const sigDate = d.signingDate || '_______________';
    const county = (d.county || 'Burlington').toUpperCase();

    const children = [
      d.preparedBy ? p(`Prepared by: ${d.preparedBy}`) : blank(),
      d.returnTo ? p(`Return to: ${d.returnTo}`) : blank(),
      blank(),
      new Paragraph({ children: [tb('DEED')], alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
      p(`This Deed is made on ${sigDate},`),
      blank(),
      p([tb('BETWEEN '), t(d.grantor + ',')]),
      blank(),
      p(`whose address is ${d.grantorAddr} referred to as Grantor,`),
      blank(),
      p([tb('AND '), t(granteeClause + ',')]),
      blank(),
      p(`whose address is ${d.granteeAddr || d.grantorAddr} referred to as Grantee.`),
      blank(),
      p('The words "Grantor" and "Grantee" shall mean all Grantors and all Grantees listed above.'),
      blank(),
      p([tb('Transfer of Ownership. '), t(`The Grantor grants and conveys (transfer of ownership) all the Grantor's ownership in the property described below to the Grantee. This transfer is made for the sum of One and No/100 ($1.00) Dollar. The Grantor acknowledges receipt of this money.`)]),
      blank(),
      p([tb('Tax Map Reference. '), t(`(N.J.S.A. 46:26A-1) Municipality of ${d.municipality}, County of ${d.county || 'Burlington'}, State of New Jersey, Block No. ${d.block}, Lot No. ${d.lot}.`)]),
      blank(),
      p([tb('Property. '), t(`The property consists of the land and all the buildings and structures on the land in the Municipality of ${d.municipality}, County of ${d.county || 'Burlington'}, and State of New Jersey. The legal description is: ___ X ___ please see attached Legal Description annexed hereto and made part hereof. (check if applicable).`)]),
      blank(),
      p(`The street address of the property is: ${d.propAddr}`),
      blank(),
      p([tb('Promises by the Grantor. '), t(`The grantor promises that the Grantor has done no act to encumber the Property. This promise is called a "covenant as to grantor's acts" (N.J.S.A. 46:4-6). This promise means that the Grantor has not allowed anyone else to obtain any legal rights which affect the Property (such as by making a mortgage or allowing a judgement to be entered against the Grantor).`)]),
      blank(),
      p(`NOTE FOR INFORMATION PURPOSES ONLY: Being Lot: ${d.lot} Block: ${d.block}; Tax Map of the Municipality of ${d.municipality}, County of ${d.county || 'Burlington'}, State of New Jersey.`),
      blank(),
      p(being),
      blank(),
      p([tb('Signatures. '), t('The Grantors sign this Deed as of the date at the top of the first page.')]),
      blank(),
      blank(),
      p(`_______________________________          ${d.grantor}`),
      ...(d.grantor2 ? [blank(), p(`_______________________________          ${d.grantor2}`)] : []),
      blank(),
      blank(),
      p('STATE OF NEW JERSEY'),
      p('SS.:'),
      p(`COUNTY OF ${county}`),
      blank(),
      p(`I CERTIFY that on ${sigDate}, ${d.grantor}${d.grantor2 ? ' and ' + d.grantor2 : ''}, personally came before me and acknowledged under oath, to my satisfaction, that this person:`),
      p('(a) were the makers of this Deed;'),
      p('(b) executed this Deed as their own act;'),
      p('(c) made this Deed for $1.00 as full and actual consideration paid or to be paid for the transfer of title. (Such consideration is defined in N.J.S.A. 46:15-5.)'),
      blank(),
      p('_________________'),
      p('Notary Public, State of New Jersey'),
      blank(),
      blank(),
      new Paragraph({ children: [tb('Legal Description')], spacing: { after: 160 } }),
      p(d.legalDesc || ''),
    ];

    const doc = new Document({
      sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safe = (d.grantor || 'deed').replace(/[^A-Za-z0-9]/g, '_').substring(0, 20);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Deed_${safe}.docx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
