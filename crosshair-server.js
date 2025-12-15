const express = require('express');

// @ts-ignore
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getCrosshairHandler } = require('./services/mainHandler');
const { sanitizePath, securityHeaders, checkRateLimit } = require('./middleware/sec');
const { CS2CrosshairRenderer } = require('./services/crosshairRenderer');

const app = express();

// ✅ Railway-friendly: vjeruj proxy headerima (X-Forwarded-Host, X-Forwarded-For, itd.)
app.set('trust proxy', true);

// ===== Host validation (Railway-safe) =====
// Railway često šalje Host kroz proxy kao X-Forwarded-Host.
// Ovo dopušta:
// - tvoj config.domain (i varijante s :80/:443)
// - Railway default *.up.railway.app (dok si na toj domeni)
const getReqHost = (req) => {
  const h = (req.headers['x-forwarded-host'] || req.headers.host || '').toString();
  return h.split(',')[0].trim().toLowerCase();
};

const allowedHosts = () => {
  const d = (config.domain || '').toLowerCase();
  const h = (config.host || '').toLowerCase();
  return new Set([d, h, `${d}:80`, `${d}:443`, `${h}:80`, `${h}:443`]);
};

app.use((req, res, next) => {
  const host = getReqHost(req);

  // pusti healthcheck/edge slučajeve
  if (!host) return next();

  // dopusti railway default domene dok si na njima
  if (host.endsWith('.up.railway.app')) return next();

  // dopusti ono što je u configu
  const allow = allowedHosts();
  if (allow.has(host)) return next();

  console.error(`[error] invalid host header: ${host} - IP: ${req.ip}`);
  return res.status(403).json({ error: 'access denied' });
});

// ostale security middleware
app.use(checkRateLimit);
app.use(sanitizePath);
// ❌ maknuli smo hostValidation iz ./middleware/sec jer on radi “strogo” i puca na Railwayu
app.use(securityHeaders);

app.get(/\.(ico|png|jpg|jpeg|gif|svg|css|js|txt|xml)$/i, (req, res) => res.status(204).end());

// for embed bots
app.get('/image/:filename', (req, res) => {
  const filename = req.params.filename;
  let crosshairCode = filename.replace(/\.png$/, '');

  crosshairCode = crosshairCode.split('/')[0];
  crosshairCode = crosshairCode.replace(/[\\:*?"<>|]/g, '');

  if (!config.patterns.xcodePattern.test(crosshairCode)) {
    return res.status(400).json({ error: 'invalid crosshair code image cache format' });
  }

  const cacheFile = path.join(config.cache.directory, `${crosshairCode}.png`);

  if (fs.existsSync(cacheFile)) {
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600', //1hour
    });
    return res.sendFile(path.resolve(cacheFile));
  }

  try {
    const renderer = new CS2CrosshairRenderer();
    const settings = renderer.parseCode(crosshairCode);
    const canvas = renderer.renderCrosshair(settings, config.crosshair.canvasSize);
    const imageBuffer = canvas.toBuffer('image/png');

    if (!fs.existsSync(config.cache.directory)) {
      fs.mkdirSync(config.cache.directory, { recursive: true });
    }
    fs.writeFileSync(cacheFile, imageBuffer);

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600', //1hour
    });
    res.send(imageBuffer);

  } catch (error) {
    console.error('[error] generating crosshair image:', error);
    res.status(500).json({ error: 'failed to generate image' });
  }
});

const getUsageResponse = () => ({
  status: 'okak',
  service: 'silly cs2 crosshair generator :3c',
  usage: [
    `https://${config.domain}/{crosshair-code}`,
    `https://${config.domain}/{steamid64}`,
    `https://${config.domain}/profiles/{steamid64}`,
    `https://${config.domain}/id/{steamvanity}`,
    `https://${config.domain}/{leetifyvanity}`
  ],
  examples: [
    'CSGO-AJswe-2jNcK-nMpEQ-rHV5J-5JWAB',
    '76561198123456789',
    'profiles/76561198123456789',
    'id/exampleuser',
    'ropz'
  ]
});

app.get('/', (req, res) => getCrosshairHandler(req, res));

app.get('/id', (req, res) => res.json(getUsageResponse()));
app.get('/id/', (req, res) => res.json(getUsageResponse()));
app.get('/id/:username', (req, res) => {
  const username = req.params.username;
  if (!username || username.length > config.crosshair.maxCodeLength || /[<>\"'&]/.test(username)) {
    return res.status(400).json({ error: 'invalid format >:(' });
  }
  // @ts-ignore
  req.params.code = `id/${username}`;
  getCrosshairHandler(req, res);
});

app.get('/profiles', (req, res) => res.json(getUsageResponse()));
app.get('/profiles/', (req, res) => res.json(getUsageResponse()));
app.get('/profiles/:username', (req, res) => {
  const username = req.params.username;
  if (!username || username.length > config.crosshair.maxCodeLength || /[<>\"'&]/.test(username)) {
    return res.status(400).json({ error: 'invalid format >:(' });
  }
  // @ts-ignore
  req.params.code = `profiles/${username}`;
  getCrosshairHandler(req, res);
});

app.get('/c', (req, res) => res.json(getUsageResponse()));
app.get('/c/', (req, res) => res.json(getUsageResponse()));
app.get('/c/id', (req, res) => res.json(getUsageResponse()));
app.get('/c/id/', (req, res) => res.json(getUsageResponse()));
app.get('/c/id/:username', (req, res) => {
  const username = req.params.username;
  if (!username || username.length > config.crosshair.maxCodeLength || /[<>\"'&]/.test(username)) {
    return res.status(400).json({ error: 'invalid format >:(' });
  }
  // @ts-ignore
  req.params.code = `id/${username}`;
  getCrosshairHandler(req, res, true);
});

app.get(/^\/((?!id\/?$|id\/|profiles\/?$|profiles\/|image\/).+)$/, (req, res) => {
  const code = req.params[0];
  if (!code || code.length > config.crosshair.maxCodeLength) {
    return res.status(400).json({ error: 'invalid code parameter >:(' });
  }
  req.params.code = code;
  getCrosshairHandler(req, res);
});

app.use((req, res) => {
  res.status(404).json({
    error: 'not found :p',
    usage: getUsageResponse().usage
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'something went wwong' });
});

// ✅ Railway: bindaj na 0.0.0.0 i koristi env port
const port = process.env.PORT || config.port || 3001;
app.listen(port, '0.0.0.0', () => {
  console.log(`cs2-crosshair running on ${config.host} (${port}) :3c`);
});
