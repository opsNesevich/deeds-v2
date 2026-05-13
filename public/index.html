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
    console.error('EXTRACT ERROR:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
});

function runFiller(cmd, data, outExt, res, filenamePrefix) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), cmd + '-'));
  try {
    const outPath = path.join(tmpDir, 'output.' + outExt);
    console.log(`Running filler: ${cmd} -> ${outPath}`);
    const result = execFileSync('python3', [FILLER, cmd, JSON.stringify(data), TEMPLATES, outPath], {
      timeout: 30000,
      encoding: 'utf8'
    });
    console.log(`Filler output: ${result}`);

    if (!fs.existsSync(outPath)) {
      throw new Error(`Output file not created: ${outPath}`);
    }

    const buf = fs.readFileSync(outPath);
    const safe = (data.grantor || 'deed').replace(/[^A-Za-z0-9]/g, '_').substring(0, 20);
    const date = new Date().toISOString().split('T')[0];

    if (outExt === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}_${safe}_${date}.${outExt}"`);
    res.send(buf);
  } catch (err) {
    console.error(`FILLER ERROR (${cmd}):`, err.message);
    if (err.stderr) console.error('stderr:', err.stderr);
    res.status(500).json({ error: err.message + (err.stderr ? ' | ' + err.stderr : '') });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  }
}

app.post('/api/fill-affidavit', (req, res) => runFiller('affidavit', req.body, 'pdf', res, 'Affidavit'));
app.post('/api/fill-residency', (req, res) => runFiller('residency', req.body, 'pdf', res, 'Sellers_Residency'));
app.post('/api/fill-deed',      (req, res) => runFiller('deed',      req.body, 'docx', res, 'Deed'));

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
    console.error('CLAUDE ERROR:', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Deed Processor running on port ${PORT}`));
