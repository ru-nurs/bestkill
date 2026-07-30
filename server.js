import dgram from "node:dgram";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "oldera.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://oldera.uz";
const ADMIN_API_URL = process.env.ADMIN_API_URL || process.env.HOSTIN_ADMIN_API_URL || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.HOSTIN_API_TOKEN || "";
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";

const BRAND = {
  name: "OLDERA.UZ",
  domain: "oldera.uz",
  serverName: "Oldera Zombie Server",
  serverAddress: "195.158.4.108:27047"
};

const NAV = [
  ["/store", "Магазин"],
  ["/balance", "Баланс"],
  ["/banlist", "Баны"],
  ["/admins", "Администраторы"],
  ["/users", "Пользователи"],
  ["/rules_public", "Правила"],
  ["/chat", "Чат сервера"],
  ["/stats", "Статистика"],
  ["/demo", "Демо"]
];

const TOP_NAV = [
  ["/", "Главная"],
  ["/store", "Магазин"],
  ["/rules_public", "Правила⌄"]
];

const ONLINE_USERS = [];

const CHAT_MESSAGES = [];

const SERVICES = [
  {
    id: "vip",
    name: "VIP",
    tariffs: [
      ["7 дней", 15000],
      ["30 дней", 45000],
      ["60 дней", 80000]
    ]
  },
  {
    id: "admin",
    name: "Admin",
    tariffs: [
      ["7 дней", 30000],
      ["30 дней", 90000]
    ]
  },
  {
    id: "immunity",
    name: "Иммунитет",
    tariffs: [
      ["7 дней", 20000],
      ["30 дней", 65000],
      ["60 дней", 115000]
    ]
  },
  {
    id: "prefix",
    name: "Префикс",
    tariffs: [
      ["30 дней", 25000],
      ["Навсегда", 120000]
    ]
  },
  {
    id: "skin_snegovik",
    name: "Скин «Snegovik»",
    tariffs: [["30 дней", 35000], ["Навсегда", 150000]]
  },
  {
    id: "skin_neo",
    name: "Скин «Neo»",
    tariffs: [["30 дней", 35000], ["Навсегда", 150000]]
  },
  {
    id: "skin_crysis",
    name: "Скин «Crysis»",
    tariffs: [["30 дней", 35000], ["Навсегда", 150000]]
  },
  {
    id: "skin_scream",
    name: "Скин «Scream»",
    tariffs: [["30 дней", 35000], ["Навсегда", 150000]]
  },
  {
    id: "skin_neco",
    name: "Скин «Neco»",
    tariffs: [["30 дней", 35000], ["Навсегда", 150000]]
  },
  {
    id: "skin_shadow",
    name: "Скин «Shadow»",
    tariffs: [["30 дней", 40000], ["Навсегда", 170000]]
  },
  {
    id: "skin_joker",
    name: "Скин «Joker»",
    tariffs: [["30 дней", 40000], ["Навсегда", 170000]]
  },
  {
    id: "skin_deadpool",
    name: "Скин «Deadpool»",
    tariffs: [["30 дней", 45000], ["Навсегда", 190000]]
  },
  {
    id: "skin_assassin",
    name: "Скин «Assassin»",
    tariffs: [["30 дней", 45000], ["Навсегда", 190000]]
  },
  {
    id: "skin_zombie_hunter",
    name: "Скин «Zombie Hunter»",
    tariffs: [["30 дней", 50000], ["Навсегда", 210000]]
  }
];

const SERVICE_DETAILS = {
  vip: {
    badge: "VIP",
    color: "cyan",
    abilities: ["VIP меню", "Дополнительное здоровье", "Бонусные гранаты", "Приоритет на сервере"]
  },
  admin: {
    badge: "ADM",
    color: "pink",
    abilities: ["Админ меню", "Кик/бан по правилам", "Контроль игроков", "Доступ к командам"]
  },
  immunity: {
    badge: "IMM",
    color: "gold",
    abilities: ["Защита от части наказаний", "Приоритет прав", "Отдельный статус", "Подходит для постоянных игроков"]
  },
  prefix: {
    badge: "TAG",
    color: "green",
    abilities: ["Личный префикс в чате", "Выделение ника", "Красивый стиль", "Работает вместе с VIP/Admin"]
  }
};

const SKIN_IMAGES = {
  skin_snegovik: "/assets/skins/snegovik.webp?v=1",
  skin_neo: "/assets/skins/neo.webp?v=1",
  skin_crysis: "/assets/skins/crysis.webp?v=1",
  skin_scream: "/assets/skins/scream.webp?v=1",
  skin_neco: "/assets/skins/neco.webp?v=1",
  skin_shadow: "/assets/skins/shadow.webp?v=1",
  skin_joker: "/assets/skins/joker.webp?v=1",
  skin_deadpool: "/assets/skins/deadpool.webp?v=1",
  skin_assassin: "/assets/skins/assassin.webp?v=1",
  skin_zombie_hunter: "/assets/skins/zombie-hunter.webp?v=1"
};

for (const service of SERVICES) {
  if (!SERVICE_DETAILS[service.id]) {
    SERVICE_DETAILS[service.id] = {
      badge: "SKIN",
      color: "orange",
      image: SKIN_IMAGES[service.id],
      abilities: ["Модель игрока", "Яркий внешний вид", "Для Zombie сервера", "Выбор срока в магазине"]
    };
  }
}

const ROLE_GROUPS = [
  {
    id: "owner",
    title: "Владелец",
    color: "#ff355d",
    members: []
  },
  {
    id: "head_admin",
    title: "Гл. администратор",
    color: "#ffb02e",
    members: []
  },
  {
    id: "admin",
    title: "Администратор",
    color: "#36d7ff",
    members: []
  },
  {
    id: "moderator",
    title: "Модератор",
    color: "#9b6cff",
    members: []
  },
  {
    id: "elder",
    title: "Староста",
    color: "#63e68a",
    members: []
  },
  {
    id: "vip",
    title: "VIP",
    color: "#f14ea0",
    members: []
  },
  {
    id: "user",
    title: "Пользователь",
    color: "#aab7c8",
    members: []
  }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function html(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

async function staticAsset(res, requestPath) {
  const relative = decodeURIComponent(requestPath.replace(/^\/assets\//, ""));
  const assetsRoot = path.join(PUBLIC_DIR, "assets");
  const assetPath = path.normalize(path.join(assetsRoot, relative));
  if (assetPath !== assetsRoot && !assetPath.startsWith(`${assetsRoot}${path.sep}`)) {
    json(res, 403, { ok: false, message: "Forbidden" });
    return true;
  }

  try {
    const ext = path.extname(assetPath).toLowerCase();
    const contentTypes = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml"
    };
    const body = await readFile(assetPath);
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable"
    });
    res.end(body);
  } catch {
    json(res, 404, { ok: false, message: "Asset not found" });
  }
  return true;
}

async function readDb() {
  try {
    const db = JSON.parse(await readFile(DB_FILE, "utf8"));
    db.users ||= [];
    db.orders ||= [];
    db.tickets ||= [];
    db.topups ||= [];
    db.payments ||= [];
    db.bans ||= [];
    return db;
  } catch {
    return { users: [], orders: [], tickets: [], topups: [], payments: [], bans: [] };
  }
}

async function writeDb(db) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) return JSON.parse(raw || "{}");
  return Object.fromEntries(new URLSearchParams(raw));
}

function splitAddress(address) {
  const [host, port = "27015"] = address.split(":");
  return { host, port: Number(port) };
}

function findService(id) {
  return SERVICES.find((service) => service.id === id);
}

function findTariff(service, tariffName) {
  if (!service) return null;
  const index = Number(tariffName);
  if (Number.isInteger(index) && service.tariffs[index]) return service.tariffs[index];
  return service.tariffs.find(([name]) => name === tariffName);
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} сум`;
}

function publicUrl(pathname) {
  return new URL(pathname, PUBLIC_BASE_URL.endsWith("/") ? PUBLIC_BASE_URL : `${PUBLIC_BASE_URL}/`).toString();
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseJsonEnv(name, fallback = {}) {
  try {
    return process.env[name] ? JSON.parse(process.env[name]) : fallback;
  } catch {
    return fallback;
  }
}

function parseDays(tariffName) {
  const match = String(tariffName || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function renderTemplate(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function createIssueCommand(order) {
  const commands = parseJsonEnv("SERVICE_COMMANDS_JSON", {});
  const template = commands[order.service] || process.env.DEFAULT_SERVICE_COMMAND || "";
  if (!template) return "";
  const target = order.steamId || order.nickname || order.login;
  return renderTemplate(template, {
    target,
    login: order.login,
    nickname: order.nickname,
    steamId: order.steamId,
    service: order.service,
    serviceName: order.serviceName,
    tariff: order.tariffName,
    days: parseDays(order.tariffName),
    price: order.price
  });
}

function createPaymentLink(payment, provider) {
  const normalizedProvider = String(provider || "").toLowerCase();

  if (normalizedProvider === "click" && process.env.CLICK_SERVICE_ID) {
    const url = new URL("https://my.click.uz/services/pay");
    url.searchParams.set("service_id", process.env.CLICK_SERVICE_ID);
    if (process.env.CLICK_MERCHANT_ID) url.searchParams.set("merchant_id", process.env.CLICK_MERCHANT_ID);
    url.searchParams.set("amount", String(payment.amount));
    url.searchParams.set("transaction_param", payment.id);
    url.searchParams.set("return_url", publicUrl("/balance"));
    return url.toString();
  }

  if (normalizedProvider === "payme" && process.env.PAYME_MERCHANT_ID) {
    const payload = `m=${process.env.PAYME_MERCHANT_ID};ac.payment_id=${payment.id};a=${payment.amount * 100}`;
    return `https://checkout.paycom.uz/${Buffer.from(payload).toString("base64")}`;
  }

  return "";
}

function verifyClickSignature(data) {
  if (!process.env.CLICK_SECRET_KEY) return true;
  const expected = createHash("md5")
    .update(`${data.click_trans_id}${data.service_id}${process.env.CLICK_SECRET_KEY}${data.merchant_trans_id}${data.amount}${data.action}${data.sign_time}`)
    .digest("hex");
  return safeEqualText(expected, data.sign_string);
}

async function sendAdminApi(payload) {
  if (!ADMIN_API_URL) return { ok: false, skipped: true, message: "ADMIN_API_URL is not configured" };
  const response = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ADMIN_API_KEY ? { authorization: `Bearer ${ADMIN_API_KEY}`, "x-api-key": ADMIN_API_KEY } : {})
    },
    body: JSON.stringify(payload)
  });
  const responseText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    message: response.ok ? "Admin API accepted request" : `Admin API failed with HTTP ${response.status}`,
    responseText: responseText.slice(0, 2000)
  };
}

async function sendRconCommand(command) {
  const { host, port } = splitAddress(process.env.RCON_HOST ? `${process.env.RCON_HOST}:${process.env.RCON_PORT || 27015}` : BRAND.serverAddress);
  const password = process.env.RCON_PASSWORD || "";
  if (!password || !command) return { ok: false, skipped: true, message: "RCON_PASSWORD or command is not configured" };

  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, message: "RCON timeout" }), 2500);

    socket.once("error", (error) => finish({ ok: false, message: error.message }));
    socket.once("message", (challengePacket) => {
      const challenge = challengePacket.toString("utf8").match(/challenge rcon\s+(-?\d+)/)?.[1];
      if (!challenge) {
        finish({ ok: false, message: "RCON challenge was not returned" });
        return;
      }
      const packet = Buffer.from(`\xff\xff\xff\xffrcon ${challenge} "${password}" ${command}\n`, "binary");
      socket.once("message", (reply) => finish({ ok: true, message: reply.toString("utf8").replace(/^\xff{4}/, "").trim() || "RCON command sent" }));
      socket.send(packet, port, host);
    });
    socket.send(Buffer.from("\xff\xff\xff\xffchallenge rcon\n", "binary"), port, host);
  });
}

async function issueServerEntitlement(order) {
  const command = createIssueCommand(order);
  const payload = {
    action: "issue_service",
    server: BRAND.serverAddress,
    order,
    command
  };

  if (ADMIN_API_URL) return sendAdminApi(payload);
  if (process.env.RCON_PASSWORD) return sendRconCommand(command);
  return { ok: false, skipped: true, message: "Server delivery is waiting for ADMIN_API_URL or RCON settings" };
}

