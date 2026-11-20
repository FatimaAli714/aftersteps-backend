require('dotenv').config();                 // loads MONGO_URI from the .env file (local only)
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());                    // lets the server read JSON sent in request bodies (needed later for POST and PUT)

// ---------- Middleware 1: logger ----------
// Runs for EVERY request, prints one line to the console, then passes on with next()
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.url}`);
  next();
});

// ---------- Middleware 2: CORS ----------
// The front-end (github.io) and this server (onrender.com) are on different addresses,
// so the browser blocks the request unless the server says it is allowed.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);   // answer the browser's "permission check" request
  next();
});

let db;   // will hold the connection to the "aftersteps" database

// ---------- Route: GET /lessons ----------
// Returns every document in the "lesson" collection as JSON
app.get('/lessons', async (req, res) => {
  try {
    const lessons = await db.collection('lesson').find({}).toArray();
    res.json(lessons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch lessons' });
  }
});

// ---------- Start: connect to MongoDB first, then listen for requests ----------
async function start() {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('aftersteps');
    console.log('Connected to MongoDB Atlas');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Could not connect to MongoDB:', err.message);
  }
}
start();