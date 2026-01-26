import express from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import path from "path";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5" });

// --- THE WEBSITE UI (HTML/CSS) ---
// This serves the "App" directly to your browser
const HTML_UI = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>CalorieHUD</title>
  <style>
    :root { --primary: #6366f1; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
    
    /* Header & Tabs */
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .brand { font-size: 24px; font-weight: 800; color: #1e1b4b; }
    .tabs { display: flex; gap: 10px; background: #e0e7ff; padding: 5px; border-radius: 12px; margin-bottom: 20px; }
    .tab { flex: 1; text-align: center; padding: 10px; border-radius: 8px; font-weight: 600; color: #6366f1; cursor: pointer; }
    .tab.active { background: white; shadow: 0 2px 4px rgba(0,0,0,0.1); color: #1e1b4b; }

    /* Stats Cards */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .card { background: var(--card); padding: 15px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .card-label { font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }
    .card-value { font-size: 24px; font-weight: 800; }
    .unit { font-size: 14px; color: #94a3b8; font-weight: 500; }
    
    /* Progress Bar */
    .progress-container { background: var(--card); padding: 20px; border-radius: 16px; margin-bottom: 20px; }
    .bar-bg { background: #f1f5f9; height: 12px; border-radius: 6px; overflow: hidden; margin-top: 10px; }
    .bar-fill { background: linear-gradient(90deg, #f59e0b, #ea580c); height: 100%; width: 26%; transition: width 0.5s ease; }

    /* Action Area */
    .action-area { background: white; padding: 20px; border-radius: 24px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); position: fixed; bottom: 20px; left: 20px; right: 20px; }
    .upload-btn { background: var(--primary); color: white; width: 100%; padding: 16px; border-radius: 14px; font-size: 18px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
    .upload-btn:active { transform: scale(0.98); }
    #fileInput { display: none; }
    
    /* Loading/Status */
    #status { margin-top: 10px; font-weight: 600; color: #64748b; }
  </style>
</head>
<body>

  <div class="header">
    <div class="brand">CalorieHUD 🥩</div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="switchUser('husband')">🇺🇸 Husband</div>
    <div class="tab" onclick="switchUser('wife')">🇯🇵 Wife</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Daily Goal</div>
      <div class="card-value">4000 <span class="unit">kcal</span></div>
    </div>
    <div class="card">
      <div class="card-label">Current Weight</div>
      <div class="card-value">143 <span class="unit">lbs</span></div>
    </div>
  </div>

  <div class="progress-container">
    <div class="card-label">Consumed Today</div>
    <div class="card-value" id="consumedDisplay">1020 <span class="unit">kcal</span></div>
    <div class="bar-bg">
      <div class="bar-fill" id="progressBar"></div>
    </div>
  </div>

  <div class="action-area">
    <input type="file" id="fileInput" accept="image/*" onchange="uploadPhoto()">
    <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
      📸 Add Meal Photo
    </button>
    <div id="status">AI Auto-Estimate Ready</div>
  </div>

  <script>
    async function uploadPhoto() {
      const fileInput = document.getElementById('fileInput');
      const status = document.getElementById('status');
      
      if (!fileInput.files[0]) return;

      const formData = new FormData();
      formData.append("image", fileInput.files[0]);

      status.innerText = "⏳ Compressing & Analyzing...";
      status.style.color = "#d97706"; // Orange

      try {
        const response = await fetch("/log", { method: "POST", body: formData });
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // Update UI with new numbers
        status.innerText = "✅ " + data.food + " added!";
        status.style.color = "#16a34a"; // Green
        
        // Simple demo logic to update numbers (in a real app, you'd fetch the total)
        const current = parseInt(document.getElementById('consumedDisplay').innerText);
        const newTotal = current + data.calories;
        document.getElementById('consumedDisplay').innerText = newTotal + " kcal";
        
      } catch (error) {
        status.innerText = "❌ Error: " + error.message;
        status.style.color = "#dc2626";
      }
    }

    function switchUser(user) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
      // Logic to switch goals could go here
    }
  </script>
</body>
</html>
`;

// --- SERVER ROUTES ---

// 1. Serve the UI when you visit the site
app.get("/", (req, res) => {
  res.send(HTML_UI);
});

// 2. Handle the Image Upload (Backend Logic)
app.post("/log", upload.single("image"), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo" });

    // Optimize Image
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(800)
      .jpeg({ quality: 60 })
      .toBuffer();

    // Ask Gemini
    const prompt = `
      Identify this food. Estimate calories and protein.
      CRITICAL: Err on the lower side (subtract 15%) for a hardgainer bulk.
      Return JSON only: { "food": string, "calories": number, "protein": number }
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    const cleanJson = text.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, "").trim();
    
    res.json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on \${PORT}\`));
