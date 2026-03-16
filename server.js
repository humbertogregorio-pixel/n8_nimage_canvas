const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '20mb' }));

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const OUTPUT_WIDTH  = 1200;
const OUTPUT_HEIGHT = 630;
const BAR_HEIGHT    = 12;   // farbige Kategorie-Leiste oben
const LOGO_WIDTH    = 160;
const LOGO_HEIGHT   = 48;
const LOGO_PADDING  = 24;

const CATEGORY_COLORS = {
  cleanup:       '#E5006A',  // --wcu-hotpink
  kita_cleanup:  '#F5A623',
  schul_cleanup: '#4A90D9',
};

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
async function loadImageFromUrl(url) {
  const res = await fetch(url);
  const buf = await res.buffer();
  return loadImage(buf);
}

async function loadImageFromBase64(b64) {
  const buf = Buffer.from(b64, 'base64');
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

function formatDate(dateStr) {
  // expects YYYYMMDD
  if (!dateStr || dateStr.length !== 8) return dateStr || '';
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `${d}.${m}.${y}`;
}

// ──────────────────────────────────────────────
// ROUTE
// ──────────────────────────────────────────────
app.post('/generate', async (req, res) => {
  try {
    const {
      imageUrl,       // URL des Basisbilds
      imageBase64,    // alternativ: Base64
      title,          // Event-Titel
      date,           // YYYYMMDD
      category,       // cleanup | kita_cleanup | schul_cleanup
      logoUrl,        // URL des WCD-Logos
        gradientUrl,
    } = req.body;

    const canvas = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const ctx    = canvas.getContext('2d');

    // 1. Basisbild
    let basImg;
    if (imageBase64) {
      basImg = await loadImageFromBase64(imageBase64);
    } else if (imageUrl) {
      basImg = await loadImageFromUrl(imageUrl);
    } else {
      // leeres dunkelgraues Bild als Fallback
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    }

    if (basImg) {
      // cover-fit
      const scale = Math.max(OUTPUT_WIDTH / basImg.width, OUTPUT_HEIGHT / basImg.height);
      const sw    = basImg.width  * scale;
      const sh    = basImg.height * scale;
      const sx    = (OUTPUT_WIDTH  - sw) / 2;
      const sy    = (OUTPUT_HEIGHT - sh) / 2;
      ctx.drawImage(basImg, sx, sy, sw, sh);
    }

    // 2. Dunkles Gradient-Overlay (Text-Lesbarkeit)
    const grad = ctx.createLinearGradient(0, OUTPUT_HEIGHT * 0.35, 0, OUTPUT_HEIGHT);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    // 3. Kategorie-Leiste oben (volle Breite)
    const barColor = CATEGORY_COLORS[category] || '#E5006A';
    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, OUTPUT_WIDTH, BAR_HEIGHT);

    // 4. Logo oben links
    if (logoUrl) {
      try {
        const logo = await loadImageFromUrl(logoUrl);
        const lx   = LOGO_PADDING;
        const ly   = BAR_HEIGHT + LOGO_PADDING;
        ctx.drawImage(logo, lx, ly, LOGO_WIDTH, LOGO_HEIGHT);
      } catch (e) {
        console.warn('Logo konnte nicht geladen werden:', e.message);
      }
    }

    // 5. Text unten links
    const textX      = LOGO_PADDING;
    const textBottom = OUTPUT_HEIGHT - 36;
    const maxWidth   = OUTPUT_WIDTH - LOGO_PADDING * 2;

    // Datum
    if (date) {
      ctx.font      = 'bold 22px sans-serif';
      ctx.fillStyle = barColor;
      ctx.fillText(formatDate(date), textX, textBottom - 120);
    }

    // Titel (mehrzeilig)
    if (title) {
      ctx.font      = 'bold 52px sans-serif';
      ctx.fillStyle = '#ffffff';
      const lines   = wrapText(ctx, title, maxWidth);
      const lineH   = 62;
      const startY  = textBottom - (lines.length - 1) * lineH - 10;
      lines.forEach((line, i) => {
        ctx.fillText(line, textX, startY + i * lineH);
      });
    }

    // 6. Output als PNG
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
app.listen(PORT, '0.0.0.0', () => console.log(`WCD Image Service läuft auf Port ${PORT}`));
