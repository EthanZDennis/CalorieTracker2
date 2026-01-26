import express from "express";
import multer from "multer";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { db } from "./db";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// --- CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- ROUTES ---

// 1. GET DATA
app.get("/api/stats", async (req, res) => {
  const user = (req.query.user as 'husband' | 'wife') || 'husband';
  const data = await db.getStats(user);
  res.json(data);
});

// 2. LOG PHOTO (AI)
app.post("/api/log/photo", upload.single("image"), async (req: any, res: any) => {
  try {
    const user = req.body.user || 'husband';
    if (!req.file) throw new Error("No photo");

    const optimizedBuffer = await sharp(req.file.buffer).resize(600).jpeg({ quality: 50 }).toBuffer();
    const prompt = `Identify food. Estimate calories/protein. Err on lower side (-15%). Return JSON: { "item": string, "calories": number, "protein": number, "category": "Breakfast"|"Lunch"|"Dinner"|"Snack"|"Protein Shake" }`;
    
    const result = await model.generateContent([prompt, { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }]);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const aiData = JSON.parse(text);

    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      user,
      ...aiData
    };
    await db.addLog(entry);
    res.json(entry);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 3. LOG MANUAL (Flexible Fields)
app.post("/api/log/manual", async (req, res) => {
  try {
    const { user, item, calories, protein, category } = req.body;
    
    // Default values if fields are blank
    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      user, 
      item: item || "Manual Entry", // Default name if blank
      calories: Number(calories) || 0, // 0 if blank
      protein: Number(protein) || 0,   // 0 if blank
      category: category || "Snack"
    };
    
    await db.addLog(entry);
    res.json(entry);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 4. WEIGHT
app.post("/api/weight", async (req, res) => {
  try {
    const { user, weight } = req.body;
    await db.addWeight({ date: new Date().toISOString(), user: user, weight: Number(weight) });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
