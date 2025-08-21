const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serwowanie plików statycznych (index.html)
app.use(express.static(path.join(__dirname)));

// Przechowywanie pozycji
let officers = {};

// Strona główna
app.get('/', (req, res) => res.send("Serwer GPS działa! POST /update, GET /positions"));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Endpoint do aktualizacji pozycji
app.post('/update', (req, res) => {
    console.log('--- NOWY POST /update ---');
    console.log('Otrzymane body:', req.body);

    const { location, device_id } = req.body;

    if (!location || !location.coords || !device_id) {
        console.log('Brak danych lub współrzędnych!');
        return res.status(400).json({ status: 'error', message: 'Brak danych lub współrzędnych' });
    }

    const lat = parseFloat(location.coords.latitude);
    const lng = parseFloat(location.coords.longitude);
    const timestamp = location.timestamp ? new Date(location.timestamp).getTime() : Date.now();

    officers[device_id] = { name: device_id, lat, lng, timestamp };
    console.log(`Aktualizacja pozycji: ${device_id} -> lat:${lat}, lng:${lng}`);

    res.json({ status: 'ok', data: officers[device_id], received: req.body });
});

// Endpoint pobierania wszystkich pozycji
app.get('/positions', (req, res) => res.json(officers));

app.listen(PORT, () => console.log(`Serwer działa na http://localhost:${PORT}`));
