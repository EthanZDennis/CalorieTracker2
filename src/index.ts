import express, { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp'; 
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as db from './db';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

app.use(express.json());
app.use(express.static('public'));

app.post('/api/log/photo', upload.single('photo'), async (req: any, res: Response) => {
  try {
    const user = req.body.user;
    if (!req.file) return res.status(400).json({ error: "No photo" });

    // 1. Sharp: High-clarity processing for your hardgainer logs
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    // 2. VERIFIED MODEL: Using 2.5 Flash from your confirmed list
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imageParts = [{
      inlineData: {
        data: optimizedBuffer.toString("base64"),
        mimeType: "image/jpeg"
      },
    }];

    // 3. Strict prompt to ensure conservative calorie counting
    const prompt = `Identify food. Estimate calories/protein. 
    User: Army hardgainer (142 lbs). Rule: Err on the LOWER side for calories. 
    Respond ONLY in raw JSON: {"item": "name", "calories": 0, "protein": 0}`;
    
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    
    // 4. JSON Filter: Prevents the "AI was unsure" crash
    const cleanJson = response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleanJson);

    const tz = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const date = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    
    await db.logMeal(user, { ...data, date, category: "AI Photo" });
    res.json(data);
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

// Helper routes
app.get('/api/stats', async (req: Request, res: Response) => {
  const stats = await db.getStats(req.query.user as string);
  res.json(stats);
});

app.post('/api/log/manual', async (req: Request, res: Response) => {
  await db.logMeal(req.body.user, req.body);
  res.sendStatus(200);
});

app.post('/api/weight', async (req: Request, res: Response) => {
  await db.logWeight(req.body.user, req.body.weight, req.body.date);
  res.sendStatus(200);
});

app.delete('/api/log/:id', async (req: Request, res: Response) => {
  await db.deleteLog(req.body.user, req.params.id);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
db.initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));
});
