const express = require('express');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');


registerFont(path.join(__dirname, 'Inter-Bold.ttf'), {
  family: 'Inter',
  weight: 'bold'
});

registerFont(path.join(__dirname, 'Inter-Light.ttf'), {
  family: 'Inter',
  weight: 'normal'
});


const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const OUTPUT_WIDTH  = 1080;
const OUTPUT_HEIGHT = 1350;
const BAR_HEIGHT    = 12;

const CATEGORY_COLORS = {
  cleanup: '#E5006A',
  kita_cleanup: '#F5A623',
  schul_cleanup: '#4A90D9',
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

function formatDate(serial) {
  const n = Number(serial);
  if (!n) return '';

  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const date = new Date(excelEpoch.getTime() + n * 86400000);

  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();

  return `${d}.${m}.${y}`;
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

    console.log(
      'DEBUG imageBase64:',
      !!imageBase64,
      imageBase64 ? imageBase64.slice(0, 40) : 'leer'
    );

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
      // Cover-Fit für 4:5
      const scale = Math.max(
        OUTPUT_WIDTH / basImg.width,
        OUTPUT_HEIGHT / basImg.height
      );

      const drawWidth = basImg.width * scale;
      const drawHeight = basImg.height * scale;
      const offsetX = (OUTPUT_WIDTH - drawWidth) / 2;
      const offsetY = (OUTPUT_HEIGHT - drawHeight) / 2;

      ctx.drawImage(basImg, offsetX, offsetY, drawWidth, drawHeight);
    }

    // 2. Gradient-Overlay
    if (gradientUrl) {
      try {
        const gradientImg = await loadImageFromUrl(gradientUrl);
        ctx.drawImage(gradientImg, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      } catch (e) {
        console.warn('Gradient konnte nicht geladen werden:', e.message);

        // Fallback-Gradient
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
    const barColor = CATEGORY_COLORS[category] || '#E5006A';
    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, OUTPUT_WIDTH, BAR_HEIGHT);
    const textColor = category === 'kita_cleanup' ? '#000000' : '#ffffff';

    // 4. Brand-Overlay vollflächig
    if (logoUrl) {
      try {
        const brandOverlay = await loadImageFromUrl(logoUrl);
        ctx.drawImage(brandOverlay, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      } catch (e) {
        console.warn('Brand-Overlay konnte nicht geladen werden:', e.message);
      }
    }

    // 5. Text unten links
    const textX = 60;
    const textBottom = OUTPUT_HEIGHT - 120;
    const maxWidth = OUTPUT_WIDTH - 120;

    // Datum
    if (date) {
    ctx.font = '30px Inter';
      ctx.fillStyle = textColor;
      ctx.fillText(formatDate(String(date)), textX, textBottom - 140);
    }

    // Titel
    if (title) {
      ctx.font = 'bold 64px Inter';
      ctx.fillStyle = '#textColor';

      const lines = wrapText(ctx, title, maxWidth).slice(0, 3);
      const lineHeight = 74;
      const startY = textBottom - ((lines.length - 1) * lineHeight);

      lines.forEach((line, i) => {
        ctx.fillText(line, textX, startY + i * lineHeight);
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