async function issueServerUnban(ban, order) {
  const template = process.env.UNBAN_COMMAND_TEMPLATE || "";
  const command = template ? renderTemplate(template, {
    target: ban.steamId || ban.player || ban.id,
    player: ban.player,
    steamId: ban.steamId,
    banId: ban.id,
    price: order.price
  }) : "";

  if (ADMIN_API_URL) return sendAdminApi({ action: "unban", server: BRAND.serverAddress, ban, order, command });
  if (process.env.RCON_PASSWORD) return sendRconCommand(command);
  return { ok: false, skipped: true, message: "Unban delivery is waiting for ADMIN_API_URL or RCON settings" };
}

function creditPayment(db, payment, note = "payment callback") {
  if (!payment || payment.status === "paid") return null;
  const user = db.users.find((item) => item.login.toLowerCase() === payment.login.toLowerCase());
  if (!user) return null;
  payment.status = "paid";
  payment.paidAt = new Date().toISOString();
  user.balance = Number(user.balance || 0) + Number(payment.amount || 0);
  db.topups.push({ login: user.login, amount: payment.amount, comment: note, paymentId: payment.id, createdAt: payment.paidAt });
  return user;
}

async function getBans(db = null) {
  if (process.env.BAN_API_URL) {
    const response = await fetch(process.env.BAN_API_URL, {
      headers: {
        accept: "application/json",
        ...(process.env.BAN_API_KEY || ADMIN_API_KEY ? { authorization: `Bearer ${process.env.BAN_API_KEY || ADMIN_API_KEY}` } : {})
      }
    });
    if (!response.ok) throw new Error(`Ban API HTTP ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.bans || payload.data || [];
    return items.map(normalizeBan);
  }

  const currentDb = db || await readDb();
  return currentDb.bans.map(normalizeBan).filter((ban) => !ban.bannedUntil || new Date(ban.bannedUntil).getTime() > Date.now());
}

function normalizeBan(item) {
  const bannedAt = item.bannedAt || item.createdAt || new Date().toISOString();
  const bannedUntil = item.bannedUntil || item.expiresAt || item.end || "";
  const remainingMs = bannedUntil ? Math.max(0, new Date(bannedUntil).getTime() - Date.now()) : 0;
  const remainingMinutes = bannedUntil ? Math.ceil(remainingMs / 60000) : null;
  return {
    id: String(item.id || item.banId || randomUUID()),
    player: item.player || item.nickname || item.name || "Unknown",
    steamId: item.steamId || item.authid || item.authId || "",
    reason: item.reason || "No reason",
    duration: item.duration || item.length || (bannedUntil ? "temporary" : "permanent"),
    bannedAt,
    bannedUntil,
    remaining: remainingMinutes === null ? "permanent" : `${remainingMinutes} min`,
    admin: item.admin || ""
  };
}

async function queryServerInfo(address) {
  const { host, port } = splitAddress(address);
  const request = Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
    Buffer.from("Source Engine Query\0", "binary")
  ]);

  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, 1400);

    socket.once("message", (message) => {
      clearTimeout(timer);
      socket.close();
      try {
        resolve(parseA2sInfo(message));
      } catch {
        resolve(null);
      }
    });

    socket.once("error", () => {
      clearTimeout(timer);
      socket.close();
      resolve(null);
    });

    socket.send(request, port, host);
  });
}

function readCString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0x00) end += 1;
  return [buffer.toString("utf8", offset, end), end + 1];
}

function parseA2sInfo(buffer) {
  if (buffer.length < 6 || buffer.readInt32LE(0) !== -1) return null;
  const header = buffer[4];

  if (header === 0x49) {
    let offset = 6;
    let name; [name, offset] = readCString(buffer, offset);
    let map; [map, offset] = readCString(buffer, offset);
    let folder; [folder, offset] = readCString(buffer, offset);
    let game; [game, offset] = readCString(buffer, offset);
    offset += 2;
    const players = buffer[offset++];
    const maxPlayers = buffer[offset++];
    return { name, map, folder, game, players, maxPlayers, online: true };
  }

  if (header === 0x6d) {
    let offset = 5;
    let address; [address, offset] = readCString(buffer, offset);
    let name; [name, offset] = readCString(buffer, offset);
    let map; [map, offset] = readCString(buffer, offset);
    let folder; [folder, offset] = readCString(buffer, offset);
    let game; [game, offset] = readCString(buffer, offset);
    const players = buffer[offset + 2] || 0;
    const maxPlayers = buffer[offset + 3] || 32;
    return { address, name, map, folder, game, players, maxPlayers, online: true };
  }

  return null;
}

async function serverStatus() {
  const live = await queryServerInfo(BRAND.serverAddress);
  return {
    name: BRAND.serverName,
    address: BRAND.serverAddress,
    map: live?.map || "Не определено",
    players: Number.isFinite(live?.players) ? live.players : 0,
    maxPlayers: Number.isFinite(live?.maxPlayers) ? live.maxPlayers : 32,
    online: Boolean(live?.online),
    checkedAt: new Date().toISOString()
  };
}

function pageShell({ title, pathName = "/", content }) {
  const active = (href) => (href === pathName || (href !== "/" && pathName.startsWith(href)) ? "active" : "");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(BRAND.name)} - ${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(BRAND.name)} - игровой проект Counter-Strike 1.6">
  <style>${styles()}</style>
</head>
<body>
  <header class="topbar">
    <nav class="nav">${TOP_NAV.map(([href, label]) => `<a class="${active(href)}" href="${href}">${label}</a>`).join("")}</nav>
    <button class="user-mini" data-modal="login">Войти на сайт</button>
  </header>
  <div class="crumb">Главная страница${pathName === "/" ? "" : " / " + escapeHtml(title)}</div>
  <main class="layout">
    <aside class="sidebar">
      <a class="logo" href="/" aria-label="${escapeHtml(BRAND.name)}">
        <img src="/assets/oldera-logo.png?v=2" alt="${escapeHtml(BRAND.name)}">
      </a>
      <div class="side-actions">
        <a href="/news" class="side-btn">★ Подписка</a>
        <a href="/clans" class="side-btn">♣ Кланы</a>
        <a href="/giveaway" class="side-btn accent">▣ Розыгрыш</a>
        <a href="steam://connect/${BRAND.serverAddress}" class="side-btn">⇣ Скачать CS 1.6 от Проекта</a>
      </div>
      ${sidebarAuthHtml()}
      ${onlineUsersHtml()}
      ${topUsersHtml()}
      <section class="panel">
        <h3>Навигация</h3>
        ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}
      </section>
    </aside>
    <section class="main">${content}</section>
  </main>
  ${modals()}
  <footer class="footer">
    <div>
      <a class="footer-logo" href="/">${escapeHtml(BRAND.name)}</a>
      <p>Рады видеть вас на игровом проекте ${escapeHtml(BRAND.name)}. Здесь будет чистое пространство для ваших серверов, правил, магазина и сообщества.</p>
    </div>
    <div>
      <strong>Навигация</strong>
      <a href="/">Главная страница</a>
      <a href="/store">Магазин услуг</a>
      <a href="/forum">Форум</a>
      <a href="/support">Поддержка</a>
    </div>
    <div>
      <strong>Проект</strong>
      <a href="/users">Пользователи</a>
      <a href="/admins">Администраторы</a>
      <a href="/banlist">Список банов</a>
      <a href="/stats">Игровая статистика</a>
    </div>
    <div>
      <strong>Полезные ссылки</strong>
      <a href="/processing-of-personal-data">Об обработке персональных данных</a>
      <a href="/privacy-policy">Политика конфиденциальности</a>
      <a href="/rules_public">Правила проекта</a>
    </div>
  </footer>
  <script>${clientScript()}</script>
</body>
</html>`;
}

function sidebarAuthHtml() {
  return `<section class="panel auth-panel">
    <h3>Авторизация</h3>
    <button class="auth-button auth-red" data-modal="login">Войти на сайт</button>
    <button class="auth-button auth-vk" data-modal="login">VK Войти через VK</button>
    <button class="auth-button auth-outline" data-modal="register">Зарегистрироваться</button>
  </section>`;
}

function avatarLetter(name) {
  return escapeHtml(String(name || "?").trim().slice(0, 1).toUpperCase());
}

function onlineUsersHtml() {
  return `<section class="panel online-panel">
    <h3>Сейчас онлайн <span>${ONLINE_USERS.length}</span></h3>
    <div class="online-list">
      ${ONLINE_USERS.length ? ONLINE_USERS.map((user) => `<article class="online-user" style="--user-color:${user.color}">
        <div class="avatar">${avatarLetter(user.nick)}</div>
        <div><b>${escapeHtml(user.nick)}</b><small>${escapeHtml(user.role)}</small></div>
      </article>`).join("") : `<p class="empty">Пока никого нет.</p>`}
    </div>
  </section>`;
}

function topUsersHtml() {
  return `<section class="panel top-users">
    <h3>Топ пользователей</h3>
    <div class="top-list"><p class="empty">Пока никого нет.</p></div>
  </section>`;
}

function serverTable() {
  return `<section class="panel monitor">
    <div class="panel-head">
      <h2>Мониторинг сервера</h2>
      <button class="icon-btn" id="refresh-status" title="Обновить">↻</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Название сервера</th>
            <th>Карта</th>
            <th>Игроков</th>
            <th>IP-адрес</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody id="servers">
          <tr>
            <td>${escapeHtml(BRAND.serverName)}</td>
            <td id="server-map">Загрузка...</td>
            <td><span class="meter"><i id="server-fill" style="width:0%"></i><b id="server-players">0/32</b></span></td>
            <td class="ip">${escapeHtml(BRAND.serverAddress)}</td>
            <td class="actions">
              <a class="small-btn green" href="steam://connect/${BRAND.serverAddress}" title="Подключиться">♟</a>
              <a class="small-btn red" href="/banlist" title="Баны">⊘</a>
              <a class="small-btn gold" href="/admins" title="Администраторы">☑</a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="total"><i id="total-fill" style="width:0%"></i><span id="server-total">0/32</span></div>
  </section>`;
}

function homePage() {
  return pageShell({
    title: "Главная страница",
    pathName: "/",
    content: `${serverTable()}
      ${homePromoHtml({
        type: "store",
        title: "Магазин - продажа услуг в онлайн режиме.",
        text: `В магазине можно выбрать привилегию или модель и оформить её для сервера ${BRAND.serverName}.`,
        href: "/store"
      })}
      ${homeChatHtml()}
      ${homePromoHtml({
        type: "unban",
        title: "Забанили, но Вы считаете себя невиновным?",
        text: "Проверьте активные блокировки и отправьте обращение администрации проекта.",
        href: "/banlist"
      })}
      ${homePromoHtml({
        type: "support",
        title: "Есть вопрос? Обратитесь к администрации.",
        text: "Откройте тикет в разделе поддержки и получите ответ администрации OLDERA.UZ.",
        href: "/support"
      })}
      <section class="panel home-news">
        <h2>Новости проекта</h2>
        <p class="empty">Новостей пока нет. Первые объявления ${escapeHtml(BRAND.name)} появятся здесь.</p>
      </section>`
  });
}

function homePromoHtml({ type, title, text, href }) {
  return `<section class="home-promo ${type}">
    <div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      <a href="${escapeHtml(href)}">Подробнее</a>
    </div>
  </section>`;
}

function homeChatHtml() {
  return `<section class="panel chat-panel home-chat">
    <h2>Чат</h2>
    <div class="chat-list"><p class="empty">Сообщений пока нет.</p></div>
    <p class="chat-login"><a href="#" data-modal="login">Авторизуйтесь</a>, чтобы отправлять сообщения</p>
  </section>`;
}

function storePage() {
  const initialService = SERVICES[0];
  const initialDetail = SERVICE_DETAILS[initialService.id];
  const initialImage = initialDetail.image || "/assets/shop-service.png?v=2";
  return pageShell({
    title: "Магазин",
    pathName: "/store",
    content: `${serverTable()}
      <section class="panel store purchase-panel">
        <h2>Покупка привилегий</h2>
        <div class="purchase-layout">
          <form id="order-form" class="purchase-form">
            <label>Выберите сервер
              <select name="server"><option value="${BRAND.serverAddress}">${escapeHtml(BRAND.serverName)}</option></select>
            </label>
            <label>Выберите услугу
              <select name="service" id="service-select">${SERVICES.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select>
            </label>
            <label>Выберите тариф
              <select name="tariff" id="tariff-select"></select>
            </label>
            <label>Выберите тип привязки
              <select name="bindType"><option>Ник + пароль</option><option>STEAM ID</option><option>STEAM ID + пароль</option></select>
            </label>
            <div class="buyer-fields">
              <label>Логин на сайте<input name="login" maxlength="30" placeholder="Ваш логин"></label>
              <label>Ник игрока<input name="nickname" maxlength="32" placeholder="Введите ник"></label>
              <label>STEAM ID<input name="steamId" maxlength="40" placeholder="STEAM_0:0:000000"></label>
            </div>
            <label class="check-row"><input type="checkbox" required checked> <span>Я принимаю условия оферты и правила проекта</span></label>
            <button class="primary purchase-submit" type="submit">Оформить услугу</button>
            <div id="order-result" class="result"></div>
          </form>
          <article class="service-info" id="service-info">
            <h3>Информация об услуге</h3>
            <div class="service-info-media">
              <img id="service-info-image" src="${escapeHtml(initialImage)}" alt="${escapeHtml(initialService.name)}">
              <span id="service-info-badge">${escapeHtml(initialDetail.badge)}</span>
            </div>
            <div class="service-info-body">
              <h4 id="service-info-title">${escapeHtml(initialService.name)}</h4>
              <strong id="service-info-price">${initialService.tariffs[0][1].toLocaleString("ru-RU")} сум</strong>
              <ul id="service-info-abilities">${initialDetail.abilities.map((ability) => `<li>${escapeHtml(ability)}</li>`).join("")}</ul>
              <small>Сервер: ${escapeHtml(BRAND.serverAddress)}</small>
            </div>
          </article>
        </div>
      </section>`
  });
}

function serviceCard(service) {
  const detail = SERVICE_DETAILS[service.id];
  const minPrice = Math.min(...service.tariffs.map(([, price]) => price));
  const image = detail.image || "/assets/shop-service.png?v=2";
  return `<article class="service-card ${detail.color}">
    <div class="service-preview">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(service.name)}" loading="lazy">
      <span>${escapeHtml(detail.badge)}</span>
    </div>
    <div class="service-body">
      <h3>${escapeHtml(service.name)}</h3>
      <strong>от ${minPrice.toLocaleString("ru-RU")} сум</strong>
      <ul>${detail.abilities.map((ability) => `<li>${escapeHtml(ability)}</li>`).join("")}</ul>
    </div>
  </article>`;
}

function roleGroupsHtml({ compact = false } = {}) {
  const groups = compact ? ROLE_GROUPS.slice(0, 5) : ROLE_GROUPS;
  return `<div class="role-grid ${compact ? "compact" : ""}">
    ${groups.map((group) => `<article class="role-card" style="--role:${group.color}">
      <div class="role-title">
        <span></span>
        <strong>${escapeHtml(group.title)}</strong>
      </div>
      <div class="role-members">
        ${group.members.map((member) => `<div class="role-member">
          <b>${escapeHtml(member.nick)}</b>
          <small>${escapeHtml(member.note)}</small>
        </div>`).join("") || `<p class="empty">Список пуст.</p>`}
      </div>
    </article>`).join("")}
  </div>`;
}

function recentOperationsHtml() {
  const rows = [
    ["#1048", "Покупка услуги", "Zombie VIP", "1 месяц", "Завершено"],
    ["#1047", "Пополнение баланса", "Игрок", "25 000 сум", "Завершено"],
    ["#1046", "Покупка услуги", "Иммунитет", "30 дней", "Завершено"],
    ["#1045", "Разбан", "STEAM / Nick", "Разовый", "Ожидает"]
  ];
  return `<section class="panel operations-panel">
    <div class="panel-head">
      <h2>Последние операции</h2>
      <span class="status-pill">old era payments</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Тип</th><th>Услуга</th><th>Тариф</th><th>Статус</th></tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function supportBannerHtml() {
  return `<section class="support-banner">
    <div>
      <h2>Есть вопрос? Обратитесь к администрации.</h2>
      <p>Если у Вас имеются вопросы, Вы можете открыть тикет в разделе поддержки и своевременно получить ответ администрации на него.</p>
      <a href="/support">Подробнее</a>
    </div>
  </section>`;
}

function balancePage() {
  return pageShell({
    title: "Баланс",
    pathName: "/balance",
    content: `${serverTable()}
      <section class="panel two-col balance-panel">
        <div>
          <h2>Баланс игрока</h2>
          <p class="note">Игрок может проверить внутренний баланс по логину. Пополнение через платежку подключается отдельно.</p>
          <form id="balance-check-form" class="stack-form">
            <input name="login" maxlength="30" placeholder="Логин на сайте">
            <button class="primary" type="submit">Проверить баланс</button>
            <div id="balance-result" class="result"></div>
          </form>
          <form id="payment-form" class="stack-form pay-form">
            <input name="login" maxlength="30" placeholder="Логин для пополнения">
            <input name="amount" type="number" min="1000" step="1000" placeholder="Сумма, сум">
            <select name="provider">
              <option value="click">Click</option>
              <option value="payme">Payme</option>
            </select>
            <button class="primary" type="submit">Создать платеж</button>
            <div id="payment-result" class="result"></div>
          </form>
        </div>
        <div>
          <h2>Ручное пополнение</h2>
          <p class="note">Если человек оплатил вручную, админ может зачислить сумму на профиль. Для безопасности нужен ADMIN_PIN в Render Environment.</p>
          <form id="topup-form" class="stack-form">
            <input name="pin" type="password" placeholder="Admin PIN">
            <input name="login" maxlength="30" placeholder="Логин игрока">
            <input name="amount" type="number" min="1000" step="1000" placeholder="Сумма, сум">
            <textarea name="comment" placeholder="Комментарий"></textarea>
            <button class="primary" type="submit">Пополнить баланс</button>
            <div id="topup-result" class="result"></div>
          </form>
        </div>
      </section>`
  });
}

function simplePage(title, pathName, body) {
  return pageShell({ title, pathName, content: `${serverTable()}<section class="panel">${body}</section>` });
}

function adminsPage() {
  const rows = ROLE_GROUPS.flatMap((group) => group.members.map((member) => ({ group, member })));
  return simplePage("Администраторы", "/admins", `<h2>Администрация проекта</h2>
    <p class="note">Список администрации пока пуст.</p>
    ${roleGroupsHtml()}
    <table class="role-table"><thead><tr><th>#</th><th>Пользователь</th><th>Группа</th><th>Статус</th></tr></thead>
    <tbody>${rows.length ? rows.map((item, index) => `<tr><td>${index + 1}</td><td><b style="color:${item.group.color}">${escapeHtml(item.member.nick)}</b></td><td>${escapeHtml(item.group.title)}</td><td>${escapeHtml(item.member.note)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-cell">Пользователей пока нет.</td></tr>`}</tbody></table>`);
}

function usersPage() {
  return simplePage("Пользователи", "/users", `<h2>Пользователи проекта</h2>
    <p class="note">Пользователей пока нет. Новые аккаунты появятся после регистрации.</p>
    ${roleGroupsHtml()}`);
}

function ruleSection(title, tone, items) {
  return `<section class="rule-section ${tone}">
    <h2>${escapeHtml(title)}</h2>
    <div class="rule-list">
      ${items.map(([number, heading, text, punishment]) => `<article class="rule-row">
        <b>${escapeHtml(number)}</b>
        <div>
          <h3>${escapeHtml(heading)}</h3>
          <p>${escapeHtml(text)}</p>
          ${punishment ? `<small><strong>Наказание:</strong> ${escapeHtml(punishment)}</small>` : ""}
        </div>
      </article>`).join("")}
    </div>
  </section>`;
}

function rulesPage() {
  const commonRules = [
    ["1.1", "Микрофон 16+", "Не создавайте шум, эхо и помехи. Музыка и изменение голоса без согласия игроков запрещены.", "предупреждение, mute или kick."],
    ["1.2", "Только честная игра", "Запрещены читы, скрипты, макросы, DRUN, SGS, сторонние модели и любые средства, дающие игровое преимущество.", "бан от 7 дней до постоянного."],
    ["1.3", "Уважение к игрокам", "Запрещены оскорбления, угрозы, дискриминация, провокации и обсуждение родственников.", "предупреждение, mute или бан до 1 дня."],
    ["1.4", "Без рекламы", "Запрещена реклама других серверов, сайтов, Telegram-каналов и услуг без разрешения владельца проекта.", "постоянный бан."],
    ["1.5", "Не мешайте игре", "Запрещено намеренно блокировать игроков, использовать баги карты, срывать раунд или делать reconnect для ухода от наказания.", "kick или бан от 30 минут."],
    ["1.6", "Корректный ник", "Ник не должен содержать рекламу, оскорбления, запрещённые символы или копировать ник администратора.", "просьба сменить ник, затем kick."]
  ];
  const vipRules = [
    ["2.1", "Общие правила действуют для всех", "VIP, иммунитет и другие платные возможности не освобождают от правил сервера.", "ограничение иммунитета или обычное наказание."],
    ["2.2", "Не передавайте доступ", "Запрещено передавать пароль, Steam ID или платную услугу другому человеку.", "блокировка услуги без компенсации."],
    ["2.3", "Не злоупотребляйте привилегиями", "Нельзя использовать VIP-меню, бонусы, модели или иммунитет для помех игрокам и обхода решений администрации.", "ограничение иммунитета от 1 до 7 дней."],
    ["2.4", "Не вмешивайтесь в работу администрации", "VIP-игрок не может требовать наказания другого игрока или мешать проверке. Жалоба подаётся через поддержку.", "предупреждение или ограничение услуги."],
    ["2.5", "Повторные нарушения", "При систематических нарушениях платная услуга может быть приостановлена или удалена.", "ограничение или снятие услуги."]
  ];
  const adminRules = [
    ["3.1", "Соблюдайте порядок наказаний", "Если ситуация не требует немедленного бана, используйте последовательность: предупреждение, mute, slay, kick, ban.", "замечание или снятие доступа."],
    ["3.2", "Собирайте доказательства", "Перед баном за читы администратор обязан записать demo или сохранить другое проверяемое доказательство.", "отмена бана и замечание администратору."],
    ["3.3", "Указывайте точную причину", "Срок и причина наказания должны соответствовать нарушению. Причины вроде «просто так» запрещены.", "предупреждение или ограничение прав."],
    ["3.4", "Не используйте права в личных целях", "Запрещено выдавать предметы, менять карту, кикать и банить ради мести, шутки или преимущества.", "снятие административной услуги."],
    ["3.5", "Не передавайте админ-доступ", "Логин, пароль и Steam ID администратора принадлежат только владельцу услуги.", "немедленная блокировка доступа."],
    ["3.6", "Рассматривайте жалобы спокойно", "Администратор обязан отвечать по существу и выполнять решение главного администратора или владельца.", "замечание или понижение."],
    ["3.7", "Администратор тоже игрок", "Все основные правила и правила платных услуг полностью распространяются на администрацию.", "наказание по общим правилам и снятие прав."]
  ];
  const requiredRules = [
    ["4.1", "Ознакомление обязательно", "Заказывая услугу или заходя на сервер, пользователь подтверждает, что прочитал и принимает действующие правила.", ""],
    ["4.2", "Незнание не освобождает", "Отсутствие ознакомления с правилами не отменяет ответственность за нарушение.", ""],
    ["4.3", "Проверяйте данные заказа", "Автовыдача выполняется на указанный ник или Steam ID. Ошибочные данные необходимо сразу сообщить поддержке.", ""],
    ["4.4", "Правила могут обновляться", `Администрация ${BRAND.name} публикует изменения на этой странице. Новая редакция действует после публикации.`, ""]
  ];

  return pageShell({
    title: "Правила",
    pathName: "/rules_public",
    content: `${serverTable()}<section class="rules-page">
      <header class="rules-hero">
        <h1>Правила проекта ${escapeHtml(BRAND.name)}</h1>
        <p>Обязательны к ознакомлению для всех игроков</p>
      </header>
      <h2 class="rules-server-title">Правила сервера ${escapeHtml(BRAND.serverName)}</h2>
      ${ruleSection("Правила для игроков", "basic", commonRules)}
      ${ruleSection("Правила для VIP-игроков", "vip", vipRules)}
      ${ruleSection("Правила для администрации", "admin", adminRules)}
      ${ruleSection("Для пользователей услуг навсегда", "required", requiredRules)}
    </section>`
  });
}

function supportPage() {
  return simplePage("Поддержка", "/support", `<h2>Поддержка</h2>
    <form id="ticket-form" class="form-grid">
      <label>Ваш ник<input name="name" required placeholder="Ник"></label>
      <label>Email<input name="email" type="email" required placeholder="email@example.com"></label>
      <label class="wide">Сообщение<textarea name="message" required placeholder="Опишите вопрос"></textarea></label>
      <button class="primary" type="submit">Отправить</button>
      <div id="ticket-result" class="result"></div>
    </form>`);
}

function chatPage() {
  return pageShell({
    title: "Чат сервера",
    pathName: "/chat",
    content: `<section class="panel chat-panel">
      <h2>Чат</h2>
      <div class="chat-list">
        ${CHAT_MESSAGES.length ? CHAT_MESSAGES.map((message, index) => `<article class="chat-message ${index === 0 ? "pinned" : ""}" style="--chat-color:${message.color}">
          <div class="avatar">${avatarLetter(message.nick)}</div>
          <div class="chat-body">
            <b>${escapeHtml(message.nick)}</b>
            <p>${escapeHtml(message.text)}</p>
          </div>
          <time>${escapeHtml(message.time)}<span>Сегодня</span></time>
        </article>`).join("") : `<p class="empty">Сообщений пока нет.</p>`}
      </div>
      <p class="chat-login"><a href="#" data-modal="login">Авторизуйтесь</a>, чтобы отправлять сообщения</p>
    </section>`
  });
}

function modals() {
  return `<div class="modal" id="login-modal" aria-hidden="true">
    <div class="dialog">
      <button class="close" data-close>×</button>
      <h2>Авторизация</h2>
      <form id="login-form">
        <input name="login" maxlength="30" placeholder="Логин">
        <input name="password" type="password" maxlength="30" placeholder="Пароль">
        <button class="primary" type="submit">Войти</button>
        <div id="login-result" class="result"></div>
        <a href="#" data-modal="register">Регистрация</a>
      </form>
    </div>
  </div>
  <div class="modal" id="register-modal" aria-hidden="true">
    <div class="dialog">
      <button class="close" data-close>×</button>
      <h2>Регистрация</h2>
      <form id="register-form">
        <input name="login" maxlength="30" placeholder="Логин">
        <input name="password" type="password" maxlength="30" placeholder="Пароль">
        <input name="password2" type="password" maxlength="30" placeholder="Повторите пароль">
        <input name="email" type="email" maxlength="255" placeholder="E-mail">
        <p class="policy">Регистрируясь, вы соглашаетесь на обработку персональных данных.</p>
        <button class="primary" type="submit">Зарегистрироваться</button>
        <div id="register-result" class="result"></div>
      </form>
    </div>
  </div>`;
}

function styles() {
  return `
:root{color-scheme:dark;--bg:#10151f;--panel:#121b27e8;--panel2:#0d1521;--line:#273444;--text:#dce7f5;--muted:#8d9bb0;--cyan:#42e4d3;--pink:#f4469b;--orange:#f08b35;--red:#8e1e30;--green:#27984c;--gold:#b99a34}
*{box-sizing:border-box}body{margin:0;background:#0b1019;color:var(--text);font-family:Arial,Helvetica,sans-serif;min-height:100vh;background-image:radial-gradient(circle at 50% 0,#2a3547 0,#111827 38%,#090d14 100%)}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}
.topbar{height:56px;background:#24232d;display:flex;justify-content:center;align-items:center;position:sticky;top:0;z-index:5;border-bottom:1px solid #343443}.nav{display:flex;gap:4px;height:100%}.nav a{display:flex;align-items:center;padding:0 20px;color:#bac4d4;font-weight:700;font-size:13px;text-transform:uppercase}.nav a.active,.nav a:hover{background:linear-gradient(135deg,#25b9dc,#f1549a);color:white;border-radius:0 0 8px 8px}.user-mini{position:absolute;right:28px;background:transparent;border:0;color:#c9d5e5;cursor:pointer}.crumb{max-width:1180px;margin:0 auto;padding:14px 18px;background:#303641;color:#aab4c4;font-size:13px}
.layout{max-width:1180px;margin:24px auto 40px;display:grid;grid-template-columns:270px 1fr;gap:24px;padding:0 18px}.sidebar{display:flex;flex-direction:column;gap:14px}.logo{min-height:118px;display:flex;align-items:center;justify-content:center;gap:12px}.logo-mark{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#8ee6ff;color:#0e1724;font-weight:900;box-shadow:0 0 30px #36d8ff}.logo strong{font-size:34px;color:white;text-shadow:0 0 10px #38d4ff,2px 2px #b52236}.side-actions{display:grid;gap:10px}.side-btn{background:#111d2c;border:1px solid #23344b;color:#d9e7f4;padding:12px 16px;border-radius:7px;text-align:center;font-weight:700}.side-btn:hover{border-color:var(--cyan)}.side-btn.accent{background:linear-gradient(135deg,#e947a2,#f58d30);color:white}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:22px;box-shadow:0 18px 45px #0008}.panel h2,.panel h3{margin:0 0 16px}.panel a{display:block;color:#aebbd0;padding:8px 0;border-bottom:1px solid #223043}.panel small{display:block;color:var(--muted);margin-top:4px}.main{display:grid;gap:24px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.icon-btn{background:#182336;border:1px solid #33465f;color:#dbe8f8;border-radius:7px;padding:7px 11px;cursor:pointer}
.table-wrap{overflow:auto;border-radius:8px;border:1px solid #2d3b4e}table{width:100%;border-collapse:collapse;background:#0d1521}th,td{border-bottom:1px solid #293648;border-right:1px solid #293648;padding:12px 14px;text-align:left;font-size:14px}th{color:#c4cee0;background:#111a27}.ip{color:#eaf4ff;font-weight:800}.meter{position:relative;display:block;min-width:86px;height:30px;background:#761927;border:1px solid #b53b52;border-radius:4px;overflow:hidden;text-align:center}.meter i,.total i{display:block;height:100%;background:repeating-linear-gradient(45deg,var(--cyan),var(--cyan) 4px,#62f0e1 4px,#62f0e1 8px)}.meter b{position:absolute;inset:0;display:grid;place-items:center;font-weight:500}.actions{white-space:nowrap}.small-btn{display:inline-grid!important;place-items:center;width:34px;height:28px;margin-right:6px;border-radius:4px;border:1px solid #ffffff30}.green{background:#176b35}.red{background:#7d1c2d}.gold{background:#a88929}.total{height:32px;position:relative;background:#7d1b2b;border:1px solid #bf3a51;border-radius:5px;overflow:hidden;margin-top:10px;text-align:center}.total span{position:absolute;inset:0;display:grid;place-items:center}
.empty-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.player-card{min-height:132px;border:1px solid #2b3b50;border-radius:8px;background:#0e1825;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.player-card span{color:#ffce48}.player-card b{margin:10px 0}.player-card small,.empty,.note,.policy{color:var(--muted);line-height:1.5}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}.status-pill{color:#9decc5;background:#143525;border:1px solid #26754f;border-radius:999px;padding:6px 10px;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid label{display:grid;gap:7px;color:#cbd7e7}.form-grid .wide{grid-column:1/-1}.stack-form{display:grid;gap:12px}.service-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:18px 0 24px}.service-card{display:grid;grid-template-columns:70px 1fr;gap:14px;align-items:start;background:#0c1624;border:1px solid #2f4056;border-radius:8px;padding:14px;position:relative;overflow:hidden}.service-card:before{content:"";position:absolute;inset:0;opacity:.16;background:linear-gradient(135deg,#2de2e6,#f84aa7,#ffb000);pointer-events:none}.service-card h3{margin:0 0 6px}.service-card strong{display:block;color:#fff;margin-bottom:8px}.service-card ul{margin:0;padding-left:18px;color:#b9c7d9;font-size:13px;line-height:1.55}.service-art{width:64px;height:64px;border-radius:8px;display:grid;place-items:center;background:#152033;border:1px solid #ffffff24;box-shadow:0 0 22px #000 inset}.service-art span{font-weight:900;font-size:13px;letter-spacing:.04em}.service-card.cyan .service-art{color:#55fff1;box-shadow:0 0 28px #26d6d0}.service-card.pink .service-art{color:#ff69ba;box-shadow:0 0 28px #f4469b}.service-card.gold .service-art{color:#ffe06c;box-shadow:0 0 28px #d6a72a}.service-card.green .service-art{color:#8dffa9;box-shadow:0 0 28px #27b05b}.service-card.orange .service-art{color:#ffb269;box-shadow:0 0 28px #f08b35}.balance-panel h2{margin-bottom:8px}input,select,textarea{width:100%;background:#0b1320;color:var(--text);border:1px solid #2d3d52;border-radius:6px;padding:12px}textarea{min-height:120px;resize:vertical}.primary{border:0;border-radius:7px;background:linear-gradient(135deg,#28c2e8,#f04c9c);color:white;padding:12px 18px;font-weight:800;cursor:pointer}.result{align-self:center}.success{color:#7df0a6}.error{color:#ff8998}.empty-cell{text-align:center;color:var(--muted)}.rules{line-height:1.9}
.modal{position:fixed;inset:0;background:#0009;display:none;align-items:center;justify-content:center;z-index:20;padding:20px}.modal.show{display:flex}.dialog{width:min(420px,100%);background:#111a27;border:1px solid #34445a;border-radius:10px;padding:24px;position:relative}.dialog form{display:grid;gap:12px}.close{position:absolute;right:14px;top:10px;background:transparent;border:0;color:white;font-size:28px;cursor:pointer}
.pay-form{margin-top:18px;padding-top:18px;border-top:1px solid #273444}.pay-link{display:inline-block!important;margin-top:8px;color:#7df0ff!important;border-bottom:0!important}.inline-action{border:0;border-radius:5px;background:#b99a34;color:white;padding:8px 10px;font-weight:800;cursor:pointer}
.topbar{background:#202028cc;backdrop-filter:blur(10px);border-bottom:1px solid #353441;box-shadow:0 8px 28px #0008}.nav a{color:#c7ceda}.nav a.active,.nav a:hover{background:linear-gradient(135deg,#39b9df,#8b5fd8 52%,#e85854);border-radius:0 0 7px 7px}.user-mini{right:22px;border:1px solid #4a5262;border-radius:6px;padding:8px 14px;background:#141a24;color:#fff}
body{background:#080d14 url('/assets/oldera-bg.png') center top/cover fixed no-repeat;color:#d8e2ee}body:before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(90deg,#07101de8,#0b1323b8 35%,#0b1323bf 65%,#070b12f2),linear-gradient(180deg,#0008,#07101dcc 55%,#070a10);pointer-events:none}.crumb{background:#2d333dd9;border:1px solid #3a4350;border-radius:2px;color:#9ca7b8;margin-top:0}.layout{max-width:1180px;margin-top:18px;grid-template-columns:260px minmax(0,1fr);gap:20px}.main{gap:18px}
.logo{min-height:148px;align-items:end;justify-content:flex-start;padding:18px 6px}.logo-mark{width:58px;height:58px;border-radius:8px;background:linear-gradient(135deg,#84f0ff,#e52f42);color:#08111d;box-shadow:0 0 26px #35e2ff99}.logo strong{font-size:34px;line-height:1;color:#fff;text-shadow:0 0 10px #51eaff,2px 2px 0 #cc1e32}.side-btn{background:#101928e6;border-color:#243348;border-radius:5px;text-align:left;color:#cbd7e8}.side-btn:hover{border-color:#42e4d3;color:#fff}.side-btn.accent{background:linear-gradient(90deg,#e43c93,#ef8231)}
.panel{background:#101925eb;border:1px solid #243245;border-radius:7px;box-shadow:0 14px 38px #0009}.panel h2,.panel h3{color:#eaf2ff}.panel a{border-bottom-color:#273447}.monitor{background:#101925f2}.monitor .panel-head{padding:14px 18px;background:#0b121d;border-radius:7px 7px 0 0}.monitor h2{font-size:16px;margin:0}.table-wrap{border-color:#2d3a4d;border-radius:0}table{background:#0b1320}th{background:#111927;color:#cbd5e3}td{background:#0d1623cc;color:#d8e2ee}th,td{border-color:#263345}.ip{color:#f3f8ff}.meter{background:#641522;border-color:#a42a3f;border-radius:3px}.total{height:28px;background:#681724;border-color:#b43449;border-radius:3px}.small-btn{border-radius:4px}.green{background:#16733c}.red{background:#8a1a2e}.gold{background:#a98925}
.empty-grid{grid-template-columns:repeat(5,minmax(112px,1fr))}.player-card{border-radius:7px;background:linear-gradient(180deg,#101b2b,#0b1220);border-color:#2d3e57;box-shadow:inset 0 0 30px #0006}.player-card span{color:#f0c644}.player-card b{color:#f1f6ff}
.store{display:flex;flex-direction:column}.store>h2,.store>.note{display:none}.shop-hero{order:1;min-height:210px;background:linear-gradient(90deg,#07101dfa 0%,#07101dbd 45%,#141b2a33),url('/assets/shop-service.png') center/cover no-repeat;border:1px solid #314052;border-radius:7px;margin-bottom:18px;padding:24px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;box-shadow:inset 0 -80px 100px #050910cc}.shop-hero h2{font-size:28px;margin:0 0 8px}.shop-hero p{margin:0;color:#bdc9d8}.shop-hero span{background:#671522;border:1px solid #bd3149;color:#fff;padding:10px 12px;border-radius:4px;font-weight:900}
.service-cards{order:3;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.service-card{display:block;min-height:330px;padding:0;border-radius:7px;background:#0b1422;border-color:#2d3c52;box-shadow:0 16px 32px #0008}.service-card:before{display:none}.service-preview{height:205px;border-bottom:1px solid #2d3b51;position:relative;overflow:hidden;background:#09111d}.service-preview:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 42%,#0b1422e8 100%);pointer-events:none}.service-preview img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 30%;transition:transform .25s ease}.service-card:hover .service-preview img{transform:scale(1.035)}.service-preview span{position:absolute;left:12px;bottom:12px;z-index:1;background:#7b1728;border:1px solid #d33a52;border-radius:4px;padding:7px 10px;color:#fff;font-weight:900}.service-body{padding:14px}.service-card h3{font-size:19px;margin:0 0 8px}.service-card strong{color:#fff;background:#182537;border:1px solid #32455e;border-radius:4px;padding:8px 10px;margin:0 0 12px;display:inline-block}.service-card ul{padding-left:18px;color:#b8c5d7}
.order-box{order:2;background:#0b1320;border:1px solid #28374b;border-radius:7px;padding:18px;margin:0 0 18px}.order-box h3{margin:0;color:#fff}.form-grid label,.stack-form{color:#cdd7e5}input,select,textarea{background:#641522;color:#fff;border:1px solid #af2b42;border-radius:2px;box-shadow:inset 0 1px 0 #ffffff10}input::placeholder,textarea::placeholder{color:#d7a7af}.check-row{display:flex!important;align-items:center;gap:10px;background:#101928;border:1px solid #29394d;border-radius:4px;padding:10px 12px;color:#cfd9e8!important}.check-row input{width:18px;height:18px;accent-color:#c91524;flex:0 0 auto}.primary{background:#c91524;border-radius:3px;box-shadow:0 5px 16px #0007}.primary:hover{background:#e01f31}.pay-form{border-top-color:#2d3a4d}.operations-panel .table-wrap,.ban-search{margin-top:12px}.ban-search input{max-width:420px;background:#641522;border-color:#af2b42}
.balance-panel,.two-col{gap:18px}.status-pill{border-radius:3px;background:#193423;color:#89e5a2}.modal{backdrop-filter:blur(5px)}.dialog{border-radius:7px;background:#101925;border-color:#34455b}.footer{background:#202028d9;max-width:none;margin-top:40px;padding-left:max(18px,calc((100vw - 1180px)/2 + 18px));padding-right:max(18px,calc((100vw - 1180px)/2 + 18px));border-top-color:#353441}.footer-logo{color:#f2404c!important;text-shadow:0 0 12px #ff3b4a88}
.panel-link{display:inline-block!important;border:1px solid #33445c!important;border-radius:4px!important;padding:8px 10px!important;color:#dce7f5!important;background:#131e2d}.role-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:16px 0 20px}.role-grid.compact{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.role-card{background:linear-gradient(180deg,#111b29,#0b1320);border:1px solid #2c3b50;border-left:4px solid var(--role);border-radius:6px;padding:13px;box-shadow:inset 0 0 30px #0005}.role-title{display:flex;align-items:center;gap:9px;margin-bottom:12px}.role-title span{width:12px;height:12px;border-radius:50%;background:var(--role);box-shadow:0 0 14px var(--role)}.role-title strong{color:var(--role);text-transform:uppercase;font-size:13px}.role-members{display:grid;gap:9px}.role-member{background:#0a111d;border:1px solid #253349;border-radius:5px;padding:10px}.role-member b{display:block;color:#fff}.role-member small{color:#93a3b8}.role-table{margin-top:16px}
.rules-page{display:grid;gap:22px}.rules-hero{min-height:220px;padding:38px 42px;border:1px solid #26394d;border-radius:10px;background:linear-gradient(110deg,#0b1727fa,#0b1727b8 58%,#0b172744),url('/assets/support-banner.png?v=2') center/cover no-repeat;box-shadow:inset 0 0 70px #0008}.rules-hero span{display:inline-block;color:#9bdcff;font-size:13px;font-weight:900;text-transform:uppercase}.rules-hero h1{max-width:680px;margin:17px 0 10px;color:#9ddb23;font-size:36px;line-height:1.08}.rules-hero p{max-width:610px;margin:0;color:#c5d0df;font-size:18px;line-height:1.5}.rules-server-title{margin:10px 0 0;color:#9ddb23;font-size:30px;line-height:1.2}.rule-section{--rule-tone:#52cfff;background:#0c1522f5;border:1px solid #26374a;border-left:5px solid var(--rule-tone);border-radius:10px;padding:30px 34px;box-shadow:0 18px 45px #0007}.rule-section.vip{--rule-tone:#ffda20}.rule-section.admin{--rule-tone:#71f3a2}.rule-section.required{--rule-tone:#ff4b5f;background:#211116f5}.rule-section>h2{margin:0 0 22px;color:#f0f5ff;font-size:30px}.rule-list{display:grid}.rule-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:24px;padding:22px 8px;border-top:1px solid #233246}.rule-row:first-child{border-top:0}.rule-row>b{color:#73d9ff;font-size:19px}.rule-row h3{margin:0 0 7px;color:#f2f6fc;font-size:18px}.rule-row p{margin:0;color:#bdc8d8;font-size:16px;line-height:1.58}.rule-row small{display:block;margin-top:10px;color:#d6deea;font-size:14px;line-height:1.5}.rule-row small strong{color:var(--rule-tone)}
.home-promo{height:315px;min-height:315px;padding:38px 56px;display:flex;align-items:flex-start;background-position:center;background-size:cover;background-repeat:no-repeat;overflow:hidden}.home-promo.store{background-image:linear-gradient(90deg,#050608f2 0%,#050608bd 45%,#05060842),url('/assets/support-banner.png?v=2')}.home-promo.unban{background-image:linear-gradient(90deg,#050608f2 0%,#050608bd 45%,#05060842),url('/assets/shop-service.png?v=2')}.home-promo.support{background-image:linear-gradient(90deg,#050608f2 0%,#050608bd 50%,#05060866),url('/assets/oldera-bg.png?v=2')}.home-promo h2{display:inline-block;max-width:800px;margin:0 0 20px;padding:9px 11px;border-radius:7px;background:#252936df;color:#fff;font-size:32px;font-weight:400;line-height:1.15}.home-promo p{display:block;max-width:790px;margin:0 0 24px;padding:8px 10px;border-radius:7px;background:#252936df;color:#cbd5e3;font-size:14px;line-height:1.45}.home-promo a{display:inline-block;background:#ff1717;color:#fff;padding:12px 25px;font-weight:900}.home-chat{min-height:250px}.home-news{min-height:180px;padding:30px}
.purchase-panel{padding:30px}.purchase-panel>h2{display:block;margin:0 0 28px;color:#dce7f5;font-size:18px}.purchase-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,1fr);gap:30px;align-items:start}.purchase-form{display:grid;gap:14px}.purchase-form label{display:grid;gap:7px;color:#c8d3e2;font-weight:700}.purchase-form select,.purchase-form input{height:42px;padding:9px 13px;background:#5d1420;border:1px solid #bb1f35;color:#fff}.buyer-fields{display:grid;gap:12px;padding-top:4px}.purchase-form .check-row{display:flex;align-items:center;font-weight:400}.purchase-submit{min-height:56px;background:#58b8ac;box-shadow:0 0 24px #58d7c177}.service-info>h3{margin:0 0 8px;color:#cbd6e6;font-size:16px}.service-info{min-width:0}.service-info-media{height:300px;position:relative;overflow:hidden;border:1px solid #2f4158;background:#101928}.service-info-media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,#08111de8)}.service-info-media img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 25%}.service-info-media span{position:absolute;left:18px;bottom:16px;z-index:1;padding:8px 11px;background:#7b1728;border:1px solid #d33a52;color:#fff;font-weight:900}.service-info-body{padding:20px;background:#0b1422;border:1px solid #2f4158;border-top:0}.service-info-body h4{margin:0 0 10px;color:#fff;font-size:24px}.service-info-body>strong{display:inline-block;margin-bottom:12px;padding:8px 10px;background:#182537;border:1px solid #32455e;color:#fff}.service-info-body ul{margin:0 0 16px;padding-left:20px;color:#bdc9d9;line-height:1.7}.service-info-body small{color:#8292a7}
.rules-page{gap:26px;padding:30px;background:#0b1421e8;border-radius:10px}.rules-hero{min-height:115px;padding:28px 30px;background:#111d2e;border:1px solid #24364b;border-radius:14px;box-shadow:inset 0 0 42px #07101d}.rules-hero h1{margin:0 0 6px;color:#8bad16;font-size:27px;font-weight:400}.rules-hero p{margin:0;color:#8f9bad;font-size:14px}.rules-server-title{margin:6px 0 0;color:#8bad16;font-size:27px;font-weight:400}.rule-section{--rule-tone:#51c8f2;padding:24px;background:#080f1a;border:1px solid #1c293a;border-left:0;border-radius:14px;box-shadow:inset 0 0 35px #03070d}.rule-section.vip,.rule-section.admin{--rule-tone:#51c8f2}.rule-section.required{--rule-tone:#ff5768;background:#160c10;border-left:0}.rule-section>h2{margin:0 0 18px;color:#c8d0df;font-size:26px;font-weight:600}.rule-list{gap:10px}.rule-row{grid-template-columns:50px minmax(0,1fr);gap:12px;padding:14px;background:#0c1623;border:0;border-radius:8px}.rule-row>b{color:#62c8ef;font-size:14px}.rule-row h3{margin:0 0 4px;color:#c8d0df;font-size:15px}.rule-row p{color:#8996a8;font-size:14px;line-height:1.48}.rule-row small{margin-top:4px;color:#8996a8;font-size:13px}.rule-row small strong{color:#aab7c7}
@media (max-width:900px){body{background-attachment:scroll;overflow-x:hidden}.layout{grid-template-columns:1fr;margin-top:0;padding:0 12px}.main{order:1}.sidebar{order:2;gap:10px;overflow:hidden}.logo{min-height:86px;justify-content:flex-start;align-items:center;overflow:hidden;padding:10px 18px;gap:10px}.logo-mark{width:42px;height:42px;flex:0 0 42px}.logo strong{font-size:22px;white-space:nowrap;max-width:230px;overflow:hidden}.side-actions{grid-template-columns:1fr}.panel{border-radius:0}.shop-hero{min-height:190px;margin-left:-22px;margin-right:-22px;border-left:0;border-right:0;border-radius:0;align-items:flex-end;display:block}.shop-hero h2{font-size:24px}.shop-hero p{max-width:100%;overflow-wrap:anywhere}.shop-hero span{display:inline-block;margin-top:14px}.service-cards{grid-template-columns:1fr}.service-card{min-height:0}.empty-grid{grid-template-columns:1fr 1fr}.order-box{margin-left:-6px;margin-right:-6px}.topbar{position:sticky}.footer{grid-template-columns:1fr}}
.footer{max-width:1180px;margin:40px auto 0;padding:34px 18px 52px;display:grid;grid-template-columns:2fr 1fr 1fr 1.2fr;gap:28px;color:#aeb8c7;border-top:1px solid #273343}.footer a{display:block;color:#aeb8c7;margin:8px 0}.footer-logo{color:#fff!important;font-size:24px;font-weight:900}.footer p{line-height:1.6}.monitor{padding:0}.monitor .panel-head{padding:18px 22px}.monitor .table-wrap{border-left:0;border-right:0;border-radius:0}.monitor .total{margin:10px 12px 12px}
/* BestKILL/GameCMS reference pass */
.topbar{height:88px;justify-content:flex-start;padding:0 14px;background:#202128;border-top:6px solid #fff1e9}.nav{justify-content:flex-start}.nav a{height:86px;padding:0 24px;font-size:18px;color:#d8e5ff}.nav a.active{min-width:136px;justify-content:center;background:linear-gradient(135deg,#af69b7 0%,#ef3678 100%);border-radius:14px;color:#fff}.user-mini{right:38px;background:#111827;border:1px solid #ff1717;border-radius:0;color:#fff;padding:8px 17px}.crumb{max-width:none;margin:0;padding:19px 14px;background:#33363e;border:0;border-radius:0;color:#9ea6b3}.layout{max-width:none;margin:0;grid-template-columns:382px minmax(0,1fr);gap:38px;padding:38px 14px 24px;background:linear-gradient(90deg,#172030e8,#131b29c2),url('/assets/oldera-bg.png') center top/cover fixed no-repeat}.main{gap:52px}.logo{min-height:178px;padding:0 6px 18px;align-items:flex-end}.logo-mark{width:78px;height:78px;border-radius:16px;font-size:34px}.logo strong{font-size:52px;letter-spacing:-2px}.side-actions{gap:12px}.side-btn{min-height:50px;border-radius:7px;background:#111a2a;border-color:#182842;text-align:center;font-size:17px}.side-btn:first-child{border-color:#ff9900}.side-btn.accent{background:linear-gradient(100deg,#fa9226,#f05270)}.panel{border-radius:10px;background:#0d1724f5;border-color:#18263a}.auth-panel{padding:34px 36px}.auth-panel h3,.online-panel h3,.top-users h3{font-size:23px;color:#d6e3ff}.auth-button{width:100%;min-height:50px;margin-top:13px;border:1px solid #ff1717;background:#4a1019;color:#fff;font-weight:800;font-size:16px;cursor:pointer}.auth-red{background:#ff1111}.auth-vk{background:#580d18}.auth-outline{background:#25101a}.online-panel{padding:34px 36px}.online-panel h3{display:flex;gap:18px}.online-list,.top-list{display:grid;gap:0}.online-user{display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:center;padding:12px 0;border-top:1px solid #2b3544}.avatar{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#404b5a,#d3d8dc);color:#111827;font-weight:900}.online-user b{display:block;color:var(--user-color);font-size:18px}.online-user small{color:#d4e0f7;font-size:15px}.top-list>div{padding:13px 0;border-top:1px solid #2b3544}.top-list b{display:block;color:#d9e7ff}.top-list small{color:#9da9ba}.monitor{margin-top:0}.monitor .panel-head{display:none}.monitor th{font-size:18px}.monitor td{font-size:17px}.support-banner{min-height:315px;border-radius:0;background:linear-gradient(90deg,#050608 0%,#05060899 46%,#05060866),url('/assets/shop-service.png') center/cover no-repeat;padding:50px 70px;display:flex;align-items:center}.support-banner h2{display:inline-block;margin:0 0 24px;padding:10px 14px;border-radius:8px;background:#252936d9;color:#fff;font-size:40px;font-weight:400}.support-banner p{display:inline-block;margin:0 0 28px;padding:9px 12px;border-radius:8px;background:#252936d9;color:#cbd5e3;font-size:17px}.support-banner a{display:inline-block;background:#ff1717;color:#fff;padding:15px 28px;font-weight:900}.chat-panel{padding:38px}.chat-panel h2{font-size:24px;margin-bottom:36px}.chat-list{display:grid;gap:0}.chat-message{display:grid;grid-template-columns:64px 1fr 70px;gap:18px;padding:18px 10px;border-bottom:1px solid #2a3445}.chat-message.pinned{background:#3a3a4d;padding:16px}.chat-body b{color:var(--chat-color);font-size:16px}.chat-body p{margin:8px 0 0;color:#dbe7ff;font-size:20px;line-height:1.32}.chat-message.pinned p{color:#42ff63;font-size:16px}.chat-message time{text-align:right;color:#cfe1ff}.chat-message time span{display:block}.chat-login{text-align:center;margin:34px 0 0;color:#d8e2ef}.chat-login a{display:inline!important;border:0!important;color:#ff4a12!important;text-decoration:underline}.footer{max-width:none;background:#202128;margin:0;padding:34px 70px 52px;border-top:1px solid #30313a}
@media (max-width:900px){.topbar{height:64px;padding:0}.nav{overflow:auto;justify-content:flex-start;width:100%}.nav a{height:64px;padding:0 14px;white-space:nowrap;font-size:14px}.nav a.active{min-width:0;border-radius:0}.layout{grid-template-columns:1fr;padding:18px 12px;gap:18px}.main{order:1;gap:20px}.sidebar{order:2}.logo{min-height:96px}.logo strong{font-size:30px}.logo-mark{width:50px;height:50px}.empty-grid{grid-template-columns:1fr 1fr}.two-col,.form-grid,.footer{grid-template-columns:1fr}.user-mini{display:none}.support-banner{min-height:230px;padding:28px 22px}.support-banner h2{font-size:28px}.support-banner p{font-size:15px}.chat-panel{padding:22px}.chat-message{grid-template-columns:50px 1fr;gap:12px}.chat-message time{grid-column:2;text-align:left}.chat-body p{font-size:17px}.auth-panel,.online-panel{padding:24px}.footer{padding:28px 18px}.service-preview{height:230px}.rules-page{gap:16px}.rules-hero{min-height:190px;padding:28px 22px}.rules-hero h1{font-size:29px}.rules-hero p{font-size:16px}.rules-server-title{font-size:25px}.rule-section{padding:23px 18px}.rule-section>h2{font-size:25px}.rule-row{grid-template-columns:52px minmax(0,1fr);gap:12px;padding:20px 0}.rule-row>b{font-size:16px}.rule-row h3{font-size:17px}.rule-row p{font-size:15px}}
/* Exact desktop geometry measured from the GameCMS reference */
@media (min-width:901px){
body{font-size:14px;background-position:center 115px;background-size:cover}
.topbar{height:70px;padding:0 max(12px,calc((100vw - 1300px)/2 + 12px));border-top:5px solid #fff4ed;box-shadow:none}
.nav{height:65px;gap:0}
.nav a{height:65px;padding:0 17px;font-size:14px}
.nav a.active{min-width:108px;border-radius:0 0 14px 14px}
.user-mini{right:max(12px,calc((100vw - 1300px)/2 + 12px));padding:5px 12px;font-size:12px}
.crumb{height:45px;padding:0 max(12px,calc((100vw - 1300px)/2 + 12px));display:flex;align-items:center;font-size:12px}
.layout{width:100%;max-width:1300px;margin:30px auto 0;padding:0 10px 38px 20px;grid-template-columns:295px minmax(0,945px);gap:30px;background:none}
.sidebar{width:295px;gap:0}
.logo{width:295px;height:145px;min-height:145px;padding:0;display:flex;align-items:center;justify-content:center;overflow:visible}
.logo img{display:block;width:295px;height:145px;object-fit:contain;filter:drop-shadow(0 8px 12px #0009)}
.logo-mark,.logo strong{display:none}
.side-actions{height:190px;gap:10px;margin:0}
.side-btn{height:40px;min-height:40px;padding:0 12px;display:flex;align-items:center;justify-content:center;border-radius:5px;font-size:14px}
.panel{border-radius:0;box-shadow:none}
.auth-panel{height:260px;padding:30px;margin:0 0 30px}
.auth-panel h3,.online-panel h3,.top-users h3{font-size:18px;margin:0 0 25px}
.auth-button{height:40px;min-height:40px;margin:0 0 10px;font-size:14px}
.sidebar>.panel:not(.auth-panel):not(.online-panel):not(.top-users){padding:30px;margin:0 0 30px}
.online-panel,.top-users{padding:30px;margin:0 0 30px}
.main{width:100%;gap:38px;align-self:start;align-content:start}
.monitor{position:relative;width:100%;height:297px;min-height:297px;border:0;border-radius:12px;padding:0;overflow:visible;background:transparent;box-shadow:none}
.monitor .table-wrap{height:auto;border:1px solid #2d3a4d;border-radius:12px 12px 0 0;overflow:hidden}
.monitor table{table-layout:fixed}
.monitor th,.monitor td{height:37px;padding:8px 10px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.monitor th{height:41px;text-align:center}
.monitor th:nth-child(1),.monitor td:nth-child(1){width:33%;text-align:left}
.monitor th:nth-child(2),.monitor td:nth-child(2){width:16%;text-align:center}
.monitor th:nth-child(3),.monitor td:nth-child(3){width:12%;text-align:center}
.monitor th:nth-child(4),.monitor td:nth-child(4){width:19%;text-align:center}
.monitor th:nth-child(5),.monitor td:nth-child(5){width:20%;text-align:center}
.meter{height:27px;min-width:82px}
.small-btn{width:40px;height:27px;margin-right:7px}
.monitor .total{position:absolute;left:5px;right:5px;top:94px;bottom:auto;height:28px;margin:0}
.support-banner{width:100%;height:400px;min-height:400px;padding:39px 57px;align-items:flex-start;border:0;background:linear-gradient(90deg,#050608 0%,#050608c7 42%,#05060825),url('/assets/support-banner.png?v=2') center/cover no-repeat}
.support-banner h2{margin:0 0 20px;padding:9px 10px;font-size:36px;line-height:1.15;border-radius:7px}
.support-banner p{margin:0 0 20px;padding:7px 8px;font-size:14px;line-height:1.4;border-radius:7px}
.support-banner a{padding:12px 25px;font-size:14px}
.chat-panel{padding:30px}
.chat-panel h2{font-size:18px;margin-bottom:30px}
.chat-message{grid-template-columns:54px 1fr 62px;gap:14px;padding:14px 8px}
.chat-body p{font-size:16px}
.footer{padding-left:max(30px,calc((100vw - 1300px)/2 + 15px));padding-right:max(30px,calc((100vw - 1300px)/2 + 15px))}
}
@media (max-width:900px){
.layout,.main,.monitor,.table-wrap,.support-banner{min-width:0;max-width:100%;width:100%}
.main{overflow:hidden}
.table-wrap{overflow-x:auto}
.monitor table{min-width:720px}
.support-banner{overflow:hidden;background:linear-gradient(90deg,#050608 0%,#050608c7 52%,#05060825),url('/assets/support-banner.png?v=2') center/cover no-repeat}
.support-banner h2,.support-banner p{max-width:100%;white-space:normal;overflow-wrap:break-word}
.logo{padding:8px 14px;justify-content:center}
.logo img{display:block;width:min(300px,100%);height:90px;object-fit:contain}
}
@media (min-width:901px){
.monitor{height:auto;min-height:0}
.monitor .total{position:relative;left:auto;right:auto;top:auto;bottom:auto;margin:6px 5px 0}
.main{gap:30px}
}
@media (max-width:900px){
.home-promo{height:280px;min-height:280px;padding:26px 20px}.home-promo h2{font-size:26px}.home-promo p{font-size:14px}.purchase-panel{padding:22px 16px}.purchase-layout{grid-template-columns:1fr;gap:24px}.service-info-media{height:230px}.buyer-fields{grid-template-columns:1fr}.rules-page{padding:16px 12px;gap:18px}.rules-hero{min-height:110px;padding:24px 20px}.rules-hero h1,.rules-server-title{font-size:25px}.rule-section{padding:19px 14px}.rule-section>h2{font-size:23px}.rule-row{grid-template-columns:42px minmax(0,1fr);padding:13px 10px}.rule-row h3{font-size:15px}
}
`;
}

function clientScript() {
  return `
const services = ${JSON.stringify(SERVICES)};
const serviceDetails = ${JSON.stringify(SERVICE_DETAILS)};

function qs(selector, root = document) { return root.querySelector(selector); }
function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

function openModal(name) {
  qsa('.modal').forEach((modal) => modal.classList.remove('show'));
  const modal = qs('#' + name + '-modal');
  if (modal) modal.classList.add('show');
}

qsa('[data-modal]').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  openModal(button.dataset.modal);
}));
qsa('[data-close], .modal').forEach((element) => element.addEventListener('click', (event) => {
  if (event.target === element) qsa('.modal').forEach((modal) => modal.classList.remove('show'));
}));

async function postJson(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function escapeText(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

async function refreshStatus() {
  const response = await fetch('/api/server-status');
  const data = await response.json();
  const max = data.maxPlayers || 32;
  const players = data.players || 0;
  const percent = Math.min(100, Math.round(players / max * 100));
  qs('#server-map') && (qs('#server-map').textContent = data.map || 'Не определено');
  qs('#server-players') && (qs('#server-players').textContent = players + '/' + max);
  qs('#server-total') && (qs('#server-total').textContent = players + '/' + max);
  qs('#server-fill') && (qs('#server-fill').style.width = percent + '%');
  qs('#total-fill') && (qs('#total-fill').style.width = percent + '%');
}

function fillTariffs() {
  const service = qs('#service-select');
  const tariff = qs('#tariff-select');
  if (!service || !tariff) return;
  const selected = services.find((item) => item.id === service.value) || services[0];
  tariff.innerHTML = selected.tariffs.map(([name, price], index) => '<option value="' + index + '">' + name + ' - ' + price.toLocaleString('ru-RU') + ' сум</option>').join('');
  updateServiceInfo(selected);
}

function updateServiceInfo(selected) {
  const detail = serviceDetails[selected.id] || {};
  const tariff = qs('#tariff-select');
  const tariffIndex = Number(tariff?.value || 0);
  const selectedTariff = selected.tariffs[tariffIndex] || selected.tariffs[0];
  const image = detail.image || '/assets/shop-service.png?v=2';
  const preview = qs('#service-info-image');
  if (preview) {
    preview.src = image;
    preview.alt = selected.name;
  }
  qs('#service-info-badge') && (qs('#service-info-badge').textContent = detail.badge || 'SERVICE');
  qs('#service-info-title') && (qs('#service-info-title').textContent = selected.name);
  qs('#service-info-price') && (qs('#service-info-price').textContent = selectedTariff[1].toLocaleString('ru-RU') + ' сум');
  qs('#service-info-abilities') && (qs('#service-info-abilities').innerHTML = (detail.abilities || []).map((ability) => '<li>' + escapeText(ability) + '</li>').join(''));
}

qs('#refresh-status')?.addEventListener('click', refreshStatus);
qs('#service-select')?.addEventListener('change', fillTariffs);
qs('#tariff-select')?.addEventListener('change', () => {
  const selected = services.find((item) => item.id === qs('#service-select')?.value) || services[0];
  updateServiceInfo(selected);
});
fillTariffs();
refreshStatus();

qs('#register-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#register-result');
  const data = await postJson('/api/register', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});

qs('#login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#login-result');
  const data = await postJson('/api/login', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});

qs('#order-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#order-result');
  const data = await postJson('/api/order', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});

qs('#balance-check-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#balance-result');
  const login = new FormData(event.currentTarget).get('login');
  const response = await fetch('/api/balance?login=' + encodeURIComponent(login || ''));
  const data = await response.json();
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});

qs('#topup-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#topup-result');
  const data = await postJson('/api/topup', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});

qs('#payment-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#payment-result');
  const data = await postJson('/api/payment/create', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.innerHTML = data.paymentUrl
    ? data.message + '<a class="pay-link" href="' + data.paymentUrl + '" target="_blank" rel="noopener">Перейти к оплате</a>'
    : data.message;
});

async function loadBans() {
  const tbody = qs('#ban-rows');
  if (!tbody) return;
  try {
    const response = await fetch('/api/bans');
    const data = await response.json();
    const bans = data.bans || [];
    if (!bans.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Активных банов пока нет</td></tr>';
      return;
    }
    const search = qs('#ban-search');
    const renderBans = () => {
      const query = (search?.value || '').toLowerCase().trim();
      const visible = query
        ? bans.filter((ban) => [ban.player, ban.steamId, ban.reason, ban.duration, ban.remaining].join(' ').toLowerCase().includes(query))
        : bans;
      tbody.innerHTML = visible.length
        ? visible.map((ban) => '<tr><td>' + escapeText(ban.player) + '<small>' + escapeText(ban.steamId || '') + '</small></td><td>' + escapeText(ban.reason) + '</td><td>' + escapeText(ban.duration) + '</td><td>' + escapeText(ban.remaining) + '</td><td><button class="inline-action" data-unban="' + escapeText(ban.id) + '">Разбан</button></td></tr>').join('')
        : '<tr><td colspan="5" class="empty-cell">По запросу ничего не найдено</td></tr>';
    };
    renderBans();
    if (search) search.oninput = renderBans;
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Не удалось загрузить баны</td></tr>';
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-unban]');
  if (!button) return;
  const login = prompt('Логин на сайте для списания баланса');
  if (!login) return;
  const data = await postJson('/api/unban/order', { login, banId: button.dataset.unban });
  alert(data.message);
  loadBans();
});

loadBans();

qs('#ticket-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#ticket-result');
  const data = await postJson('/api/ticket', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});
`;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/server-status" && req.method === "GET") {
    json(res, 200, await serverStatus());
    return;
  }

  if (pathname === "/api/register" && req.method === "POST") {
    const data = await readRequestBody(req);
    const login = String(data.login || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");
    const password2 = String(data.password2 || "");

    if (!login || !email || !password || !password2) {
      json(res, 400, { ok: false, message: "Заполните все поля" });
      return;
    }
    if (password !== password2) {
      json(res, 400, { ok: false, message: "Пароли не совпадают" });
      return;
    }

    const db = await readDb();
    if (db.users.some((user) => user.login.toLowerCase() === login.toLowerCase() || user.email === email)) {
      json(res, 409, { ok: false, message: "Такой логин или email уже зарегистрирован" });
      return;
    }

    db.users.push({ login, email, password, balance: 0, active: false, createdAt: new Date().toISOString() });
    await writeDb(db);
    json(res, 200, { ok: true, message: "Регистрация принята. Аккаунт создан в тестовом режиме." });
    return;
  }

  if (pathname === "/api/balance" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const login = String(url.searchParams.get("login") || "").trim();
    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    if (!user) {
      json(res, 404, { ok: false, message: "Пользователь не найден" });
      return;
    }
    json(res, 200, { ok: true, balance: user.balance || 0, message: `Баланс ${user.login}: ${formatMoney(user.balance)}` });
    return;
  }

  if (pathname === "/api/topup" && req.method === "POST") {
    const adminPin = process.env.ADMIN_PIN || "";
    if (!adminPin) {
      json(res, 503, { ok: false, message: "Сначала добавьте ADMIN_PIN в Render Environment" });
      return;
    }

    const data = await readRequestBody(req);
    const pin = String(data.pin || "");
    const login = String(data.login || "").trim();
    const amount = Math.floor(Number(data.amount || 0));

    if (pin !== adminPin) {
      json(res, 403, { ok: false, message: "Неверный Admin PIN" });
      return;
    }
    if (!login || amount <= 0) {
      json(res, 400, { ok: false, message: "Укажите логин и сумму пополнения" });
      return;
    }

    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    if (!user) {
      json(res, 404, { ok: false, message: "Пользователь не найден" });
      return;
    }

    user.balance = Number(user.balance || 0) + amount;
    db.topups.push({
      login: user.login,
      amount,
      comment: String(data.comment || ""),
      createdAt: new Date().toISOString()
    });
    await writeDb(db);
    json(res, 200, { ok: true, balance: user.balance, message: `Пополнено. Новый баланс ${user.login}: ${formatMoney(user.balance)}` });
    return;
  }

  if (pathname === "/api/payment/create" && req.method === "POST") {
    const data = await readRequestBody(req);
    const login = String(data.login || "").trim();
    const amount = Math.floor(Number(data.amount || 0));
    const provider = String(data.provider || "click").toLowerCase();

    if (!login || amount <= 0) {
      json(res, 400, { ok: false, message: "Укажите логин и сумму пополнения" });
      return;
    }

    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    if (!user) {
      json(res, 404, { ok: false, message: "Пользователь не найден" });
      return;
    }

    const payment = {
      id: randomUUID(),
      login: user.login,
      amount,
      provider,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    payment.paymentUrl = createPaymentLink(payment, provider);
    db.payments.push(payment);
    await writeDb(db);

    json(res, 200, {
      ok: true,
      paymentId: payment.id,
      paymentUrl: payment.paymentUrl,
      message: payment.paymentUrl
        ? `Платеж создан на ${formatMoney(amount)}. После оплаты баланс начислится автоматически.`
        : `Платеж создан: ${payment.id}. Добавьте ключи ${provider.toUpperCase()} в Render или подтвердите платеж вручную.`
    });
    return;
  }

  if (pathname === "/api/payments/click" && (req.method === "POST" || req.method === "GET")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const data = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readRequestBody(req);
    const paymentId = String(data.merchant_trans_id || data.transaction_param || "");
    const action = String(data.action || "");
    const db = await readDb();
    const payment = db.payments.find((item) => item.id === paymentId);

    const base = {
      click_trans_id: data.click_trans_id || "",
      merchant_trans_id: paymentId,
      merchant_prepare_id: payment?.prepareId || payment?.id || "",
      error: 0,
      error_note: "Success"
    };

    if (!verifyClickSignature(data)) {
      json(res, 200, { ...base, error: -1, error_note: "Invalid signature" });
      return;
    }
    if (!payment) {
      json(res, 200, { ...base, error: -5, error_note: "Payment not found" });
      return;
    }
    if (Number(data.amount) && Number(data.amount) !== Number(payment.amount)) {
      json(res, 200, { ...base, error: -2, error_note: "Invalid amount" });
      return;
    }

    if (action === "0") {
      payment.prepareId ||= randomUUID();
      payment.status = payment.status === "paid" ? "paid" : "prepared";
      payment.clickPrepare = { ...data, receivedAt: new Date().toISOString() };
      await writeDb(db);
      json(res, 200, { ...base, merchant_prepare_id: payment.prepareId });
      return;
    }

    if (action === "1") {
      if (payment.prepareId && data.merchant_prepare_id && String(data.merchant_prepare_id) !== String(payment.prepareId)) {
        json(res, 200, { ...base, error: -6, error_note: "Invalid prepare id" });
        return;
      }
      const user = creditPayment(db, payment, "Click payment");
      if (!user) {
        json(res, 200, { ...base, error: -5, error_note: "User not found" });
        return;
      }
      payment.clickComplete = { ...data, receivedAt: new Date().toISOString() };
      await writeDb(db);
      json(res, 200, { ...base, merchant_prepare_id: payment.prepareId || payment.id, merchant_confirm_id: payment.id });
      return;
    }

    json(res, 200, { ...base, error: -3, error_note: "Unsupported action" });
    return;
  }

  if (pathname === "/api/payments/payme" && req.method === "POST") {
    const request = await readRequestBody(req);
    const auth = String(req.headers.authorization || "");
    const expectedAuth = process.env.PAYME_SECRET_KEY ? `Basic ${Buffer.from(`Paycom:${process.env.PAYME_SECRET_KEY}`).toString("base64")}` : "";

    const paymeResult = (result) => json(res, 200, { jsonrpc: "2.0", id: request.id || null, result });
    const paymeError = (code, message, data = null) => json(res, 200, { jsonrpc: "2.0", id: request.id || null, error: { code, message, data } });

    if (expectedAuth && !safeEqualText(auth, expectedAuth)) {
      paymeError(-32504, "Permission denied");
      return;
    }

    const method = String(request.method || "");
    const params = request.params || {};
    const paymentId = String(params.account?.payment_id || params.payment_id || "");
    const transactionId = String(params.id || "");
    const db = await readDb();
    const payment = db.payments.find((item) => item.id === paymentId || item.paymeTransactionId === transactionId);

    if (method === "CheckPerformTransaction") {
      if (!payment) {
        paymeError(-31050, "Payment not found", "payment_id");
        return;
      }
      if (Number(params.amount) && Number(params.amount) !== Number(payment.amount) * 100) {
        paymeError(-31001, "Invalid amount", "amount");
        return;
      }
      paymeResult({ allow: payment.status !== "paid" });
      return;
    }

    if (method === "CreateTransaction") {
      if (!payment) {
        paymeError(-31050, "Payment not found", "payment_id");
        return;
      }
      if (payment.paymeTransactionId && payment.paymeTransactionId !== transactionId) {
        paymeError(-31008, "Transaction already exists");
        return;
      }
      payment.paymeTransactionId = transactionId;
      payment.paymeCreateTime ||= Date.now();
      payment.status = payment.status === "paid" ? "paid" : "prepared";
      await writeDb(db);
      paymeResult({ create_time: payment.paymeCreateTime, transaction: payment.id, state: payment.status === "paid" ? 2 : 1 });
      return;
    }

    if (method === "PerformTransaction") {
      if (!payment) {
        paymeError(-31003, "Transaction not found");
        return;
      }
      const user = creditPayment(db, payment, "Payme payment");
      if (!user) {
        paymeError(-31050, "User not found", "payment_id");
        return;
      }
      payment.paymePerformTime ||= Date.now();
      await writeDb(db);
      paymeResult({ perform_time: payment.paymePerformTime, transaction: payment.id, state: 2 });
      return;
    }

    if (method === "CheckTransaction") {
      if (!payment) {
        paymeError(-31003, "Transaction not found");
        return;
      }
      paymeResult({
        create_time: payment.paymeCreateTime || Date.parse(payment.createdAt),
        perform_time: payment.paymePerformTime || (payment.paidAt ? Date.parse(payment.paidAt) : 0),
        cancel_time: payment.paymeCancelTime || 0,
        transaction: payment.id,
        state: payment.status === "paid" ? 2 : payment.status === "canceled" ? -1 : 1,
        reason: payment.paymeCancelReason || null
      });
      return;
    }

    if (method === "CancelTransaction") {
      if (!payment) {
        paymeError(-31003, "Transaction not found");
        return;
      }
      if (payment.status !== "paid") {
        payment.status = "canceled";
        payment.paymeCancelTime ||= Date.now();
        payment.paymeCancelReason = params.reason || null;
        await writeDb(db);
      }
      paymeResult({
        cancel_time: payment.paymeCancelTime || 0,
        transaction: payment.id,
        state: payment.status === "paid" ? 2 : -1
      });
      return;
    }

    paymeError(-32601, "Method not found");
    return;
  }

  if (pathname === "/api/payment/mark-paid" && req.method === "POST") {
    const data = await readRequestBody(req);
    const secret = String(data.secret || data.pin || req.headers["x-webhook-secret"] || "");
    const expected = PAYMENT_WEBHOOK_SECRET || process.env.ADMIN_PIN || "";
    if (!expected || !safeEqualText(secret, expected)) {
      json(res, 403, { ok: false, message: "Invalid payment confirmation secret" });
      return;
    }

    const db = await readDb();
    const payment = db.payments.find((item) => item.id === String(data.paymentId || data.id || ""));
    const user = creditPayment(db, payment, "Manual payment confirmation");
    if (!payment || !user) {
      json(res, 404, { ok: false, message: "Payment or user not found" });
      return;
    }
    await writeDb(db);
    json(res, 200, { ok: true, balance: user.balance, message: `Платеж подтвержден. Баланс ${user.login}: ${formatMoney(user.balance)}` });
    return;
  }

  if (pathname === "/api/bans" && req.method === "GET") {
    try {
      json(res, 200, { ok: true, bans: await getBans() });
    } catch (error) {
      json(res, 502, { ok: false, message: error.message, bans: [] });
    }
    return;
  }

  if (pathname === "/api/server/ban-event" && req.method === "POST") {
    const data = await readRequestBody(req);
    const secret = String(data.secret || req.headers["x-server-secret"] || "");
    const expected = process.env.SERVER_WEBHOOK_SECRET || ADMIN_API_KEY || "";
    if (!expected || !safeEqualText(secret, expected)) {
      json(res, 403, { ok: false, message: "Invalid server webhook secret" });
      return;
    }
    const db = await readDb();
    const ban = normalizeBan({ ...data, id: data.id || randomUUID(), createdAt: new Date().toISOString() });
    db.bans = db.bans.filter((item) => String(item.id) !== ban.id);
    db.bans.push(ban);
    await writeDb(db);
    json(res, 200, { ok: true, ban });
    return;
  }

  if (pathname === "/api/unban/order" && req.method === "POST") {
    const data = await readRequestBody(req);
    const login = String(data.login || "").trim();
    const banId = String(data.banId || "");
    const price = Math.floor(Number(process.env.UNBAN_PRICE || 30000));
    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    const ban = (await getBans(db)).find((item) => item.id === banId);

    if (!user || !ban) {
      json(res, 404, { ok: false, message: "Пользователь или бан не найден" });
      return;
    }
    if (Number(user.balance || 0) < price) {
      json(res, 402, { ok: false, message: `Недостаточно средств для разбана. Нужно ${formatMoney(price)}, баланс ${formatMoney(user.balance)}.` });
      return;
    }

    user.balance = Number(user.balance || 0) - price;
    const order = {
      id: randomUUID(),
      login: user.login,
      service: "paid_unban",
      serviceName: "Платный разбан",
      tariffName: "Разбан",
      price,
      banId: ban.id,
      status: "paid-pending-server-integration",
      createdAt: new Date().toISOString()
    };
    order.delivery = await issueServerUnban(ban, order);
    order.status = order.delivery.ok ? "paid-issued" : "paid-pending-server-integration";
    if (order.delivery.ok) db.bans = db.bans.filter((item) => String(item.id) !== ban.id);
    db.orders.push(order);
    await writeDb(db);
    json(res, 200, {
      ok: true,
      message: order.delivery.ok
        ? `Разбан оплачен и отправлен на сервер. Остаток: ${formatMoney(user.balance)}.`
        : `Разбан оплачен, но автовыдача ждет настройки API/RCON. Остаток: ${formatMoney(user.balance)}.`
    });
    return;
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const data = await readRequestBody(req);
    const login = String(data.login || "").trim();
    const password = String(data.password || "");
    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase() && item.password === password);
    if (!user) {
      json(res, 401, { ok: false, message: "Неверный логин или пароль" });
      return;
    }
    json(res, 200, { ok: true, message: user.active ? "Вы вошли" : "Аккаунт найден. Активация будет подключена позже." });
    return;
  }

  if (pathname === "/api/order" && req.method === "POST") {
    const data = await readRequestBody(req);
    const login = String(data.login || "").trim();
    const service = findService(data.service);
    const tariff = findTariff(service, data.tariff);

    if (!login) {
      json(res, 400, { ok: false, message: "Укажите логин на сайте" });
      return;
    }
    if (!service || !tariff) {
      json(res, 400, { ok: false, message: "Выберите корректную услугу и тариф" });
      return;
    }
    if (!data.nickname && !data.steamId) {
      json(res, 400, { ok: false, message: "Укажите ник или STEAM ID для привязки" });
      return;
    }

    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    if (!user) {
      json(res, 404, { ok: false, message: "Пользователь с таким логином не найден" });
      return;
    }

    const price = tariff[1];
    if (Number(user.balance || 0) < price) {
      json(res, 402, { ok: false, message: `Недостаточно средств. Нужно ${formatMoney(price)}, баланс ${formatMoney(user.balance)}.` });
      return;
    }

    user.balance = Number(user.balance || 0) - price;
    const order = {
      id: randomUUID(),
      ...data,
      login: user.login,
      serviceName: service.name,
      tariffName: tariff[0],
      price,
      status: "paid-pending-server-integration",
      createdAt: new Date().toISOString()
    };
    order.delivery = await issueServerEntitlement(order);
    order.status = order.delivery.ok ? "paid-issued" : "paid-pending-server-integration";
    db.orders.push(order);
    await writeDb(db);
    json(res, 200, {
      ok: true,
      delivery: order.delivery,
      message: order.delivery.ok
        ? `Покупка оплачена и отправлена на сервер. Списано ${formatMoney(price)}. Остаток: ${formatMoney(user.balance)}.`
        : `Покупка оплачена, но автовыдача ждет настройки API/RCON. Списано ${formatMoney(price)}. Остаток: ${formatMoney(user.balance)}.`
    });
    return;
  }

  if (pathname === "/api/ticket" && req.method === "POST") {
    const data = await readRequestBody(req);
    if (!data.name || !data.email || !data.message) {
      json(res, 400, { ok: false, message: "Заполните все поля обращения" });
      return;
    }
    const db = await readDb();
    db.tickets.push({ ...data, createdAt: new Date().toISOString() });
    await writeDb(db);
    json(res, 200, { ok: true, message: "Обращение сохранено" });
    return;
  }

  json(res, 404, { ok: false, message: "API route not found" });
}

function routePage(pathname) {
  if (pathname === "/") return homePage();
  if (pathname === "/store") return storePage();
  if (pathname === "/balance") return balancePage();
  if (pathname === "/rules_public" || pathname === "/pages/rules") return rulesPage();
  if (pathname === "/admins") return adminsPage();
  if (pathname === "/support") return supportPage();
  if (pathname === "/users") return usersPage();
  if (pathname === "/chat") return chatPage();
  if (pathname === "/banlist" || pathname === "/bans") {
    return simplePage("Баны", pathname, `<h2>Список банов</h2>
      <p class="note">После интеграции с бан-системой сервера здесь будут отображаться реальные баны: причина, срок, сколько осталось и платный разбан.</p>
      <div class="ban-search"><input id="ban-search" type="search" placeholder="Поиск по нику, Steam ID или причине"></div>
      <table>
        <thead>
          <tr>
            <th>Игрок</th>
            <th>Причина</th>
            <th>Срок бана</th>
            <th>Осталось</th>
            <th>Разбан</th>
          </tr>
        </thead>
        <tbody id="ban-rows">
          <tr><td colspan="5" class="empty-cell">Активных банов пока нет</td></tr>
        </tbody>
      </table>`);
  }
  if (pathname === "/forum" || pathname === "/news") {
    const title = pathname === "/forum" ? "Форум" : "Новости";
    return simplePage(title, pathname, `<h2>${title}</h2><p class="empty">Раздел пустой. Чужие сообщения и новости удалены.</p>`);
  }
  if (pathname === "/stats") {
    const title = "Статистика";
    return simplePage(title, pathname, `<h2>${title}</h2><p class="empty">Данные появятся после подключения статистики вашего сервера.</p>`);
  }
  if (pathname === "/demo") {
    return simplePage("Демо", "/demo", `<h2>Демо</h2><p class="empty">Раздел для загрузки демо-записей будет подключен позже.</p>`);
  }
  if (pathname === "/processing-of-personal-data") {
    return simplePage("Согласие на обработку персональных данных", pathname, `<h2>Согласие на обработку персональных данных</h2><p>Пользователь соглашается на обработку данных, отправленных через формы ${escapeHtml(BRAND.name)}.</p>`);
  }
  if (pathname === "/privacy-policy") {
    return simplePage("Политика конфиденциальности", pathname, `<h2>Политика конфиденциальности</h2><p>Мы используем данные только для работы игрового проекта ${escapeHtml(BRAND.name)}.</p>`);
  }
  if (pathname === "/clans" || pathname === "/giveaway") {
    const title = pathname === "/clans" ? "Кланы" : "Розыгрыш";
    return simplePage(title, pathname, `<h2>${title}</h2><p class="empty">Раздел пока пустой.</p>`);
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/__mirror/status") {
      json(res, 200, {
        app: BRAND.name,
        domain: BRAND.domain,
        server: BRAND.serverAddress,
        mode: "standalone",
        payments: {
          click: Boolean(process.env.CLICK_SERVICE_ID),
          payme: Boolean(process.env.PAYME_MERCHANT_ID)
        },
        delivery: {
          adminApi: Boolean(ADMIN_API_URL),
          rcon: Boolean(process.env.RCON_PASSWORD)
        },
        bans: {
          externalApi: Boolean(process.env.BAN_API_URL)
        }
      });
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      await staticAsset(res, url.pathname);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    const page = routePage(url.pathname.replace(/\/$/, "") || "/");
    if (page) {
      html(res, 200, page);
      return;
    }

    html(res, 404, pageShell({
      title: "Страница не найдена",
      pathName: url.pathname,
      content: `<section class="panel"><h2>404</h2><p class="empty">Такой страницы пока нет на ${escapeHtml(BRAND.name)}.</p></section>`
    }));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error.stack || error.message);
  }
});

server.listen(PORT, () => {
  console.log(`${BRAND.name} site: http://localhost:${PORT}`);
});
