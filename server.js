const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguracja CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serwowanie plików statycznych
app.use(express.static(path.join(__dirname)));

// Ścieżki do plików danych
const DATA_DIR = path.join(__dirname, 'data');
const OFFICERS_FILE = path.join(DATA_DIR, 'officers.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const UNITS_FILE = path.join(DATA_DIR, 'units.json');

// Funkcje do zarządzania danymi
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch (error) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadData(filename, defaultData = {}) {
  try {
    await ensureDataDir();
    const data = await fs.readFile(filename, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(`Tworzenie nowego pliku ${filename} z domyślnymi danymi`);
    await saveData(filename, defaultData);
    return defaultData;
  }
}

async function saveData(filename, data) {
  try {
    await ensureDataDir();
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Błąd zapisu do ${filename}:`, error);
  }
}

// Inicjalizacja danych
let officers = {};
let reports = [];
let units = {};

async function initializeData() {
  officers = await loadData(OFFICERS_FILE, {});
  reports = await loadData(REPORTS_FILE, []);
  units = await loadData(UNITS_FILE, {});
}

initializeData();

// Strona główna
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Endpoint do aktualizacji pozycji
app.post('/update', async (req, res) => {
  console.log('Otrzymano POST /update:', req.body);

  const { location, device_id } = req.body;

  if (!location || !location.coords || !device_id) {
    return res.status(400).json({ status: 'error', message: 'Brak danych lub współrzędnych' });
  }

  const lat = parseFloat(location.coords.latitude);
  const lng = parseFloat(location.coords.longitude);
  const timestamp = location.timestamp ? new Date(location.timestamp).getTime() : Date.now();

  officers[device_id] = { 
    name: officers[device_id]?.name || device_id, 
    lat, 
    lng, 
    timestamp 
  };
  
  // Zapisz dane do pliku
  await saveData(OFFICERS_FILE, officers);

  res.json({ status: 'ok', data: officers[device_id] });
});

// Endpoint pobierania wszystkich pozycji
app.get('/positions', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(officers);
});

// Endpoint do zarządzania zgłoszeniami
app.get('/reports', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(reports);
});

app.post('/reports', async (req, res) => {
  try {
    const newReport = req.body;
    reports.push(newReport);
    await saveData(REPORTS_FILE, reports);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ status: 'ok', report: newReport });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.put('/reports/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const updatedReport = req.body;
    
    const index = reports.findIndex(r => r.id === reportId);
    if (index === -1) {
      return res.status(404).json({ status: 'error', message: 'Zgłoszenie nie znalezione' });
    }
    
    reports[index] = updatedReport;
    await saveData(REPORTS_FILE, reports);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ status: 'ok', report: updatedReport });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.delete('/reports/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    reports = reports.filter(r => r.id !== reportId);
    await saveData(REPORTS_FILE, reports);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ status: 'ok', message: 'Zgłoszenie usunięte' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Endpoint do zarządzania jednostkami
app.get('/units', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(units);
});

app.put('/units/:id', async (req, res) => {
  try {
    const unitId = req.params.id;
    const updatedUnit = req.body;
    
    units[unitId] = updatedUnit;
    await saveData(UNITS_FILE, units);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ status: 'ok', unit: updatedUnit });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));
