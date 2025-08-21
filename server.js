const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serwowanie statycznych plików (frontend)
app.use(express.static(path.join(__dirname)));

// Pliki danych
const DATA_DIR = path.join(__dirname, 'data');
const OFFICERS_FILE = path.join(DATA_DIR, 'officers.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const UNITS_FILE = path.join(DATA_DIR, 'units.json');

// Funkcje do pracy z plikami JSON
async function ensureDataDir() {
  try { await fs.access(DATA_DIR); } 
  catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function loadData(file, defaultData) {
  try {
    await ensureDataDir();
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch {
    await saveData(file, defaultData);
    return defaultData;
  }
}

async function saveData(file, data) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// Dane w pamięci
let officers = {};
let reports = [];
let units = {};

async function initData() {
  officers = await loadData(OFFICERS_FILE, {});
  reports = await loadData(REPORTS_FILE, []);
  units = await loadData(UNITS_FILE, {});
}

initData();

// --- Endpointy ---

// GET homepage
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// GET /positions
app.get('/positions', (req, res) => res.json(officers));

// POST /update
app.post('/update', async (req, res) => {
  const { location, device_id } = req.body;
  if (!location || !location.coords || !device_id)
    return res.status(400).json({ error: 'Brak danych' });

  officers[device_id] = {
    name: officers[device_id]?.name || device_id,
    lat: parseFloat(location.coords.latitude),
    lng: parseFloat(location.coords.longitude),
    timestamp: location.timestamp || Date.now()
  };

  await saveData(OFFICERS_FILE, officers);
  res.json({ status: 'ok', officer: officers[device_id] });
});

// GET /reports
app.get('/reports', (req, res) => res.json(reports));

// POST /reports
app.post('/reports', async (req, res) => {
  const report = req.body;
  reports.push(report);
  await saveData(REPORTS_FILE, reports);
  res.json({ status: 'ok', report });
});

// PUT /reports/:id
app.put('/reports/:id', async (req, res) => {
  const idx = reports.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nie znaleziono' });

  reports[idx] = req.body;
  await saveData(REPORTS_FILE, reports);
  res.json({ status: 'ok', report: reports[idx] });
});

// DELETE /reports/:id
app.delete('/reports/:id', async (req, res) => {
  reports = reports.filter(r => r.id !== req.params.id);
  await saveData(REPORTS_FILE, reports);
  res.json({ status: 'ok' });
});

// GET /units
app.get('/units', (req, res) => res.json(units));

// PUT /units/:id
app.put('/units/:id', async (req, res) => {
  const id = req.params.id;
  units[id] = req.body;
  await saveData(UNITS_FILE, units);
  res.json({ status: 'ok', unit: units[id] });
});

// Start serwera
app.listen(PORT, () => console.log(`API działa na porcie ${PORT}`));
