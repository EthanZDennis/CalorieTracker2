import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export interface LogEntry {
  id: string; // We use the Timestamp as the ID
  date: string;
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

// --- CONFIG ---
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

let MEMORY_LOGS: LogEntry[] = [];
let MEMORY_WEIGHTS: WeightEntry[] = [];

export const db = {
  // 1. INIT (Load Data)
  async init() {
    if (!SERVICE_EMAIL) return;
    try {
      console.log("📥 Syncing...");
      const doc = await getDoc();
      const rows = await doc.sheetsByIndex[0].getRows();
      
      // Map Sheet Rows to Memory
      MEMORY_LOGS = rows.map(row => {
        // Reconstruct timestamp from date/time string if needed, 
        // but for safety we will rely on finding rows by content later
        const fullDate = new Date(`${row.get('Date')} ${row.get('Time')}`);
        return {
          id: fullDate.getTime().toString(), // Use time as ID
          date: fullDate.toISOString(),
          timestamp: fullDate.getTime(),
          user: row.get('User'),
          item: row.get('Item'),
          calories: Number(row.get('Calories')) || 0,
          protein: Number(row.get('Protein')) || 0,
          category: row.get('Category')
        };
      });
      
      // Load Weights
      const sheetW = doc.sheetsByIndex[1];
      if (sheetW) {
        const wRows = await sheetW.getRows();
        MEMORY_WEIGHTS = wRows.map(r => ({ date: r.get('Date'), user: r.get('User'), weight: Number(r.get('Weight')) }));
      }
      console.log(`✅ Loaded ${MEMORY_LOGS.length} logs.`);
    } catch (e) { console.error("Sync Error:", e); }
  },

  // 2. ADD LOG (Now supports Custom Dates)
  async addLog(entry: LogEntry) {
    // Add to Memory immediately
    MEMORY_LOGS.push(entry);
    
    // Add to Sheet
    if (SERVICE_EMAIL) {
      try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0];
        // Use the entry's actual timestamp for the Date/Time columns
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
      } catch (e) { console.error("Sheet Write Error:", e); }
    }
  },

  // 3. DELETE LOG (New Feature!)
  async deleteLog(id: string, user: 'husband' | 'wife') {
    // 1. Remove from Memory
    const index = MEMORY_LOGS.findIndex(l => l.id === id);
    if (index !== -1) MEMORY_LOGS.splice(index, 1);

    // 2. Remove from Sheet
    if (SERVICE_EMAIL) {
      try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        
        // Find the row that matches our ID (approximate by user + item + calories to be safe, or index)
        // Since we don't store ID in sheet, we match by content. 
        // NOTE: This is a simple matcher. 
        const rowToDelete = rows.find(r => {
           // Reconstruct timestamp to match ID
           const rDate = new Date(`${r.get('Date')} ${r.get('Time')}`).getTime().toString();
           // Allow 60s variance or exact match
           return Math.abs(Number(rDate) - Number(id)) < 2000 && r.get('User') === user;
        });

        if (rowToDelete) await rowToDelete.delete();
      } catch (e) { console.error("Sheet Delete Error:", e); }
    }
  },

  // 4. ADD WEIGHT
  async addWeight(entry: WeightEntry) {
    MEMORY_WEIGHTS.push(entry);
    if (SERVICE_EMAIL) {
      const doc = await getDoc();
      let sheet = doc.sheetsByIndex[1] || await doc.addSheet({ title: "Weight" });
      await sheet.addRow({ Date: entry.date, User: entry.user, Weight: entry.weight });
    }
  },

  // 5. GET STATS
  async getStats(user: 'husband' | 'wife') {
    const timeZone = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { timeZone });

    // Sort by Date (Newest First)
    const userLogs = MEMORY_LOGS.filter(l => l.user === user).sort((a, b) => b.timestamp - a.timestamp);
    
    // Calculate Today's totals
    const todayLogs = userLogs.filter(l => {
        return new Date(l.timestamp).toLocaleDateString('en-US', { timeZone }) === todayStr;
    });

    const totalCals = todayLogs.reduce((sum, l) => sum + l.calories, 0);
    const totalProtein = todayLogs.reduce((sum, l) => sum + l.protein, 0);
    const lastWeight = MEMORY_WEIGHTS.filter(w => w.user === user).pop()?.weight || 0;

    return { totalCals, totalProtein, lastWeight, recentLogs: userLogs.slice(0, 30), chartData: getChartData(userLogs, timeZone) };
  }
};

async function getDoc() {
  const jwt = new JWT({ email: SERVICE_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID as string, jwt);
  await doc.loadInfo();
  return doc;
}

function getChartData(logs: LogEntry[], timeZone: string) {
  const last7Days: Record<string, number> = {};
  for(let i=6; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US', { timeZone, month:'short', day:'numeric' });
    last7Days[key] = 0;
  }
  logs.forEach(l => {
    const key = new Date(l.timestamp).toLocaleDateString('en-US', { timeZone, month:'short', day:'numeric' });
    if (last7Days[key] !== undefined) last7Days[key] += l.calories;
  });
  return { labels: Object.keys(last7Days), values: Object.values(last7Days) };
}
