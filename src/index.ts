import express from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 1. Setup Gemini 2.5
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5" });

// 2. The Logic
app.post("/log", upload.single("image"), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo found" });

    console.log("📸 Processing photo...");

    // Shrink Image (iPhone fix)
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(800)
      .jpeg({ quality: 60 })
      .toBuffer();

    // Gemini Prompt
    const prompt = `
      Analyze this meal for a hardgainer.
      1. Identify items.
      2. Estimate calories/protein.
      3. CRITICAL: Err on the lower side (subtract 15%).
      4. Return JSON only: { "food": string, "calories": number, "protein": number }
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    const cleanJson = text.replace(/```json|```/g, "").trim();
    
    console.log("✅ Success:", cleanJson);
    res.json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Keep Awake
app.get("/", (req, res) => res.send("Tracker Online 🟢"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
