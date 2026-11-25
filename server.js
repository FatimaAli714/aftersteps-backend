require('dotenv').config();                 // loads MONGO_URI from the .env file (local only)
const express = require('express');
const path = require('path');
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

// ---------- Middleware 3: static files (lesson images) ----------
// A request like /images/tennis.jpg is answered with the file /images/tennis.jpg from the "images" folder.
app.use('/images', express.static(path.join(__dirname, 'images')));

// If express.static did not find the file, the request falls through to here
// and we send an error message instead of the image.
app.use('/images', (req, res) => {
  res.status(404).json({ error: 'Image not found' });
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

// ---------- Route: GET /search?q=... ----------
// Returns the lessons where the search text appears in the topic, location, teacher, price or space.
// Example: /search?q=rose finds every lesson held in Rose Hill.
app.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();   // the text after ?q=
    const lessons = await db.collection('lesson').find({}).toArray();

    if (q === '') return res.json(lessons);               // empty search: return everything

    const results = lessons.filter(lesson => {
      // turn every value into text so numbers like 900 can be searched too
      const values = [lesson.topic, lesson.location, lesson.teacher, String(lesson.price), String(lesson.space)];
      return values.some(value => value.toLowerCase().includes(q));
    });
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not search lessons' });
  }
});

// ---------- Route: GET /enrolment/:lessonid ----------
// Returns how many spaces have already been bought for one lesson, by adding up all the orders
app.get('/enrolment/:lessonid', async (req, res) => {
  try {
    const lessonId = req.params.lessonid;
    if (!ObjectId.isValid(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson id' });
    }

    // Make sure the lesson exists, so we can tell "0 bought" apart from "no such lesson"
    const lesson = await db.collection('lesson').findOne({ _id: new ObjectId(lessonId) });
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Find every order that has this lesson somewhere in its items list
    const orders = await db.collection('order').find({ 'items.lessonID': lessonId }).toArray();

    // Add up the spaces bought for THIS lesson (an order may also contain other lessons)
    let enrolled = 0;
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.lessonID === lessonId) enrolled += item.spaces;
      });
    });

    res.json({ lessonId: lessonId, topic: lesson.topic, enrolled: enrolled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not get enrolment' });
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