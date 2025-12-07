const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images

// Helper to read DB
const readDb = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { profiles: [], userData: {} };
    }
};

// Helper to write DB
const writeDb = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// GET all profiles
app.get('/api/profiles', (req, res) => {
    const db = readDb();
    res.json(db.profiles || []);
});

// POST new profiles (update list)
app.post('/api/profiles', (req, res) => {
    const db = readDb();
    db.profiles = req.body;
    writeDb(db);
    res.json({ success: true, profiles: db.profiles });
});

// GET user data
app.get('/api/users/:id', (req, res) => {
    const db = readDb();
    const userId = req.params.id;
    const data = db.userData[userId] || { route: null, progress: null, appState: 'SETUP' };
    res.json(data);
});

// POST user data (update state)
app.post('/api/users/:id', (req, res) => {
    const db = readDb();
    const userId = req.params.id;
    db.userData[userId] = req.body; // Expects { route, progress, appState }
    writeDb(db);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
