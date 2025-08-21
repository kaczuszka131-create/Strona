const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 10000;

// --- Ścieżki do folderu persistent disk ---
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const OFFICERS_FILE = path.join(DATA_DIR, 'officers.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const UNITS_FILE = path.join(DATA_DIR, 'units.json');

// --- Middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// --- Funkcje do obsługi danych ---
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

async function loadData(filename, defaultData = {}) {
    try {
        await ensureDataDir();
        const data = await fs.readFile(filename, 'utf8');
        return JSON.parse(data);
    } catch {
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

// --- Inicjalizacja danych ---
let officers = {};
let reports = [];
let units = {};

async function initializeData() {
    officers = await loadData(OFFICERS_FILE, {});
    reports = await loadData(REPORTS_FILE, []);
    units = await loadData(UNITS_FILE, {});
}

initializeData();

// --- Strona główna ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- Endpointy ---

// Pobranie wszystkich pozycji
app.get('/positions', async (req, res) => {
    try {
        officers = await loadData(OFFICERS_FILE, {});
        res.json(officers);
    } catch (error) {
        console.error('Błąd pobierania pozycji:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// Aktualizacja pozycji funkcjonariusza
app.post('/update', async (req, res) => {
    try {
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

        await saveData(OFFICERS_FILE, officers);
        res.json({ status: 'ok', data: officers[device_id] });
    } catch (error) {
        console.error('Błąd aktualizacji pozycji:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Zarządzanie zgłoszeniami

// Pobierz wszystkie zgłoszenia
app.get('/reports', async (req, res) => {
    try {
        reports = await loadData(REPORTS_FILE, []);
        res.json(reports);
    } catch (error) {
        console.error('Błąd pobierania zgłoszeń:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// Utwórz nowe zgłoszenie
app.post('/reports', async (req, res) => {
    try {
        const newReport = req.body;
        
        // Upewnij się, że assignedUnits jest tablicą
        if (!newReport.assignedUnits) {
            newReport.assignedUnits = [];
        }
        
        reports.push(newReport);
        await saveData(REPORTS_FILE, reports);
        res.json({ status: 'ok', report: newReport });
    } catch (error) {
        console.error('Błąd tworzenia zgłoszenia:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Aktualizuj zgłoszenie
app.put('/reports/:id', async (req, res) => {
    try {
        const reportId = req.params.id;
        const updatedReport = req.body;
        const index = reports.findIndex(r => r.id === reportId);

        if (index === -1) {
            return res.status(404).json({ status: 'error', message: 'Zgłoszenie nie znalezione' });
        }

        // Upewnij się, że assignedUnits jest tablicą
        if (!updatedReport.assignedUnits) {
            updatedReport.assignedUnits = [];
        }

        reports[index] = updatedReport;
        await saveData(REPORTS_FILE, reports);
        res.json({ status: 'ok', report: updatedReport });
    } catch (error) {
        console.error('Błąd aktualizacji zgłoszenia:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Usuń zgłoszenie
app.delete('/reports/:id', async (req, res) => {
    try {
        const reportId = req.params.id;
        const index = reports.findIndex(r => r.id === reportId);

        if (index === -1) {
            return res.status(404).json({ status: 'error', message: 'Zgłoszenie nie znalezione' });
        }

        // Zwolnij wszystkie przypisane jednostki
        const report = reports[index];
        if (report.assignedUnits && report.assignedUnits.length > 0) {
            for (const unitId of report.assignedUnits) {
                if (units[unitId]) {
                    units[unitId].status = 'available';
                }
            }
            await saveData(UNITS_FILE, units);
        }

        // Usuń zgłoszenie
        reports.splice(index, 1);
        await saveData(REPORTS_FILE, reports);
        res.json({ status: 'ok', message: 'Zgłoszenie usunięte' });
    } catch (error) {
        console.error('Błąd usuwania zgłoszenia:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Zarządzanie jednostkami

// Pobierz wszystkie jednostki
app.get('/units', async (req, res) => {
    try {
        units = await loadData(UNITS_FILE, {});
        res.json(units);
    } catch (error) {
        console.error('Błąd pobierania jednostek:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// Aktualizuj jednostkę
app.put('/units/:id', async (req, res) => {
    try {
        const unitId = req.params.id;
        const updatedUnit = req.body;
        units[unitId] = updatedUnit;
        await saveData(UNITS_FILE, units);
        res.json({ status: 'ok', unit: updatedUnit });
    } catch (error) {
        console.error('Błąd aktualizacji jednostki:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Usuń jednostkę
app.delete('/units/:id', async (req, res) => {
    try {
        const unitId = req.params.id;
        
        // Usuń jednostkę ze wszystkich zgłoszeń
        for (const report of reports) {
            if (report.assignedUnits && report.assignedUnits.includes(unitId)) {
                report.assignedUnits = report.assignedUnits.filter(id => id !== unitId);
            }
        }
        await saveData(REPORTS_FILE, reports);
        
        // Usuń jednostkę
        delete units[unitId];
        await saveData(UNITS_FILE, units);
        
        res.json({ status: 'ok', message: 'Jednostka usunięta' });
    } catch (error) {
        console.error('Błąd usuwania jednostki:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Endpoint do testowania
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Serwer działa poprawnie', timestamp: new Date().toISOString() });
});

// Obsługa błędów 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint nie istnieje' });
});

// --- Start serwera ---
app.listen(PORT, () => {
    console.log(`API działa na porcie ${PORT}`);
    console.log(`Dane przechowywane w: ${DATA_DIR}`);
});
