const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bodyParser = require('body-parser');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const SCANS_FILE = path.join(__dirname, 'data', 'scans.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(path.join(__dirname,'data'))) fs.mkdirSync(path.join(__dirname,'data'));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const sampleData = [
  { id: "MH-LX7K2A-Q3F", farmerId: "F-001", farmerName: "Kwame Asante", orchardBlock: "Block A - North Ridge", variety: "Kent", fruitCount: 240, weight: 96, ripeness: "Ripe", defects: ["None"], gps: "6.6885° N, 1.6244° W", harvestDate: "2026-04-10", pickerId: "P-012", photoUrl: null, submittedAt: "2026-04-10T08:32:00Z" }
];

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }

const app = express();
app.use(bodyParser.json({limit: '10mb'}));
app.use(bodyParser.urlencoded({extended:true}));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname,'..','dist')));

const storage = multer.diskStorage({ destination: (req,file,cb)=>cb(null, UPLOAD_DIR), filename: (req,file,cb)=>cb(null, Date.now() + '-' + file.originalname) });
const upload = multer({ storage, limits: { fileSize: 6 * 1024 * 1024 } });

app.get('/api/records', (req,res)=>{
  const db = readJSON(DB_FILE, sampleData);
  res.json(db);
});

app.post('/api/records', (req,res)=>{
  const db = readJSON(DB_FILE, sampleData);
  const rec = req.body;
  db.unshift(rec);
  writeJSON(DB_FILE, db);
  res.json({ ok: true });
});

app.get('/api/scans', (req,res)=>{
  const scans = readJSON(SCANS_FILE, {});
  res.json(scans);
});
app.post('/api/scans', (req,res)=>{
  const scans = readJSON(SCANS_FILE, {});
  const { id, device } = req.body;
  if (!scans[id]) scans[id] = [];
  scans[id].push({ ts: new Date().toISOString(), device: device || 'unknown' });
  writeJSON(SCANS_FILE, scans);
  res.json({ ok: true });
});

app.post('/api/upload', upload.single('file'), (req,res)=>{
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

app.post('/api/import', upload.single('file'), (req,res)=>{
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const csv = fs.readFileSync(req.file.path,'utf8');
  const lines = csv.split('\n').map(l=>l.trim()).filter(Boolean);
  const rows = lines.slice(1).map(l=>{
    const cols = l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.replace(/^"|"$/g,''));
    return { id: cols[0], farmerName: cols[1], orchardBlock: cols[2], variety: cols[3], fruitCount: Number(cols[4]||0), weight: Number(cols[5]||0), ripeness: cols[6], defects: (cols[7]||'').split(';').filter(Boolean), gps: cols[8], harvestDate: cols[9], pickerId: cols[10], submittedAt: cols[11] };
  });
  writeJSON(DB_FILE, rows);
  res.json({ ok: true, imported: rows.length });
});

const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log(`Server running on http://localhost:${port}`));
