import express from 'express';
import path from 'path';
import multer from 'multer'; // Added for photo uploads
import { GoogleGenerativeAI } from "@google/generative-ai"; // Added for AI analysis
import * as db from './db';

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // Store shrunk photo in memory
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());
app.use(express.static('public'));

app.get('/api/stats', async (req, res) => {
  const stats = await db.getStats(req.query.user as string);
  res.json(stats);
});

// New Route: Handle the Shrunk Photo from the phone
app.post('/api/log/photo', upload.single('photo'), async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const user = req.body.user;

    const imageParts = [{
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype
      },
    }];

    // Using your specific "hardgainer" conservative rule
    const prompt = "Identify the food and estimate total calories and protein. Err on the lower side for calories. Respond ONLY in JSON: {\"item\": \"...\", \"calories\": 0, \"protein\": 0}";
    
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const data = JSON.parse(response.text());

    // Get date based on user's location (Honolulu or Tokyo)
    const tz = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const date = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    
    await db.logMeal(user, { ...data, date, category: "AI Photo" });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

app.post('/api/log/manual', async (req, res) => {
  await db.logMeal(req.body.user, req.body);
  res.sendStatus(200);
});

app.post('/api/weight', async (req, res) => {
  await db.logWeight(req.body.user, req.body.weight, req.body.date);
  res.sendStatus(200);
});

app.delete('/api/log/:id', async (req, res) => {
  await db.deleteLog(req.body.user, req.params.id);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
db.initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
});
