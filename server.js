// Drawer Deck: turns an old iPod/iPhone into a Stream Deck for this Mac.
// No dependencies. Run: node server.js, then open the printed URL in the device's Safari.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ROOT = __dirname;
// Inside the .app bundle the code is read-only; config and icon cache live in DECK_DATA.
const DATA = process.env.DECK_DATA || ROOT;
const ICON_DIR = path.join(DATA, 'icons');
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(path.join(DATA, 'config.json'))) {
  fs.copyFileSync(path.join(ROOT, 'config.example.json'), path.join(DATA, 'config.json'));
}
const config = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT) || config.port || 8787;
// Bumped on every save so the iPod reloads its keys and busts cached icons.
let rev = Date.now();

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err, stdout) => resolve(err ? '' : String(stdout).trim()));
  });
}
const osa = (script) => run('osascript', ['-e', script]);

// ---------- app lookup and icons ----------

const APP_DIRS = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
  path.join(os.homedir(), 'Applications'),
  '/System/Library/CoreServices',
];

function findApp(name) {
  for (const dir of APP_DIRS) {
    const p = path.join(dir, name + '.app');
    // realpath: /Applications/Safari.app is a symlink and its icon gets an alias arrow
    if (fs.existsSync(p)) return fs.realpathSync(p);
  }
  return null;
}

const ICON_JXA = `
ObjC.import("AppKit");
function run(argv) {
  var img = $.NSWorkspace.sharedWorkspace.iconForFile(argv[0]);
  var rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
  var png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  return png.writeToFileAtomically(argv[1], true);
}`;

async function makeIcon(appPath, out) {
  const raw = out + '.raw.png';
  await run('osascript', ['-l', 'JavaScript', '-e', ICON_JXA, appPath, raw]);
  // 114px = 57pt at 2x, the iPod touch 4's retina size
  await run('sips', ['-Z', '114', raw, '--out', out]);
  fs.rmSync(raw, { force: true });
  return fs.existsSync(out);
}

async function buildIcons() {
  fs.mkdirSync(ICON_DIR, { recursive: true });
  await Promise.all(config.keys.map(async (key, i) => {
    const out = path.join(ICON_DIR, i + '.png');
    const appPath = key.app && findApp(key.app);
    key.hasIcon = false;
    if (!appPath) return;
    const stamp = path.join(ICON_DIR, i + '.src');
    if (fs.existsSync(out) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === appPath) {
      key.hasIcon = true;
      return;
    }
    if (await makeIcon(appPath, out)) {
      fs.writeFileSync(stamp, appPath);
      key.hasIcon = true;
    }
  }));
}

// ---------- editor helpers ----------

function listApps() {
  // CoreServices is full of helper agents; Finder is the only one worth a key.
  const names = new Set(['Finder']);
  for (const dir of APP_DIRS.filter((d) => d !== '/System/Library/CoreServices')) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const e of entries) if (e.endsWith('.app') && !e.startsWith('.')) names.add(e.slice(0, -4));
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
}

const appIconJobs = new Map();
function appIcon(name) {
  const out = path.join(DATA, 'appicons', name.replace(/[\/:]/g, '_') + '.png');
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (!appIconJobs.has(out)) {
    const appPath = findApp(name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const job = (appPath ? makeIcon(appPath, out) : Promise.resolve(false))
      .then((ok) => (ok ? out : null))
      .finally(() => appIconJobs.delete(out));
    appIconJobs.set(out, job);
  }
  return appIconJobs.get(out);
}

// Accepts only the three key kinds the deck knows; anything else is dropped.
function cleanKeys(keys) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 12) throw new Error('1-12 tuş olmalı');
  return keys.map((k) => {
    const label = String(k.label || '').trim().slice(0, 24);
    if (k.app) {
      const app = String(k.app);
      if (!findApp(app)) throw new Error('Uygulama bulunamadı: ' + app);
      return { label: label || app, app };
    }
    if (k.url) {
      const url = String(k.url).trim();
      if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Geçersiz adres: ' + url);
      return { label: label || url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], url };
    }
    if (k.shortcut) {
      const shortcut = String(k.shortcut);
      return { label: label || shortcut, shortcut };
    }
    throw new Error('Boş tuş var');
  });
}

