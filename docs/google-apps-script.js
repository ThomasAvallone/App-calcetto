/**
 * CALCETTO ANALYTICS — Google Apps Script
 *
 * ISTRUZIONI DI DEPLOYMENT:
 * 1. Vai su https://script.google.com
 * 2. Crea un nuovo progetto e incolla questo codice
 * 3. Configura SPREADSHEET_ID con l'ID del tuo Google Spreadsheet
 * 4. Vai su Deploy → New Deployment → Web App
 * 5. Execute as: Me
 * 6. Who has access: Anyone (per permettere all'app di chiamarlo)
 * 7. Copia l'URL e incollalo in VITE_SHEETS_WEBHOOK_URL nel file .env
 */

const SPREADSHEET_ID = 'YOUR_GOOGLE_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'Partite';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (payload.action === 'append_match') {
      appendMatch(ss, payload.data);
    } else if (payload.action === 'sync_all') {
      syncAll(ss, payload.data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Calcetto Analytics webhook attivo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendMatch(ss, data) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Data', 'Risultato', 'Marcatori', 'Assist', 'MVP', 'ID Partita']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1A202C').setFontColor('#4FD1C5');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.date,
    data.result,
    data.scorers,
    data.assists,
    data.mvp,
    data.matchId,
  ]);

  // Auto-resize columns
  sheet.autoResizeColumns(1, 6);
}

function syncAll(ss, rows) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Headers
  sheet.appendRow(['Data', 'Risultato', 'Marcatori', 'Assist', 'MVP', 'ID Partita']);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1A202C').setFontColor('#4FD1C5');
  sheet.setFrozenRows(1);

  // Data rows
  for (const row of rows) {
    sheet.appendRow([row.date, row.result, row.scorers, row.assists, row.mvp, row.matchId]);
  }

  sheet.autoResizeColumns(1, 6);
}
