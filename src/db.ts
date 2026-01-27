import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// Use 'export' so the index file can see these
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, serviceAccountAuth);

export async function initDB() {
  await doc.loadInfo();
  console.log("✅ Google Sheets Connected: " + doc.title);
}

export async function logMeal(user: string, data: any) {
  const sheet = doc.sheetsByTitle['Sheet1'];
  const dateOnly = data.date.split('T')[0]; 
  await sheet.addRow({
    Date: dateOnly,
    User: user,
    Item: data.item,
    Calories: data.calories,
    Protein: data.protein || 0,
    Category: data.category
  });
}

export async function logWeight(user: string, weight: number, date: string) {
  const sheet = doc.sheetsByTitle['Sheet2'];
  const dateOnly = date.split('T')[0];
  await sheet.addRow({
    Date: dateOnly,
    User: user,
    Weight: weight
  });
}

export async function getStats(user: string) {
  const sheet1 = doc.sheetsByTitle['Sheet1'];
  const sheet2 = doc.sheetsByTitle['Sheet2'];
  const [rows1, rows2] = await Promise.all([sheet1.getRows(), sheet2.getRows()]);

  const userRows = rows1.filter(r => r.get('User').toLowerCase() === user.toLowerCase());
  const weightRows = rows2.filter(r => r.get('User').toLowerCase() === user.toLowerCase());

  const today = new Date().toLocaleDateString("en-CA"); 
  const totalCals = userRows
    .filter(r => r.get('Date') === today)
    .reduce((sum, r) => sum + parseInt(r.get('Calories') || 0), 0);

  return {
    totalCals,
    lastWeight: weightRows.length > 0 ? weightRows[weightRows.length - 1].get('Weight') : null,
    recentLogs: userRows.slice(-20).map(r => ({
      id: r.rowNumber,
      timestamp: r.get('Date'),
      item: r.get('Item'),
      calories: r.get('Calories'),
      category: r.get('Category')
    })),
    chartData: {
      labels: userRows.map(r => r.get('Date')),
      values: userRows.map(r => parseInt(r.get('Calories') || 0))
    },
    weightHistory: weightRows.map(r => ({ x: r.get('Date'), y: r.get('Weight') }))
  };
}
