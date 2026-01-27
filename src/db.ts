export async function getStats(user: string) {
  const sheet1 = doc.sheetsByTitle['Sheet1'];
  const sheet2 = doc.sheetsByTitle['Sheet2'];
  const [rows1, rows2] = await Promise.all([sheet1.getRows(), sheet2.getRows()]);

  const userRows = rows1.filter(r => r.get('User').toLowerCase() === user.toLowerCase());
  const weightRows = rows2.filter(r => r.get('User').toLowerCase() === user.toLowerCase());

  // Use the correct timezone for today's calculation
  const tz = user.toLowerCase() === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz }); 
  
  // Calculate total calories for today
  const todayCals = userRows
    .filter(r => r.get('Date') === todayStr)
    .reduce((sum, r) => sum + parseInt(r.get('Calories') || 0), 0);

  return {
    totalCals: todayCals,
    lastWeight: weightRows.length > 0 ? weightRows[weightRows.length - 1].get('Weight') : null,
    recentLogs: userRows.map(r => ({ // REMOVED the .slice(-15) to show all history
      id: r.rowNumber,
      timestamp: r.get('Date'),
      item: r.get('Item'),
      calories: r.get('Calories'),
      category: r.get('Category')
    })).reverse(), // Show newest first in the list
    chartData: {
      labels: userRows.map(r => r.get('Date')),
      values: userRows.map(r => parseInt(r.get('Calories') || 0))
    },
    weightHistory: weightRows.map(r => ({ x: r.get('Date'), y: r.get('Weight') }))
  };
}
