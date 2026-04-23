const express = require('express');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fetch = require('node-fetch');

// ──────────────────────────────────────────────
// FONTS REGISTER
// ──────────────────────────────────────────────
registerFont(path.join(__dirname, 'Inter-Bold.ttf'), {
  family: 'Inter',
  weight: 'bold'
});

registerFont(path.join(__dirname, 'Inter-Light.ttf'), {
  family: 'Inter',
  weight: 'normal'
});

registerFont(path.join(__dirname, 'Inter_28pt-BlackItalic.ttf'), {
  family: 'InterBlackItalic'
});

const app = express();
app.use(express.json({ limit: '50mb' }));

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const OUTPUT_WIDTH  = 1080;
const OUTPUT_HEIGHT = 1350;
const BAR_HEIGHT    = 12;

const CATEGORY_COLORS = {
  cleanup:        '#E5006A',
  kita_cleanup:   '#F5A623',
  schul_cleanup:  '#4A90D9',
};

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
async function loadImageFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Bild konnte nicht geladen werden: ${url} (${res.status})`);
  }
  const buf = await res.buffer();
  return loadImage(buf);
}

async function loadImageFromBase64(b64) {
  const cleaned = b64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(cleaned, 'base64');
  return loadImage(buf);
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return '';

  // ISO-String: 2026-11-26 oder 2026-11-26T00:00:00
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  }

  // Excel-Seriennummer
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value);
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + n * 86400000);
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}.${m}.${y}`;
  }

  // Fallback: Wert so zurückgeben wie er ist
  return String(value);
}

// ──────────────────────────────────────────────
// ROUTE
// ──────────────────────────────────────────────
app.post('/generate', async (req, res) => {
  try {
    const {
      imageUrl,
      imageBase64,
      title,
      date,
      category,
      logoUrl,
      gradientUrl,
    } = req.body;

    const canvas = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const ctx = canvas.getContext('2d');

    // 0. Hintergrund-Fallback
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    // 1. Basisbild
    let basImg = null;
    if (imageBase64) {
      basImg = await loadImageFromBase64(imageBase64);
    } else if (imageUrl) {
      basImg = await loadImageFromUrl(imageUrl);
    }

    if (basImg) {
      const scale = Math.max(OUTPUT_WIDTH / basImg.width, OUTPUT_HEIGHT / basImg.height);
      const drawWidth  = basImg.width  * scale;
      const drawHeight = basImg.height * scale;
      const offsetX = (OUTPUT_WIDTH  - drawWidth)  / 2;
      const offsetY = (OUTPUT_HEIGHT - drawHeight) / 2;
      ctx.drawImage(basImg, offsetX, offsetY, drawWidth, drawHeight);
    }

    // 2. Gradient-Overlay
    if (gradientUrl) {
      try {
        const gradientImg = await loadImageFromUrl(gradientUrl);
        ctx.drawImage(gradientImg, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      } catch (e) {
        const grad = ctx.createLinearGradient(0, OUTPUT_HEIGHT * 0.35, 0, OUTPUT_HEIGHT);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.78)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      }
    } else {
      const grad = ctx.createLinearGradient(0, OUTPUT_HEIGHT * 0.35, 0, OUTPUT_HEIGHT);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    }

    // 3. Kategorie-Leiste oben
    const barColor  = CATEGORY_COLORS[category] || '#E5006A';
    ctx.fillStyle   = barColor;
    ctx.fillRect(0, 0, OUTPUT_WIDTH, BAR_HEIGHT);
    const textColor = category === 'kita_cleanup' ? '#000000' : '#ffffff';

    // 4. Brand-Overlay (Logo)
    if (logoUrl) {
      try {
        const brandOverlay = await loadImageFromUrl(logoUrl);
        ctx.drawImage(brandOverlay, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      } catch (e) {
        console.warn('Brand-Overlay Error:', e.message);
      }
    }

    // 5. Text unten links
    // Anker: Datum immer auf fester Y-Position → Titel wächst nach UNTEN
    const textX           = 60;
    const maxWidth        = OUTPUT_WIDTH - 80;
    const lineHeight      = 110;
    const FONT_SIZE_TITLE = 110;
    const FONT_SIZE_DATE  = 48;

    // Feste Startposition des gesamten Text-Blocks
    const DATE_Y        = OUTPUT_HEIGHT - 400;   // Datum-Baseline: immer hier
    const TITLE_START_Y = DATE_Y + 136;           // Titel-Baseline erste Zeile: immer hier

    // ── DATUM ──
    if (date) {
      ctx.font      = `bold ${FONT_SIZE_DATE}px Inter`;
      ctx.fillStyle = textColor;
      ctx.fillText(normalizeDate(date), textX, DATE_Y);
    }

    // ── TITEL – wächst nach unten, max 3 Zeilen ──
    if (title) {
      ctx.font = `${FONT_SIZE_TITLE}px "InterBlackItalic"`;
      let titleLines = wrapText(ctx, title, maxWidth);
      if (titleLines.length > 3) {
        titleLines = titleLines.slice(0, 3);
        titleLines[2] = titleLines[2].replace(/\s+\S*$/, '') + '…';
      }
      ctx.fillStyle = textColor;
      titleLines.forEach((line, i) => {
        ctx.fillText(line, textX, TITLE_START_Y + i * lineHeight);
      });
    }

    // 6. Output
    const buffer = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.send(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`WCD Image Service läuft auf Port ${PORT}`);
});