async function saveConfig(keys) {
  config.keys = cleanKeys(keys);
  const file = path.join(DATA, 'config.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
  await buildIcons();
  rev = Date.now();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// The editor can change what keys run, so only the Mac itself may use it.
function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

// ---------- key actions ----------

async function pressKey(key) {
  if (key.app) {
    const appPath = findApp(key.app);
    return run('open', appPath ? [appPath] : ['-a', key.app]);
  }
  if (key.url) return run('open', [key.url]);
  if (key.shortcut) return run('shortcuts', ['run', key.shortcut]);
}

// ---------- now playing ----------

const NOW_PLAYING = `
set out to ""
if application "Spotify" is running then
  tell application "Spotify"
    if player state is not stopped then
      set out to "Spotify" & tab & (player state as text) & tab & (name of current track) & tab & (artist of current track) & tab & (artwork url of current track)
    end if
  end tell
end if
if out is "" and application "Music" is running then
  tell application "Music"
    if player state is not stopped then
      set out to "Music" & tab & (player state as text) & tab & (name of current track) & tab & (artist of current track) & tab & ""
    end if
  end tell
end if
return out`;

let lastPlayer = 'Spotify';
let art = { url: '', id: 0, buf: null };

async function nowPlaying() {
  const line = await osa(NOW_PLAYING);
  if (!line) return null;
  const [player, state, title, artist, artUrl] = line.split('\t');
  lastPlayer = player;
  if (artUrl && artUrl !== art.url) {
    art = { url: artUrl, id: art.id + 1, buf: null };
    // Proxy the artwork: the old device can't talk modern TLS to the CDN.
    fetch(artUrl).then((r) => r.arrayBuffer()).then((b) => {
      if (art.url === artUrl) art.buf = Buffer.from(b);
    }).catch(() => {});
  }
  return {
    player, title, artist,
    playing: state === 'playing',
    art: artUrl ? '/art/' + art.id : '',
  };
}

const MEDIA = { playpause: 'playpause', next: 'next track', prev: 'previous track' };

function media(cmd) {
  if (!MEDIA[cmd]) return Promise.resolve();
  return osa(`tell application "${lastPlayer}" to ${MEDIA[cmd]}`);
}

// ---------- network speed ----------

let net = { iface: '', rx: 0, tx: 0, at: 0, down: 0, up: 0 };

async function sampleNet() {
  if (!net.iface) {
    const r = await run('route', ['-n', 'get', 'default']);
    const m = r.match(/interface:\s*(\S+)/);
    if (!m) return;
    net.iface = m[1];
  }
  const out = await run('netstat', ['-ibn', '-I', net.iface]);
  const row = out.split('\n').find((l) => l.includes('<Link#'));
  if (!row) { net.iface = ''; return; }
  const cols = row.trim().split(/\s+/);
  // Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
  const rx = Number(cols[6]);
  const tx = Number(cols[9]);
  const now = Date.now();
  if (net.at) {
    const dt = (now - net.at) / 1000;
    net.down = Math.max(0, (rx - net.rx) / dt);
    net.up = Math.max(0, (tx - net.tx) / dt);
  }
  Object.assign(net, { rx, tx, at: now });
}

// ---------- batteries ----------

async function batteries() {
  const list = [];
  const mac = await run('pmset', ['-g', 'batt']);
  const m = mac.match(/(\d+)%/);
  // "charging" here means plugged in; a full Mac on AC reports "not charging"
  if (m) list.push({ name: 'Mac', pct: Number(m[1]), charging: mac.includes("'AC Power'") });
  // Bluetooth mice, keyboards and trackpads report through IOKit.
  const io = await run('ioreg', ['-r', '-l', '-k', 'BatteryPercent']);
  for (const block of io.split(/\n(?=\+-o )/)) {
    const pct = block.match(/"BatteryPercent" = (\d+)/);
    const name = block.match(/"Product" = "([^"]+)"/);
    if (pct && name) list.push({ name: name[1].replace(/[()]/g, '').replace(/^Magic /, ''), pct: Number(pct[1]), charging: false });
  }
  return list;
}

// ---------- memory ----------

async function memory() {
  const out = await run('memory_pressure', ['-Q']);
  const free = out.match(/free percentage:\s*(\d+)%/);
  if (!free) return null;
  // 1 = normal, 2 = warning, 4 = critical
  const level = Number(await run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'])) || 1;
  return { used: 100 - Number(free[1]), level };
}

const APP_ROOTS = [
  '/Applications/',
  '/System/Applications/',
  '/System/Volumes/Preboot/Cryptexes/App/System/Applications/',
  path.join(os.homedir(), 'Applications') + '/',
];

// Real apps only, each with its helper processes added up.
async function topApps() {
  const out = await run('ps', ['-axo', 'rss=,comm=']);
  const totals = new Map();
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!m || !APP_ROOTS.some((r) => m[2].startsWith(r))) continue;
    const app = m[2].match(/([^/]+)\.app\//);
    if (app) totals.set(app[1], (totals.get(app[1]) || 0) + Number(m[1]));
  }
  return [...totals]
    .map(([name, kb]) => ({ name, mb: Math.round(kb / 1024) }))
    .sort((a, b) => b.mb - a.mb)
    .slice(0, 8);
}

// A normal quit, so apps with unsaved work can still ask. Only running apps are accepted.
async function quitApp(name) {
  if (!(await topApps()).some((a) => a.name === name)) return false;
  const safe = name.replace(/[\\"]/g, '\\$&');
  await osa(`ignoring application responses\ntell application "${safe}" to quit\nend ignoring`);
  return true;
}

// ---------- status cache ----------

let status = { nowPlaying: null, net: { down: 0, up: 0 }, batteries: [], ram: null };
let lastClient = 0;
let lastDevice = null;
const startedAt = Date.now();

async function refreshFast() {
  if (Date.now() - lastClient > 10000) return; // nobody is looking
  await sampleNet();
  status.net = { down: net.down, up: net.up };
  status.nowPlaying = await nowPlaying();
}
async function refreshRam() {
  if (Date.now() - lastClient > 10000) return;
  status.ram = await memory();
}
async function refreshSlow() {
  if (Date.now() - lastClient > 10000) return;
  status.batteries = await batteries();
}

function loop(fn, ms) {
  const tick = () => fn().catch(() => {}).finally(() => setTimeout(tick, ms));
  tick();
}

// ---------- http ----------

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, obj) => send(res, 200, 'application/json; charset=utf-8', JSON.stringify(obj));

// First request per device and path, so odd clients can be debugged without flooding the log.
const seenRequests = new Set();
function logRequest(req, url) {
  if (isLocal(req)) return;
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const id = ip + ' ' + req.method + ' ' + url;
  if (seenRequests.has(id) || seenRequests.size > 500) return;
  seenRequests.add(id);
  console.log(new Date().toISOString(), id, '|', req.headers['user-agent'] || '-');
}

// A web page in any browser on the network can fire requests at this server, so only
// requests from the deck's own pages may act. Old devices may omit Origin on same-site calls.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  logRequest(req, url);
  if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, 'text/plain', 'cross-site request refused');

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(ROOT, 'public', 'index.html')));
  }
  if (req.method === 'GET' && url === '/apple-touch-icon.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' });
    return fs.createReadStream(path.join(ROOT, 'public', 'apple-touch-icon.png')).pipe(res);
  }
  if (req.method === 'GET' && url === '/api/config') {
    return json(res, { rev, keys: config.keys.map((k, i) => ({ label: k.label, icon: k.hasIcon ? '/icon/' + i + '.png?v=' + rev : '' })) });
  }
  if (req.method === 'GET' && url === '/api/status') {
    const wasIdle = Date.now() - lastClient > 10000;
    lastClient = Date.now();
    // the editor's "iPod connected" chip only counts other devices, not the Mac's own preview
    if (!isLocal(req)) lastDevice = { ip: (req.socket.remoteAddress || '').replace(/^::ffff:/, ''), at: lastClient };
    if (wasIdle) { refreshFast().catch(() => {}); refreshSlow().catch(() => {}); refreshRam().catch(() => {}); }
    return json(res, Object.assign({ rev }, status));
  }

  // ---- editor (Mac only) ----
  if (url === '/edit' || url.startsWith('/api/editor/')) {
    // The Host check stops DNS rebinding, where a remote site poses as this server.
    const local = isLocal(req) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '');
    if (!local) return send(res, 403, 'text/plain; charset=utf-8', 'Düzenleme paneli sadece Mac üzerinden açılır.');
    if (req.method === 'GET' && url === '/edit') {
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(ROOT, 'public', 'edit.html')));
    }
    if (req.method === 'GET' && url === '/api/editor/config') {
      return json(res, { keys: config.keys.map(({ hasIcon, ...k }) => k), urls: await deckUrls() });
    }
    if (req.method === 'GET' && url === '/api/editor/status') {
      return json(res, {
        device: lastDevice && { ip: lastDevice.ip, ago: Math.round((Date.now() - lastDevice.at) / 1000) },
        uptime: Math.round((Date.now() - startedAt) / 1000),
        port: PORT,
      });
    }
    if (req.method === 'GET' && url === '/api/editor/apps') return json(res, listApps());
    if (req.method === 'GET' && url === '/api/editor/shortcuts') {
      const out = await run('shortcuts', ['list']);
      return json(res, out ? out.split('\n').filter(Boolean) : []);
    }
    const im = url.match(/^\/api\/editor\/appicon\/(.+)\.png$/);
    if (req.method === 'GET' && im) {
      const file = await appIcon(decodeURIComponent(im[1]));
      if (!file) return send(res, 404, 'text/plain', 'no icon');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'POST' && url === '/api/editor/config') {
      try {
        const body = await readBody(req);
        await saveConfig(body.keys);
        return json(res, { ok: true });
      } catch (e) {
        return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: e.message }));
      }
    }
    if (req.method === 'POST' && url === '/api/editor/test') {
      try { await pressKey(cleanKeys([await readBody(req)])[0]); return json(res, { ok: true }); }
      catch (e) { return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: e.message })); }
    }
  }
  let m = url.match(/^\/icon\/(\d+)\.png$/);
  if (req.method === 'GET' && m) {
    const file = path.join(ICON_DIR, m[1] + '.png');
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain', 'no icon');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'GET' && url.startsWith('/art/')) {
    if (!art.buf) return send(res, 404, 'text/plain', 'no art');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' });
    return res.end(art.buf);
  }
  m = url.match(/^\/api\/key\/(\d+)$/);
  if (req.method === 'POST' && m) {
    const key = config.keys[Number(m[1])];
    if (!key) return send(res, 404, 'text/plain', 'no key');
    await pressKey(key);
    return json(res, { ok: true });
  }
  m = url.match(/^\/api\/media\/(\w+)$/);
  if (req.method === 'POST' && m) {
    await media(m[1]);
    status.nowPlaying = await nowPlaying();
    return json(res, status);
  }
  if (req.method === 'GET' && url === '/api/ram/apps') return json(res, await topApps());
  m = url.match(/^\/api\/ram\/quit\/(.+)$/);
  if (req.method === 'POST' && m) {
    let name = '';
    try { name = decodeURIComponent(m[1]); } catch { return send(res, 400, 'text/plain', 'bad name'); }
    return json(res, { ok: await quitApp(name) });
  }
  send(res, 404, 'text/plain', 'not found');
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// Best address first. VPNs add interfaces and can take over the default route, and a
// device on the Wi-Fi can't reach those, so physical interfaces win.
function rankAddresses(interfaces, defaultIface) {
  const physical = (name) => !/^(utun|tun|tap|ppp|ipsec|bridge|awdl|llw)/.test(name);
  const ipv4 = (name) => (interfaces[name] || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => a.address);
  const names = Object.keys(interfaces);
  const order = [
    ...(physical(defaultIface) ? [defaultIface] : []),
    ...names.filter(physical),
    ...names,
  ];
  return [...new Set(order.flatMap(ipv4))];
}

async function deckUrls() {
  const route = await run('route', ['-n', 'get', 'default']);
  const iface = (route.match(/interface:\s*(\S+)/) || [])[1] || '';
  return rankAddresses(os.networkInterfaces(), iface).map((ip) => 'http://' + ip + ':' + PORT);
}

buildIcons().finally(() => {
  loop(refreshFast, 1500);
  loop(refreshSlow, 30000);
  loop(refreshRam, 4000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Drawer Deck is running. Open this in Safari on the iPod:');
    for (const ip of lanAddresses()) console.log('  http://' + ip + ':' + PORT);
  });
  // Warm the editor's app icon cache one at a time so the panel opens fast later.
  (async () => { for (const name of listApps()) await appIcon(name).catch(() => {}); })();
});
