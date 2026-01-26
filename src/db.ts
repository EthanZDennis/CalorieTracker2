import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// --- TYPES ---
export interface LogEntry {
  id: string;
  date: string; // ISO String
  user: 'husband' | 'wife';
  item: string;
  calories: number;
  protein: number;
  category: string;
  timestamp: number;
}

export interface WeightEntry {
  date: string;
  user: 'husband' | 'wife';
  weight: number;
}

// --- MEMORY STORAGE (Temporary until Sheets is connected) ---
let MEMORY_LOGS: LogEntry[] = [];
let MEMORY_WEIGHTS: WeightEntry[] = [];

// --- GOOGLE SHEETS CONNECTION ---
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

export const db = {
  // 1. ADD FOOD
  async addLog(entry: LogEntry) {
    MEMORY_LOGS.push(entry); // Save to RAM
    
    // Attempt Save to Sheet
    if (SERVICE_EMAIL && PRIVATE_KEY && SHEET_ID) {
      try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0];
        const timeZone = entry.user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
        
        await sheet.addRow({
          Date: new Date(entry.timestamp).toLocaleDateString('en-US', { timeZone }),
          Time: new Date(entry.timestamp).toLocaleTimeString('en-US', { timeZone }),
          User: entry.user,
          Item: entry.item,
          Calories: entry.calories,
          Protein: entry.protein,
          Category: entry.category
        });
      } catch (e) { console.error("Sheet Error (Log):", e); }
    }
  },

  // 2. ADD WEIGHT
  async addWeight(entry: WeightEntry) {
    MEMORY_WEIGHTS.push(entry);
    
    if (SERVICE_EMAIL && PRIVATE_KEY && SHEET_ID) {
      try {
        const doc = await getDoc();
        let sheet = doc.sheetsByIndex[1];
        if (!sheet) sheet = await doc.addSheet({ title: "Weight" });
        await sheet.addRow({ Date: entry.date, User: entry.user, Weight: entry.weight });
      } catch (e) { console.error("Sheet Error (Weight):", e); }
    }
  },

  // 3. GET STATS & HISTORY
  async getStats(user: 'husband' | 'wife') {
    const timeZone = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const now = new Date();
    const todayString = now.toLocaleDateString('en-US', { timeZone });

    // Filter logs for this user
    const userLogs = MEMORY_LOGS.filter(l => l.user === user).sort((a,b) => b.timestamp - a.timestamp);
    
    // Calculate Today's Totals
    const todayLogs = userLogs.filter(l => {
      const logDate = new Date(l.timestamp).toLocaleDateString('en-US', { timeZone });
      return logDate === todayString;
    });

    const totalCals = todayLogs.reduce((sum, l) => sum + l.calories, 0);
    const totalProtein = todayLogs.reduce((sum, l) => sum + l.protein, 0);

    // Get Last Weight
    const userWeights = MEMORY_WEIGHTS.filter(w => w.user === user);
    const lastWeight = userWeights.length > 0 ? userWeights[userWeights.length - 1].weight : 0;

    return { 
      totalCals, 
      totalProtein, 
      lastWeight, 
      recentLogs: userLogs.slice(0, 30), // Return last 30 items for history list
      chartData: getChartData(userLogs, timeZone) // Helper for the bar chart
    };
  }
};

// --- HELPERS ---
async function getDoc() {
  const jwt = new JWT({ email: SERVICE_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID as string, jwt);
  await doc.loadInfo();
  return doc;
}

function getChartData(logs: LogEntry[], timeZone: string) {
  // Group last 7 days by date
  const last7Days: Record<string, number> = {};
  
  // Initialize last 7 days with 0
  for(let i=6; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { timeZone, month:'short', day:'numeric' });
    last7Days[dateStr] = 0;
  }

  // Fill in data
  logs.forEach(l => {
    const dateStr = new Date(l.timestamp).toLocaleDateString('en-US', { timeZone, month:'short', day:'numeric' });
    if (last7Days[dateStr] !== undefined) {
      last7Days[dateStr] += l.calories;
    }
  });

  return {
    labels: Object.keys(last7Days),
    values: Object.values(last7Days)
  };
}
