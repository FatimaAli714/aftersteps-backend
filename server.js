require('dotenv').config();                 // loads MONGO_URI from the .env file (local only)
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

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

// ---------- Route: POST /orders ----------
// Saves a new order in the "order" collection.
// The front-end sends: { name, phone, items: [ { lessonID, spaces }, ... ] }
app.post('/orders', async (req, res) => {
  try {
    const { name, phone, items } = req.body;

    // The server checks the data too, because anyone can send a request without using our front-end
    const nameOk = typeof name === 'string' && /^[A-Za-z]+( [A-Za-z]+)*$/.test(name.trim());
    const phoneOk = typeof phone === 'string' && /^[0-9]{7,15}$/.test(phone.trim());
    const itemsOk = Array.isArray(items) && items.length > 0;
    if (!nameOk || !phoneOk || !itemsOk) {
      return res.status(400).json({ error: 'Invalid order: check name, phone and items' });
    }

    const order = { name: name.trim(), phone: phone.trim(), items, createdAt: new Date() };
    const result = await db.collection('order').insertOne(order);
    res.status(201).json({ message: 'Order saved', orderId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save order' });
  }
});

// ---------- Route: PUT /lessons/:id ----------
// Updates ANY fields of one lesson, e.g. body { "space": 3 } sets space to exactly 3
app.put('/lessons/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid lesson id' });
    }

    const updates = { ...req.body };
    delete updates._id;                                  // never allow changing the id
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await db.collection('lesson').updateOne(
      { _id: new ObjectId(req.params.id) },              // which lesson
      { $set: updates }                                  // what to change
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    res.json({ message: 'Lesson updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update lesson' });
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