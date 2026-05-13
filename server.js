const express = require('express');
const path = require('path');
const multer = require('multer');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const TEMPLATES = path.join(__dirname, 'templates');
const FILLER = path.join(__dirname, 'fill_pdfs.py');

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

// Fill Affidavit PDF template
app.post('/api/fill-affidavit', async (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aff-'));
  try {
    const outPath = path.join(tmpDir, 'affidavit.pdf');
    execFileSync('python3', [FILLER, 'affidavit', JSON.stringify(req.body), TEMPLATES, outPath], { timeout: 30000 });
    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/pdf');
    const safe = (req.body.grantor || 'deed').replace(/[^A-Za-z0-9]/g, '_').substring(0, 20);
    res.setHeader('Content-Disposition', `attachment; filename="Affidavit_${safe}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
});

// Fill Seller's Residency PDF template
app.post('/api/fill-residency', async (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'res-'));
  try {
    const outPath = path.join(tmpDir, 'residency.pdf');
    execFileSync('python3', [FILLER, 'residency', JSON.stringify(req.body), TEMPLATES, outPath], { timeout: 30000 });
    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/pdf');
    const safe = (req.body.grantor || 'deed').replace(/[^A-Za-z0-9]/g, '_').substring(0, 20);
    res.setHeader('Content-Disposition', `attachment; filename="Sellers_Residency_${safe}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
});

// Fill Deed DOCX template
app.post('/api/fill-deed', async (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deed-'));
  try {
    const outPath = path.join(tmpDir, 'deed.docx');
    execFileSync('python3', [FILLER, 'deed', JSON.stringify(req.body), TEMPLATES, outPath], { timeout: 30000 });
    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const safe = (req.body.grantor || 'deed').replace(/[^A-Za-z0-9]/g, '_').substring(0, 20);
    res.setHeader('Content-Disposition', `attachment; filename="Deed_${safe}.docx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
});

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
