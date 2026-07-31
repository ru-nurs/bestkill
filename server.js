import dgram from "node:dgram";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
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
const PAYMENT_CARD_NUMBER = String(process.env.PAYMENT_CARD_NUMBER || "").trim();
const PAYMENT_CARD_DIGITS = PAYMENT_CARD_NUMBER.replace(/[^\d]/g, "");
const PAYMENT_CARD_HOLDER = String(process.env.PAYMENT_CARD_HOLDER || "").trim();
const PAYMENT_CARD_TYPE = String(process.env.PAYMENT_CARD_TYPE || "UZCARD / HUMO").trim();
const PAYMENT_SUPPORT_URL = String(process.env.PAYMENT_SUPPORT_URL || "").trim();
const MANUAL_PAYMENT_CONFIGURED = PAYMENT_CARD_DIGITS.length >= 12
  && PAYMENT_CARD_DIGITS.length <= 19
  && Boolean(PAYMENT_CARD_HOLDER);
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const SESSION_COOKIE = "oldera_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

function normalizeDb(db = {}) {
  db.users ||= [];
  db.sessions ||= [];
  db.orders ||= [];
  db.tickets ||= [];
  db.topups ||= [];
  db.payments ||= [];
  db.bans ||= [];
  db.messages ||= [];
  db.friendships ||= [];
  db.notifications ||= [];
  db.wallPosts ||= [];
  for (const user of db.users) user.profile ||= {};
  return db;
}

function emptyDb() {
  return normalizeDb({});
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json"
  };
}

async function readDb() {
  if (SUPABASE_CONFIGURED) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.oldera&select=data&limit=1`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(`Supabase read failed with HTTP ${response.status}`);
    const rows = await response.json();
    return normalizeDb(rows[0]?.data || {});
  }

  try {
    return normalizeDb(JSON.parse(await readFile(DB_FILE, "utf8")));
  } catch {
    return emptyDb();
  }
}

async function writeDb(db) {
  if (SUPABASE_CONFIGURED) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state?on_conflict=id`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id: "oldera",
        data: normalizeDb(db),
        updated_at: new Date().toISOString()
      })
    });
    if (!response.ok) throw new Error(`Supabase write failed with HTTP ${response.status}`);
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_200_000) {
      const error = new Error("Размер запроса превышает 2,2 МБ");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
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

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifyPassword(password, storedPassword) {
  const stored = String(storedPassword || "");
  if (!stored.startsWith("scrypt$")) return safeEqualText(password, stored);

  const [, salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

function sessionHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function isSecureRequest(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"
    || Boolean(req.socket.encrypted);
}

function setSessionCookie(req, res, token) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isSecureRequest(req)) attributes.push("Secure");
  res.setHeader("set-cookie", attributes.join("; "));
}

function clearSessionCookie(req, res) {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (isSecureRequest(req)) attributes.push("Secure");
  res.setHeader("set-cookie", attributes.join("; "));
}

function createUserSession(db, user) {
  const now = Date.now();
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  const token = randomBytes(32).toString("base64url");
  db.sessions.push({
    id: sessionHash(token),
    userLogin: user.login,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  });
  return token;
}

function currentUser(req, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const now = Date.now();
  const session = db.sessions.find((item) => item.id === sessionHash(token) && Date.parse(item.expiresAt) > now);
  if (!session) return null;
  return db.users.find((user) => user.login.toLowerCase() === String(session.userLogin).toLowerCase()) || null;
}

function publicUser(user) {
  const profile = user.profile || {};
  return {
    login: user.login,
    email: user.email,
    balance: Number(user.balance || 0),
    role: user.role || "Пользователь",
    createdAt: user.createdAt,
    profile: {
      displayName: String(profile.displayName || user.login),
      firstName: String(profile.firstName || ""),
      birthDate: String(profile.birthDate || ""),
      serverNick: String(profile.serverNick || ""),
      discord: String(profile.discord || ""),
      bio: String(profile.bio || ""),
      avatarData: validAvatarData(profile.avatarData) ? profile.avatarData : ""
    }
  };
}

function publicMember(user) {
  const member = publicUser(user);
  return {
    login: member.login,
    role: member.role,
    createdAt: member.createdAt,
    profile: member.profile
  };
}

function findUser(db, login) {
  const normalized = String(login || "").trim().toLowerCase();
  return db.users.find((user) => user.login.toLowerCase() === normalized) || null;
}

function validAvatarData(value) {
  const avatar = String(value || "");
  return avatar.length >= 100
    && avatar.length <= 450_000
    && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(avatar);
}

function addNotification(db, login, text, type = "info") {
  db.notifications.push({
    id: randomUUID(),
    login,
    text: String(text).slice(0, 240),
    type,
    createdAt: new Date().toISOString()
  });
}

function friendshipIncludes(friendship, login) {
  const normalized = String(login || "").toLowerCase();
  return friendship.users.some((item) => String(item).toLowerCase() === normalized);
}

function otherFriendLogin(friendship, login) {
  const normalized = String(login || "").toLowerCase();
  return friendship.users.find((item) => String(item).toLowerCase() !== normalized) || "";
}

function hasValidAdminPin(req, data = {}) {
  const expected = String(process.env.ADMIN_PIN || "");
  const provided = String(data.pin || data.secret || req.headers["x-admin-pin"] || "");
  return Boolean(expected) && safeEqualText(provided, expected);
}

function validReceiptData(value) {
  const receipt = String(value || "");
  return receipt.length >= 100
    && receipt.length <= 1_600_000
    && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(receipt);
}

function publicCardNumber() {
  return PAYMENT_CARD_DIGITS.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function publicSupportUrl() {
  try {
    const url = new URL(PAYMENT_SUPPORT_URL);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
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
    let replyTimer = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(replyTimer);
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
      const replies = [];
      socket.on("message", (reply) => {
        const text = reply.toString("utf8").replace(/^\xff{4}/, "").trim();
        if (text) replies.push(text);
        clearTimeout(replyTimer);
        replyTimer = setTimeout(() => {
          const message = replies.join("\n").trim() || "RCON command sent";
          finish({
            ok: !/bad rcon_password|invalid password/i.test(message),
            message
          });
        }, 350);
      });
      socket.send(packet, port, host);
    });
    socket.send(Buffer.from("\xff\xff\xff\xffchallenge rcon\n", "binary"), port, host);
  });
}

async function issueServerEntitlement(order) {
  const command = createIssueCommand(order);
  const { receiptData, ...deliveryOrder } = order;
  const payload = {
    action: "issue_service",
    server: BRAND.serverAddress,
    order: deliveryOrder,
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
  const storedBans = currentDb.bans
    .map(normalizeBan)
    .filter((ban) => !ban.bannedUntil || new Date(ban.bannedUntil).getTime() > Date.now());
  const rconBans = await queryRconBans();
  const seen = new Set();
  return [...storedBans, ...rconBans].filter((ban) => {
    const key = `${ban.kind || "steam"}:${ban.steamId || ban.ip || ban.player}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    ip: item.ip || "",
    kind: item.kind || (item.ip ? "ip" : "steam"),
    reason: item.reason || "No reason",
    duration: item.duration || item.length || (bannedUntil ? "temporary" : "permanent"),
    bannedAt,
    bannedUntil,
    remaining: remainingMinutes === null ? "permanent" : `${remainingMinutes} min`,
    admin: item.admin || ""
  };
}

function parseRconBanLines(output, kind) {
  const bans = [];
  const pattern = kind === "ip"
    ? /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
    : /\b(?:STEAM_[0-5]:[01]:\d+|VALVE_[0-5]:[01]:\d+)\b/gi;
  for (const line of String(output || "").split(/\r?\n/)) {
    if (/userid|players|hostname|map|server|bad rcon/i.test(line)) continue;
    const matches = line.match(pattern) || [];
    for (const value of matches) {
      bans.push(normalizeBan({
        id: `${kind}:${value}`,
        player: value,
        steamId: kind === "steam" ? value : "",
        ip: kind === "ip" ? value : "",
        kind,
        reason: "Бан на сервере",
        duration: "по списку сервера",
        remaining: "не указано",
        admin: "server"
      }));
    }
  }
  return bans;
}

async function queryRconBans() {
  if (!process.env.RCON_PASSWORD) return [];
  const [steamResponse, ipResponse] = await Promise.all([
    sendRconCommand("listid"),
    sendRconCommand("listip")
  ]);
  return [
    ...(steamResponse.ok ? parseRconBanLines(steamResponse.message, "steam") : []),
    ...(ipResponse.ok ? parseRconBanLines(ipResponse.message, "ip") : [])
  ];
}

function orderExpiresAt(order) {
  const days = parseDays(order.tariffName);
  if (!days) return "";
  const createdAt = Date.parse(order.deliveryFinishedAt || order.createdAt);
  if (!Number.isFinite(createdAt)) return "";
  return new Date(createdAt + days * 24 * 60 * 60 * 1000).toISOString();
}

function serviceRoleTitle(order) {
  const value = [order.service, order.serviceName].join(" ").toLowerCase();
  if (value.includes("moder")) return "Модератор";
  if (value.includes("admin") || value.includes("админ")) return "Администратор";
  if (value.includes("vip") || value.includes("вип")) return "VIP";
  if (value.includes("immunity") || value.includes("иммунитет")) return "VIP";
  return "";
}

function roleGroupId(role) {
  const value = String(role || "").toLowerCase();
  if (value.includes("владел")) return "owner";
  if (value.includes("гл.") || value.includes("главн")) return "head_admin";
  if (value.includes("админист")) return "admin";
  if (value.includes("модера")) return "moderator";
  if (value.includes("старост")) return "elder";
  if (value.includes("vip") || value.includes("вип")) return "vip";
  return "user";
}

function activeEntitlements(db) {
  const now = Date.now();
  return db.orders
    .filter((order) => order.status === "paid-issued")
    .map((order) => {
      const expiresAt = orderExpiresAt(order);
      return {
        id: order.id,
        login: order.login,
        nickname: order.nickname || "",
        steamId: order.steamId || "",
        service: order.service,
        serviceName: order.serviceName || "Услуга",
        tariffName: order.tariffName || "",
        role: serviceRoleTitle(order),
        issuedAt: order.deliveryFinishedAt || order.createdAt,
        expiresAt
      };
    })
    .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now)
    .sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt));
}

function buildRoleGroups(db) {
  const groups = ROLE_GROUPS.map((group) => ({ ...group, members: [] }));
  const pushMember = (role, nick, note) => {
    const group = groups.find((item) => item.id === roleGroupId(role)) || groups.at(-1);
    if (group.members.some((member) => member.nick.toLowerCase() === nick.toLowerCase())) return;
    group.members.push({ nick, note });
  };

  for (const user of db.users) {
    if (user.role && user.role !== "Пользователь") {
      pushMember(user.role, user.profile?.serverNick || user.profile?.displayName || user.login, "Профиль сайта");
    }
  }

  for (const item of activeEntitlements(db)) {
    if (!item.role) continue;
    const nick = item.nickname || item.steamId || item.login;
    const expires = item.expiresAt ? `до ${new Date(item.expiresAt).toLocaleDateString("ru-RU")}` : "навсегда";
    pushMember(item.role, nick, `${item.serviceName} · ${expires}`);
  }

  return groups;
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

function parseA2sPlayers(buffer) {
  if (buffer.length < 6 || buffer.readInt32LE(0) !== -1 || buffer[4] !== 0x44) return [];
  const players = [];
  let offset = 6;
  while (offset < buffer.length) {
    const slot = buffer[offset++];
    let name; [name, offset] = readCString(buffer, offset);
    if (offset + 8 > buffer.length) break;
    const score = buffer.readInt32LE(offset);
    offset += 4;
    const duration = buffer.readFloatLE(offset);
    offset += 4;
    players.push({
      slot,
      name: name || `Player ${slot}`,
      steamId: "",
      frags: score,
      time: formatPlayerDuration(duration),
      ping: 0,
      loss: 0,
      address: ""
    });
  }
  return players;
}

function formatPlayerDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

async function queryServerPlayers(address) {
  const { host, port } = splitAddress(address);
  const challengeRequest = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55, 0xff, 0xff, 0xff, 0xff]);

  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let done = false;
    const finish = (players) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve(players);
    };
    const timer = setTimeout(() => finish([]), 1800);

    socket.on("message", (message) => {
      try {
        if (message.length >= 9 && message.readInt32LE(0) === -1 && message[4] === 0x41) {
          const challenge = message.readInt32LE(5);
          const request = Buffer.alloc(9);
          request.writeInt32LE(-1, 0);
          request[4] = 0x55;
          request.writeInt32LE(challenge, 5);
          socket.send(request, port, host);
          return;
        }
        finish(parseA2sPlayers(message));
      } catch {
        finish([]);
      }
    });

    socket.once("error", () => finish([]));
    socket.send(challengeRequest, port, host);
  });
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

function parseRconStatus(output) {
  const result = { players: [], raw: String(output || "") };
  for (const rawLine of result.raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const hostname = line.match(/^hostname:\s*(.+)$/i);
    const map = line.match(/^map\s*:\s*([^\s]+)/i);
    const players = line.match(/^players\s*:\s*(\d+)\s+active\s+\((\d+)\s+max\)/i);
    const player = line.match(/^#\s*(\d+)\s+"([^"]+)"\s+(\d+)\s+(\S+)\s+(-?\d+)\s+(\S+)\s+(\d+)\s+(\d+)(?:\s+(\S+))?/);

    if (hostname) result.name = hostname[1].trim();
    if (map) result.map = map[1].trim();
    if (players) {
      result.playersCount = Number(players[1]);
      result.maxPlayers = Number(players[2]);
    }
    if (player) {
      result.players.push({
        slot: Number(player[1]),
        name: player[2],
        userid: player[3],
        steamId: player[4],
        frags: Number(player[5]),
        time: player[6],
        ping: Number(player[7]),
        loss: Number(player[8]),
        address: player[9] || ""
      });
    }
  }
  return result;
}

async function queryRconStatus() {
  if (!process.env.RCON_PASSWORD) return { ok: false, skipped: true, players: [] };
  const response = await sendRconCommand("status");
  if (!response.ok) return { ...response, players: [] };
  return { ok: true, ...parseRconStatus(response.message) };
}

async function serverLiveSnapshot(db = null) {
  const currentDb = db || await readDb();
  const [status, rconStatus, a2sPlayers, bans] = await Promise.all([
    serverStatus(),
    queryRconStatus(),
    queryServerPlayers(BRAND.serverAddress),
    getBans(currentDb).catch(() => [])
  ]);
  const players = rconStatus.players?.length ? rconStatus.players : a2sPlayers;
  const maxPlayers = rconStatus.maxPlayers || status.maxPlayers || 32;
  return {
    status: {
      ...status,
      name: rconStatus.name || status.name,
      map: rconStatus.map || status.map,
      players: Number.isFinite(rconStatus.playersCount) ? rconStatus.playersCount : status.players,
      maxPlayers,
      online: status.online || rconStatus.ok,
      rcon: Boolean(rconStatus.ok),
      checkedAt: new Date().toISOString()
    },
    players,
    bans,
    entitlements: activeEntitlements(currentDb),
    roleGroups: buildRoleGroups(currentDb)
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
    <button class="mobile-menu-toggle" id="mobile-menu-toggle" type="button" title="Открыть меню" aria-label="Открыть меню">☰</button>
    <nav class="nav" id="main-nav">${TOP_NAV.map(([href, label]) => `<a class="${active(href)}" href="${href}">${label}</a>`).join("")}</nav>
    <button class="user-mini" id="user-menu-button" data-modal="login">Войти на сайт</button>
    <div class="account-dropdown" id="account-dropdown" hidden></div>
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
  return `<section class="panel auth-panel" id="auth-panel">
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
    <h3>Сейчас онлайн <span id="live-online-count">${ONLINE_USERS.length}</span></h3>
    <div class="online-list" id="live-online-sidebar">
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
  const cardNumber = publicCardNumber();
  const supportUrl = publicSupportUrl();
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
            <section class="manual-payment-box ${MANUAL_PAYMENT_CONFIGURED ? "" : "not-configured"}">
              <span class="payment-step">Оплата переводом</span>
              ${MANUAL_PAYMENT_CONFIGURED ? `
                <p>Переведите точную сумму на карту, затем прикрепите чек. Услуга будет выдана автоматически после проверки администратором.</p>
                <div class="card-requisites">
                  <div><small>${escapeHtml(PAYMENT_CARD_TYPE)}</small><strong id="payment-card-number">${escapeHtml(cardNumber)}</strong></div>
                  <button type="button" class="copy-card" id="copy-card" title="Скопировать номер карты">⧉</button>
                </div>
                <div class="card-holder"><span>Получатель</span><b>${escapeHtml(PAYMENT_CARD_HOLDER)}</b></div>
                ${supportUrl ? `<a class="payment-support" href="${escapeHtml(supportUrl)}" target="_blank" rel="noopener">Вопрос по переводу — написать поддержке</a>` : ""}
              ` : `
                <p>Реквизиты ещё не настроены. Администратору нужно добавить номер карты в Render Environment.</p>
              `}
            </section>
            <div class="buyer-fields payment-proof-fields">
              <label>Имя отправителя<input name="payerName" maxlength="80" placeholder="Как указано при переводе" ${MANUAL_PAYMENT_CONFIGURED ? "required" : "disabled"}></label>
              <label>Номер или время операции<input name="transactionId" maxlength="100" placeholder="Например: 20:54 или ID перевода" ${MANUAL_PAYMENT_CONFIGURED ? "required" : "disabled"}></label>
              <label>Чек об оплате<input name="receipt" id="receipt-input" type="file" accept="image/jpeg,image/png,image/webp" ${MANUAL_PAYMENT_CONFIGURED ? "required" : "disabled"}></label>
            </div>
            <label class="check-row"><input type="checkbox" required checked> <span>Я принимаю условия оферты и правила проекта</span></label>
            <button class="primary purchase-submit" type="submit" ${MANUAL_PAYMENT_CONFIGURED ? "" : "disabled"}>Я перевёл — отправить на проверку</button>
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

function adminOrdersPage() {
  return pageShell({
    title: "Проверка заказов",
    pathName: "/admin/orders",
    content: `<section class="panel admin-orders-page">
      <div class="admin-orders-head">
        <div>
          <span>Админ-панель</span>
          <h2>Проверка переводов</h2>
          <p class="note">Сверьте сумму и чек. После подтверждения сайт сам отправит выдачу на игровой сервер.</p>
        </div>
        <button class="icon-btn" id="admin-logout" type="button" hidden>Выйти</button>
      </div>
      <form id="admin-orders-login" class="admin-login">
        <label>Admin PIN<input name="pin" type="password" autocomplete="current-password" required placeholder="Введите секретный PIN"></label>
        <button class="primary" type="submit">Открыть заказы</button>
        <div id="admin-login-result" class="result"></div>
      </form>
      <div id="admin-orders-workspace" hidden>
        <div class="admin-toolbar">
          <strong id="pending-count">Ожидают проверки: 0</strong>
          <button class="icon-btn" id="refresh-admin-orders" type="button">↻ Обновить</button>
        </div>
        <div id="admin-orders-list" class="admin-orders-list"></div>
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
  return `<div class="role-grid ${compact ? "compact" : ""}" data-live-role-groups="${compact ? "compact" : "full"}">
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
    <p class="note">Список подтягивается из ролей профилей и активных услуг, выданных через сайт.</p>
    ${roleGroupsHtml()}
    <table class="role-table"><thead><tr><th>#</th><th>Пользователь</th><th>Группа</th><th>Статус</th></tr></thead>
    <tbody id="live-admin-rows">${rows.length ? rows.map((item, index) => `<tr><td>${index + 1}</td><td><b style="color:${item.group.color}">${escapeHtml(item.member.nick)}</b></td><td>${escapeHtml(item.group.title)}</td><td>${escapeHtml(item.member.note)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-cell">Пользователей пока нет.</td></tr>`}</tbody></table>`);
}

function usersPage() {
  return simplePage("Пользователи", "/users", `<h2>Пользователи проекта</h2>
    <p class="note">Пользователей пока нет. Новые аккаунты появятся после регистрации.</p>
    ${roleGroupsHtml()}`);
}

function statsPage() {
  return simplePage("Статистика", "/stats", `<h2>Игровая статистика</h2>
    <p class="note">Онлайн, карта, игроки и активные привилегии обновляются автоматически с сервера.</p>
    <section class="live-grid">
      <article class="live-card"><span>Сервер</span><strong id="stats-server-state">Проверяем...</strong></article>
      <article class="live-card"><span>Карта</span><strong id="stats-map">Загрузка...</strong></article>
      <article class="live-card"><span>Игроков</span><strong id="stats-players-count">0/32</strong></article>
      <article class="live-card"><span>Банов</span><strong id="stats-bans-count">0</strong></article>
    </section>
    <h3>Игроки онлайн</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Ник</th><th>Steam ID</th><th>Счёт</th><th>Время</th><th>Пинг</th></tr></thead>
        <tbody id="live-player-rows"><tr><td colspan="6" class="empty-cell">Игроков онлайн пока нет</td></tr></tbody>
      </table>
    </div>
    <h3>Активные услуги</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Игрок</th><th>Услуга</th><th>Тариф</th><th>Действует до</th></tr></thead>
        <tbody id="live-service-rows"><tr><td colspan="4" class="empty-cell">Активных услуг пока нет</td></tr></tbody>
      </table>
    </div>`);
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

function accountPage() {
  return pageShell({
    title: "Личный кабинет",
    pathName: "/account",
    content: `<section class="account-workspace">
      <nav class="account-tabs" aria-label="Разделы личного кабинета">
        <button type="button" data-account-link="profile">Профиль</button>
        <button type="button" data-account-link="messages">Сообщения</button>
        <button type="button" data-account-link="friends">Друзья</button>
        <button type="button" data-account-link="settings">Настройки</button>
        <button type="button" data-account-link="balance">Баланс</button>
        <button type="button" data-account-link="notifications">Уведомления</button>
        <button type="button" data-account-link="services">Услуги</button>
      </nav>
      <section class="panel account-panel" id="account-panel">
        <div class="account-loading">Загружаем аккаунт...</div>
      </section>
    </section>`
  });
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
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#0b1019;color:var(--text);font-family:Arial,Helvetica,sans-serif;min-height:100vh;background-image:radial-gradient(circle at 50% 0,#2a3547 0,#111827 38%,#090d14 100%)}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}
.topbar{height:56px;background:#24232d;display:flex;justify-content:center;align-items:center;position:sticky;top:0;z-index:5;border-bottom:1px solid #343443}.nav{display:flex;gap:4px;height:100%}.nav a{display:flex;align-items:center;padding:0 20px;color:#bac4d4;font-weight:700;font-size:13px;text-transform:uppercase}.nav a.active,.nav a:hover{background:linear-gradient(135deg,#25b9dc,#f1549a);color:white;border-radius:0 0 8px 8px}.user-mini{position:absolute;right:28px;background:transparent;border:0;color:#c9d5e5;cursor:pointer}.crumb{max-width:1180px;margin:0 auto;padding:14px 18px;background:#303641;color:#aab4c4;font-size:13px}
.layout{max-width:1180px;margin:24px auto 40px;display:grid;grid-template-columns:270px 1fr;gap:24px;padding:0 18px}.sidebar{display:flex;flex-direction:column;gap:14px}.logo{min-height:118px;display:flex;align-items:center;justify-content:center;gap:12px}.logo-mark{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#8ee6ff;color:#0e1724;font-weight:900;box-shadow:0 0 30px #36d8ff}.logo strong{font-size:34px;color:white;text-shadow:0 0 10px #38d4ff,2px 2px #b52236}.side-actions{display:grid;gap:10px}.side-btn{background:#111d2c;border:1px solid #23344b;color:#d9e7f4;padding:12px 16px;border-radius:7px;text-align:center;font-weight:700}.side-btn:hover{border-color:var(--cyan)}.side-btn.accent{background:linear-gradient(135deg,#e947a2,#f58d30);color:white}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:22px;box-shadow:0 18px 45px #0008}.panel h2,.panel h3{margin:0 0 16px}.panel a{display:block;color:#aebbd0;padding:8px 0;border-bottom:1px solid #223043}.panel small{display:block;color:var(--muted);margin-top:4px}.main{display:grid;gap:24px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.icon-btn{background:#182336;border:1px solid #33465f;color:#dbe8f8;border-radius:7px;padding:7px 11px;cursor:pointer}
.table-wrap{overflow:auto;border-radius:8px;border:1px solid #2d3b4e}table{width:100%;border-collapse:collapse;background:#0d1521}th,td{border-bottom:1px solid #293648;border-right:1px solid #293648;padding:12px 14px;text-align:left;font-size:14px}th{color:#c4cee0;background:#111a27}.ip{color:#eaf4ff;font-weight:800}.meter{position:relative;display:block;min-width:86px;height:30px;background:#761927;border:1px solid #b53b52;border-radius:4px;overflow:hidden;text-align:center}.meter i,.total i{display:block;height:100%;background:repeating-linear-gradient(45deg,var(--cyan),var(--cyan) 4px,#62f0e1 4px,#62f0e1 8px)}.meter b{position:absolute;inset:0;display:grid;place-items:center;font-weight:500}.actions{white-space:nowrap}.small-btn{display:inline-grid!important;place-items:center;width:34px;height:28px;margin-right:6px;border-radius:4px;border:1px solid #ffffff30}.green{background:#176b35}.red{background:#7d1c2d}.gold{background:#a88929}.total{height:32px;position:relative;background:#7d1b2b;border:1px solid #bf3a51;border-radius:5px;overflow:hidden;margin-top:10px;text-align:center}.total span{position:absolute;inset:0;display:grid;place-items:center}
.empty-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.player-card{min-height:132px;border:1px solid #2b3b50;border-radius:8px;background:#0e1825;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.player-card span{color:#ffce48}.player-card b{margin:10px 0}.player-card small,.empty,.note,.policy{color:var(--muted);line-height:1.5}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}.status-pill{color:#9decc5;background:#143525;border:1px solid #26754f;border-radius:999px;padding:6px 10px;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid label{display:grid;gap:7px;color:#cbd7e7}.form-grid .wide{grid-column:1/-1}.stack-form{display:grid;gap:12px}.service-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:18px 0 24px}.service-card{display:grid;grid-template-columns:70px 1fr;gap:14px;align-items:start;background:#0c1624;border:1px solid #2f4056;border-radius:8px;padding:14px;position:relative;overflow:hidden}.service-card:before{content:"";position:absolute;inset:0;opacity:.16;background:linear-gradient(135deg,#2de2e6,#f84aa7,#ffb000);pointer-events:none}.service-card h3{margin:0 0 6px}.service-card strong{display:block;color:#fff;margin-bottom:8px}.service-card ul{margin:0;padding-left:18px;color:#b9c7d9;font-size:13px;line-height:1.55}.service-art{width:64px;height:64px;border-radius:8px;display:grid;place-items:center;background:#152033;border:1px solid #ffffff24;box-shadow:0 0 22px #000 inset}.service-art span{font-weight:900;font-size:13px;letter-spacing:.04em}.service-card.cyan .service-art{color:#55fff1;box-shadow:0 0 28px #26d6d0}.service-card.pink .service-art{color:#ff69ba;box-shadow:0 0 28px #f4469b}.service-card.gold .service-art{color:#ffe06c;box-shadow:0 0 28px #d6a72a}.service-card.green .service-art{color:#8dffa9;box-shadow:0 0 28px #27b05b}.service-card.orange .service-art{color:#ffb269;box-shadow:0 0 28px #f08b35}.balance-panel h2{margin-bottom:8px}input,select,textarea{width:100%;background:#0b1320;color:var(--text);border:1px solid #2d3d52;border-radius:6px;padding:12px}textarea{min-height:120px;resize:vertical}.primary{border:0;border-radius:7px;background:linear-gradient(135deg,#28c2e8,#f04c9c);color:white;padding:12px 18px;font-weight:800;cursor:pointer}.result{align-self:center}.success{color:#7df0a6}.error{color:#ff8998}.empty-cell{text-align:center;color:var(--muted)}.rules{line-height:1.9}
.account-panel{display:grid;gap:22px}.account-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:20px;border-bottom:1px solid #293648}.account-person{display:flex;align-items:center;gap:16px;min-width:0}.account-avatar{width:64px;height:64px;flex:0 0 64px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#25bfd8,#f0447e);color:#fff;font-size:28px;font-weight:900}.account-person h2{margin:0 0 5px}.account-person p{margin:0;color:var(--muted);overflow-wrap:anywhere}.account-actions{display:flex;gap:10px}.account-actions a,.account-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 14px;border:1px solid #3b4b61;background:#142033;color:#fff;font-weight:700;cursor:pointer}.account-actions button{border-color:#a92d40;background:#641522}.account-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.account-stat{padding:17px;background:#0b1421;border:1px solid #29394d}.account-stat span{display:block;margin-bottom:7px;color:var(--muted);font-size:13px}.account-stat strong{display:block;color:#fff;overflow-wrap:anywhere}.account-orders{display:grid;gap:10px}.account-orders h3{margin:0}.account-order{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:14px;background:#0b1421;border:1px solid #29394d}.account-order strong,.account-order small{display:block}.account-order small{margin-top:5px;color:var(--muted)}.account-order-status{align-self:center;color:#7df0a6;font-weight:700}.account-loading{padding:30px 0;text-align:center;color:var(--muted)}.auth-profile{display:grid;gap:8px}.auth-profile strong{font-size:19px;color:#fff;overflow-wrap:anywhere}.auth-profile span{color:var(--muted)}.auth-profile .auth-button{display:flex;align-items:center;justify-content:center;text-decoration:none}
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
.manual-payment-box{padding:16px;background:#101d2c;border:1px solid #31506a;border-radius:5px}.manual-payment-box.not-configured{border-color:#8b2736;background:#251018}.manual-payment-box p{margin:8px 0 14px;color:#afbed0;font-size:13px;line-height:1.5}.payment-step{color:#64e3d3;font-size:12px;font-weight:900;text-transform:uppercase}.card-requisites{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;background:#08111d;border:1px solid #273b50}.card-requisites small{display:block;margin:0 0 4px;color:#8797aa}.card-requisites strong{display:block;color:#fff;font-size:20px;letter-spacing:0;word-spacing:4px}.copy-card{width:40px;height:40px;flex:0 0 40px;background:#182b3d;border:1px solid #3d5a72;color:#fff;cursor:pointer}.card-holder{display:flex;justify-content:space-between;gap:16px;margin-top:10px;color:#98a8bb;font-size:13px}.card-holder b{color:#e4edf8;text-align:right}.payment-support{margin-top:10px!important;padding:8px 0 0!important;border-bottom:0!important;color:#63dfd1!important;font-size:13px}.payment-proof-fields input[type=file]{height:auto;padding:9px}.purchase-submit:disabled{cursor:not-allowed;filter:grayscale(1);opacity:.55}
.admin-orders-page{min-height:460px}.admin-orders-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.admin-orders-head span{display:block;margin-bottom:7px;color:#57ddcf;font-size:12px;font-weight:900;text-transform:uppercase}.admin-orders-head h2{margin-bottom:7px}.admin-login{display:grid;grid-template-columns:minmax(220px,390px) 190px;align-items:end;gap:12px;max-width:620px;margin-top:26px}.admin-login label{display:grid;gap:7px;color:#c9d5e4;font-weight:700}.admin-login .result{grid-column:1/-1}.admin-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:28px 0 16px;padding-top:20px;border-top:1px solid #27384c}.admin-orders-list{display:grid;gap:14px}.admin-order{display:grid;grid-template-columns:170px minmax(0,1fr);gap:18px;padding:16px;background:#09121e;border:1px solid #28394d;border-left:4px solid #e6a628}.admin-order[data-status="paid-issued"]{border-left-color:#32c875}.admin-order[data-status="rejected"]{border-left-color:#df4054}.admin-receipt{width:170px;height:190px;display:block;object-fit:contain;background:#050a11;border:1px solid #26374a;cursor:zoom-in}.admin-order-main{min-width:0}.admin-order-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.admin-order-title h3{margin:0 0 5px;color:#f1f6fd}.order-status{display:inline-block;padding:5px 8px;background:#302512;border:1px solid #6d5220;color:#ffd477;font-size:12px;white-space:nowrap}.order-status.paid-issued{background:#123021;border-color:#246a45;color:#7cf0aa}.order-status.rejected{background:#34131a;border-color:#7a2937;color:#ff96a5}.admin-order-price{display:block;margin:12px 0;color:#fff;font-size:22px}.admin-order-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 18px;color:#9faec0;font-size:13px}.admin-order-meta b{color:#dce7f4}.admin-order-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}.approve-order,.reject-order,.retry-order{border:0;padding:9px 13px;color:#fff;font-weight:800;cursor:pointer}.approve-order{background:#249858}.reject-order{background:#9b2638}.retry-order{background:#9b7926}.admin-empty{padding:42px 20px;text-align:center;color:#8999ad;border:1px dashed #31445a}
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
.home-promo{height:280px;min-height:280px;padding:26px 20px}.home-promo h2{font-size:26px}.home-promo p{font-size:14px}.purchase-panel{padding:22px 16px}.purchase-layout{grid-template-columns:1fr;gap:24px}.service-info-media{height:230px}.buyer-fields{grid-template-columns:1fr}.card-requisites strong{font-size:17px}.admin-login{grid-template-columns:1fr}.admin-order{grid-template-columns:1fr}.admin-receipt{width:100%;height:250px}.admin-order-title{display:grid}.admin-order-meta{grid-template-columns:1fr}.rules-page{padding:16px 12px;gap:18px}.rules-hero{min-height:110px;padding:24px 20px}.rules-hero h1,.rules-server-title{font-size:25px}.rule-section{padding:19px 14px}.rule-section>h2{font-size:23px}.rule-row{grid-template-columns:42px minmax(0,1fr);padding:13px 10px}.rule-row h3{font-size:15px}.account-head{align-items:flex-start;flex-direction:column}.account-actions{width:100%}.account-actions a,.account-actions button{flex:1}.account-stats{grid-template-columns:1fr}.account-order{grid-template-columns:1fr}.account-order-status{justify-self:start}
}
.mobile-menu-toggle{display:none}
.account-dropdown{position:absolute;right:max(12px,calc((100vw - 1300px)/2 + 12px));top:65px;z-index:18;width:310px;background:#fff;color:#252834;border:1px solid #d7dbe2;box-shadow:0 22px 50px #0009}
.account-dropdown a,.account-dropdown button{width:100%;min-height:48px;display:flex;align-items:center;justify-content:space-between;padding:11px 18px;border:0;border-bottom:1px solid #d4d7dc;background:#fff;color:#555d6d;text-align:left;cursor:pointer}
.account-dropdown a:hover,.account-dropdown button:hover{background:#f1f3f6;color:#111827}.account-dropdown [data-logout]{color:#9b2638}.account-dropdown[hidden]{display:none}
.user-mini.account-trigger{min-width:190px;display:grid;grid-template-columns:34px minmax(0,1fr) 14px;gap:9px;align-items:center;text-align:left}
.user-avatar-mini{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,#55d7df,#ef477d);color:#fff;font-weight:900}.user-avatar-mini img{width:100%;height:100%;object-fit:cover}.user-trigger-copy{min-width:0}.user-trigger-copy strong,.user-trigger-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.user-trigger-copy small{margin-top:2px;color:#9ca8ba}
.account-workspace{display:grid;gap:12px}.account-tabs{display:flex;overflow:auto;background:#0b1421;border:1px solid #28394d}.account-tabs button{min-height:46px;padding:10px 16px;border:0;border-right:1px solid #28394d;background:#0b1421;color:#aebacd;white-space:nowrap;cursor:pointer}.account-tabs button.active{background:#641522;color:#fff}
.account-panel{padding:0;overflow:hidden}.account-view[hidden]{display:none}.profile-cover{height:180px;background:linear-gradient(90deg,#07101dc4,#07101d45),url('/assets/oldera-bg.png') center 28%/cover no-repeat;position:relative}.profile-identity{display:flex;align-items:flex-end;gap:18px;padding:0 28px 24px;margin-top:-58px;position:relative}.profile-avatar{width:128px;height:128px;flex:0 0 128px;border:5px solid #0d1724;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,#55d7df,#ef477d);color:#fff;font-size:48px;font-weight:900}.profile-avatar img{width:100%;height:100%;object-fit:cover}.profile-name{min-width:0;padding-bottom:8px}.profile-name h2{margin:0 0 6px;font-size:27px}.profile-name p{margin:0;color:#98a6ba}.profile-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid #293648;border-bottom:1px solid #293648}.profile-summary>div{padding:18px 22px;border-right:1px solid #293648}.profile-summary>div:last-child{border-right:0}.profile-summary span{display:block;margin-bottom:6px;color:#8e9caf}.profile-summary strong{font-size:18px;color:#fff}
.account-role{color:#55708f;font-weight:800}.account-role.owner{color:#ff355d}.account-role.head-admin{color:#ffb02e}.account-role.admin{color:#36d7ff}.account-role.moderator{color:#b18cff}.account-role.elder{color:#63e68a}.account-role.vip{color:#ffe14a}.account-role.user{color:#55708f}
.profile-section{padding:26px 28px;border-bottom:1px solid #293648}.profile-section:last-child{border-bottom:0}.profile-section h3{margin:0 0 20px;font-size:22px}.profile-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:1px solid #293648}.profile-info-row{display:grid;grid-template-columns:130px minmax(0,1fr);gap:16px;padding:15px 17px;border-bottom:1px solid #293648}.profile-info-row:nth-last-child(-n+2){border-bottom:0}.profile-info-row span{color:#8e9caf}.profile-info-row strong{color:#dbe5f3;overflow-wrap:anywhere}.profile-bio{margin:0;color:#aebacd;line-height:1.65}
.account-list{display:grid;gap:10px}.account-list-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px;background:#0b1421;border:1px solid #29394d}.account-list-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#253247;color:#fff;font-weight:900}.account-list-avatar img{width:100%;height:100%;object-fit:cover}.account-list-copy{min-width:0}.account-list-copy strong,.account-list-copy small{display:block}.account-list-copy small{margin-top:4px;color:#8e9caf;overflow-wrap:anywhere}.account-list-item button{border:1px solid #8e2b3c;background:#641522;color:#fff;padding:8px 10px;cursor:pointer}
.account-empty{padding:24px;text-align:center;color:#8796aa;border:1px dashed #31445a}.account-form{display:grid;gap:13px}.account-form.two{grid-template-columns:repeat(2,minmax(0,1fr))}.account-form label{display:grid;gap:7px;color:#c8d3e2}.account-form .wide{grid-column:1/-1}.account-form input,.account-form textarea{background:#0b1421;border-color:#34465d}.account-form textarea{min-height:110px}.account-form-actions{display:flex;gap:10px;align-items:center}.account-form-actions button{min-height:42px}.avatar-preview-row{display:flex;align-items:center;gap:14px}.avatar-preview-row .profile-avatar{width:86px;height:86px;flex-basis:86px;border-width:3px;font-size:30px}.wall-editor{display:grid;gap:10px}.wall-editor textarea{min-height:120px;background:#fff;color:#17202d;border-color:#cad0d8}.wall-post{padding:16px;border:1px solid #29394d;background:#0b1421}.wall-post-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.wall-post time{color:#7f8da1}.wall-post p{margin:0;color:#d3deeb;white-space:pre-wrap;line-height:1.55}.section-title-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px}.section-title-row h2{margin:0}.section-title-row span{color:#7f8da1}.account-search-results{display:grid;gap:8px}.account-result{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px;background:#0b1421;border:1px solid #29394d}.account-result button{border:0;background:#277c50;color:#fff;padding:8px 11px;cursor:pointer}.notification-dot{width:10px;height:10px;border-radius:50%;background:#e3425b}.service-status{color:#77e7a2;font-weight:700}
.live-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0 28px}.live-card{padding:18px;background:#0b1421;border:1px solid #29394d}.live-card span{display:block;margin-bottom:7px;color:#8796aa;font-size:13px}.live-card strong{display:block;color:#fff;font-size:20px;overflow-wrap:anywhere}.panel h3+ .table-wrap{margin-top:12px}.live-card:first-child strong{color:#73f0a4}
@media (max-width:900px){
.topbar{height:78px;padding:0 12px;display:flex;justify-content:space-between;gap:10px}.mobile-menu-toggle{display:grid;place-items:center;width:48px;height:48px;flex:0 0 48px;border:1px solid #3b4352;background:#171a23;color:#dbe5f5;font-size:25px;cursor:pointer}.nav{display:none;position:absolute;left:12px;right:12px;top:70px;height:auto;width:auto!important;z-index:17;overflow:visible!important;background:#171a23;border:1px solid #3b4352;box-shadow:0 20px 45px #000b}.nav.show{display:grid}.nav a,.nav a.active{height:50px;min-width:0;border-radius:0;padding:0 18px;border-bottom:1px solid #323945;background:#171a23;font-size:14px}.nav a.active{color:#f44c81}.user-mini,.user-mini.account-trigger{position:relative;right:auto;display:grid;min-width:0;width:min(245px,calc(100vw - 86px));height:58px;padding:7px 10px;border-color:#333a48;background:#fff;color:#202532}.user-mini:not(.account-trigger){display:flex;align-items:center;justify-content:center}.user-trigger-copy small{color:#8892a2}.account-dropdown{position:absolute;top:68px;right:0;width:min(330px,calc(100vw - 62px));max-height:calc(100vh - 90px);overflow:auto}.crumb{height:58px;padding:0 18px}.layout{padding:18px 10px}.account-tabs{margin:0 -10px}.account-tabs button{padding:9px 13px}.account-panel{margin:0 -10px}.profile-cover{height:135px}.profile-identity{align-items:center;padding:0 18px 20px;margin-top:-44px}.profile-avatar{width:94px;height:94px;flex-basis:94px;font-size:34px}.profile-name h2{font-size:21px;overflow-wrap:anywhere}.profile-summary{grid-template-columns:1fr}.profile-summary>div{border-right:0;border-bottom:1px solid #293648}.profile-summary>div:last-child{border-bottom:0}.profile-section{padding:22px 18px}.profile-info-grid{grid-template-columns:1fr}.profile-info-row{grid-template-columns:105px minmax(0,1fr)}.profile-info-row:nth-last-child(2){border-bottom:1px solid #293648}.account-form.two{grid-template-columns:1fr}.account-form .wide{grid-column:auto}.account-form-actions{align-items:stretch;flex-direction:column}.account-form-actions button{width:100%}.account-list-item{grid-template-columns:42px minmax(0,1fr)}.account-list-item>button{grid-column:2;justify-self:start}.section-title-row{align-items:flex-start;flex-direction:column}.wall-editor textarea{min-height:150px}
.live-grid{grid-template-columns:1fr 1fr}
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

async function postJson(url, data, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(data)
  });
  const payload = await response.json();
  return { ...payload, httpStatus: response.status };
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function escapeText(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function formatAccountMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU') + ' сум';
}

let accountState = null;

function accountAvatar(user, className) {
  const profile = user.profile || {};
  const content = profile.avatarData
    ? '<img src="' + profile.avatarData + '" alt="' + escapeAttr(profile.displayName || user.login) + '">'
    : escapeText((profile.displayName || user.login).slice(0, 1).toUpperCase());
  return '<div class="' + className + '">' + content + '</div>';
}

function accountRoleClass(role) {
  const value = String(role || '').toLowerCase();
  if (value.includes('владел')) return 'owner';
  if (value.includes('гл.') || value.includes('главн')) return 'head-admin';
  if (value.includes('админист')) return 'admin';
  if (value.includes('модера')) return 'moderator';
  if (value.includes('старост')) return 'elder';
  if (value.includes('vip') || value.includes('вип')) return 'vip';
  return 'user';
}

function accountDate(value, withTime = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Не указано';
  return withTime ? date.toLocaleString('ru-RU') : date.toLocaleDateString('ru-RU');
}

function orderStatusLabel(status) {
  return ({
    'pending-payment-review': 'Ожидает проверки',
    'payment-confirming': 'Выполняется выдача',
    'paid-issued': 'Активна',
    'paid-pending-server-integration': 'Выдача ожидает',
    rejected: 'Отклонена'
  })[status] || status || 'Создана';
}

function currentAccountSection() {
  const section = location.hash.replace('#', '');
  return ['profile', 'messages', 'friends', 'settings', 'balance', 'notifications', 'services'].includes(section)
    ? section
    : 'profile';
}

function renderWallPosts(posts, user) {
  if (!posts.length) return '<div class="account-empty">На стене пока нет записей.</div>';
  return posts.map((post) =>
    '<article class="wall-post"><div class="wall-post-head"><strong>' +
    escapeText(user.profile?.displayName || user.login) + '</strong><time>' +
    accountDate(post.createdAt, true) + '</time></div><p>' + escapeText(post.text) + '</p></article>'
  ).join('');
}

function renderProfileView(data) {
  const user = data.user;
  const profile = user.profile || {};
  return '<div class="account-view" data-account-view="profile">' +
    '<div class="profile-cover"></div>' +
    '<div class="profile-identity">' + accountAvatar(user, 'profile-avatar') +
      '<div class="profile-name"><h2>' + escapeText(profile.displayName || user.login) + '</h2>' +
      '<p><span class="account-role ' + accountRoleClass(user.role) + '">' + escapeText(user.role) + '</span> · онлайн</p></div></div>' +
    '<div class="profile-summary">' +
      '<div><span>Баланс</span><strong>' + formatAccountMoney(user.balance) + '</strong></div>' +
      '<div><span>Скидка</span><strong>0%</strong></div>' +
      '<div><span>Друзья</span><strong>' + data.friends.length + '</strong></div>' +
    '</div>' +
    '<section class="profile-section"><h3>Общая информация</h3><div class="profile-info-grid">' +
      '<div class="profile-info-row"><span>ID</span><strong>' + escapeText(user.login) + '</strong></div>' +
      '<div class="profile-info-row"><span>Группа</span><strong class="account-role ' + accountRoleClass(user.role) + '">' + escapeText(user.role) + '</strong></div>' +
      '<div class="profile-info-row"><span>Регистрация</span><strong>' + accountDate(user.createdAt) + '</strong></div>' +
      '<div class="profile-info-row"><span>Ник на сервере</span><strong>' + escapeText(profile.serverNick || 'Не указан') + '</strong></div>' +
    '</div></section>' +
    '<section class="profile-section"><h3>Личные и контактные данные</h3><div class="profile-info-grid">' +
      '<div class="profile-info-row"><span>Имя</span><strong>' + escapeText(profile.firstName || 'Не указано') + '</strong></div>' +
      '<div class="profile-info-row"><span>Дата рождения</span><strong>' + escapeText(profile.birthDate || 'Не указана') + '</strong></div>' +
      '<div class="profile-info-row"><span>Discord</span><strong>' + escapeText(profile.discord || 'Не указан') + '</strong></div>' +
      '<div class="profile-info-row"><span>E-mail</span><strong>' + escapeText(user.email) + '</strong></div>' +
    '</div>' + (profile.bio ? '<p class="profile-bio">' + escapeText(profile.bio) + '</p>' : '') + '</section>' +
    '<section class="profile-section"><div class="section-title-row"><h3>Привилегии</h3><span>' + data.services.length + '</span></div>' +
      (data.services.length ? data.services.map((service) =>
        '<article class="account-list-item"><div class="account-list-avatar">★</div><div class="account-list-copy"><strong>' +
        escapeText(service.serviceName || 'Услуга') + '</strong><small>' +
        escapeText(service.tariffName || '') + ' · ' + accountDate(service.createdAt) +
        '</small></div><span class="service-status">' + escapeText(orderStatusLabel(service.status)) + '</span></article>'
      ).join('') : '<div class="account-empty">Привилегий пока нет.</div>') +
    '</section>' +
    '<section class="profile-section"><h3>Стена</h3><form id="wall-form" class="wall-editor">' +
      '<textarea name="text" maxlength="1000" placeholder="Напишите новую запись..." required></textarea>' +
      '<div class="account-form-actions"><button class="primary" type="submit">Опубликовать</button><div id="wall-result" class="result"></div></div>' +
    '</form><div class="account-list" id="wall-posts">' + renderWallPosts(data.wallPosts, user) + '</div></section>' +
  '</div>';
}

function renderMessagesView(data) {
  const items = data.messages.length ? data.messages.map((message) => {
    const outgoing = message.from.toLowerCase() === data.user.login.toLowerCase();
    const partner = outgoing ? message.to : message.from;
    return '<article class="account-list-item"><div class="account-list-avatar">' +
      escapeText(partner.slice(0, 1).toUpperCase()) + '</div><div class="account-list-copy"><strong>' +
      escapeText((outgoing ? 'Вы → ' : '') + partner) + '</strong><small>' +
      escapeText(message.text) + ' · ' + accountDate(message.createdAt, true) +
      '</small></div></article>';
  }).join('') : '<div class="account-empty">Сообщений пока нет.</div>';
  return '<div class="account-view" data-account-view="messages"><section class="profile-section">' +
    '<div class="section-title-row"><h2>Сообщения</h2><span>' + data.messages.length + '</span></div>' +
    '<form id="message-form" class="account-form"><label>Логин получателя<input name="to" maxlength="30" required placeholder="Логин пользователя"></label>' +
    '<label>Сообщение<textarea name="text" maxlength="1000" required placeholder="Введите сообщение"></textarea></label>' +
    '<div class="account-form-actions"><button class="primary" type="submit">Отправить</button><div id="message-result" class="result"></div></div></form>' +
    '<div class="account-list">' + items + '</div></section></div>';
}

function renderFriendsView(data) {
  const items = data.friends.length ? data.friends.map((friend) =>
    '<article class="account-list-item">' + accountAvatar(friend, 'account-list-avatar') +
    '<div class="account-list-copy"><strong>' + escapeText(friend.profile?.displayName || friend.login) +
    '</strong><small>' + escapeText(friend.login) + ' · ' + escapeText(friend.profile?.serverNick || 'игровой ник не указан') +
    '</small></div><button type="button" data-friend-action="remove" data-friend-login="' + escapeAttr(friend.login) + '">Удалить</button></article>'
  ).join('') : '<div class="account-empty">Список друзей пуст.</div>';
  return '<div class="account-view" data-account-view="friends"><section class="profile-section">' +
    '<div class="section-title-row"><h2>Друзья</h2><span>' + data.friends.length + '</span></div>' +
    '<form id="friend-search-form" class="account-form"><label>Найти пользователя<input name="q" minlength="2" maxlength="30" required placeholder="Логин, имя или игровой ник"></label>' +
    '<div class="account-form-actions"><button class="primary" type="submit">Найти</button><div id="friend-result" class="result"></div></div></form>' +
    '<div class="account-search-results" id="friend-search-results"></div><div class="account-list">' + items + '</div>' +
    '</section></div>';
}

function renderSettingsView(data) {
  const user = data.user;
  const profile = user.profile || {};
  return '<div class="account-view" data-account-view="settings"><section class="profile-section">' +
    '<div class="section-title-row"><h2>Настройки профиля</h2><span>' + escapeText(user.login) + '</span></div>' +
    '<form id="profile-form" class="account-form two">' +
      '<div class="wide avatar-preview-row">' + accountAvatar(user, 'profile-avatar') +
        '<label>Новый аватар<input id="avatar-input" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></label></div>' +
      '<label>Отображаемое имя<input name="displayName" maxlength="60" value="' + escapeAttr(profile.displayName || user.login) + '" required></label>' +
      '<label>Имя<input name="firstName" maxlength="40" value="' + escapeAttr(profile.firstName || '') + '"></label>' +
      '<label>Дата рождения<input name="birthDate" type="date" value="' + escapeAttr(profile.birthDate || '') + '"></label>' +
      '<label>Ник на сервере<input name="serverNick" maxlength="32" value="' + escapeAttr(profile.serverNick || '') + '"></label>' +
      '<label>Discord<input name="discord" maxlength="60" value="' + escapeAttr(profile.discord || '') + '"></label>' +
      '<label class="wide">О себе<textarea name="bio" maxlength="500">' + escapeText(profile.bio || '') + '</textarea></label>' +
      '<label class="check-row wide"><input name="removeAvatar" type="checkbox"> Удалить текущий аватар</label>' +
      '<div class="account-form-actions wide"><button class="primary" type="submit">Сохранить</button><div id="profile-result" class="result"></div></div>' +
    '</form></section></div>';
}

function renderBalanceView(data) {
  return '<div class="account-view" data-account-view="balance"><section class="profile-section">' +
    '<div class="section-title-row"><h2>Баланс</h2><span>Личный счёт</span></div>' +
    '<div class="profile-summary"><div><span>Доступно</span><strong>' + formatAccountMoney(data.user.balance) +
    '</strong></div><div><span>Скидка</span><strong>0%</strong></div><div><span>Заказов</span><strong>' +
    data.services.length + '</strong></div></div><div class="account-form-actions"><a class="primary" href="/store">Перейти в магазин</a></div>' +
    '</section></div>';
}

function renderNotificationsView(data) {
  const items = data.notifications.length ? data.notifications.map((item) =>
    '<article class="account-list-item"><span class="notification-dot"></span><div class="account-list-copy"><strong>' +
    escapeText(item.text) + '</strong><small>' + accountDate(item.createdAt, true) + '</small></div></article>'
  ).join('') : '<div class="account-empty">Уведомлений пока нет.</div>';
  return '<div class="account-view" data-account-view="notifications"><section class="profile-section">' +
    '<div class="section-title-row"><h2>Уведомления</h2><span>' + data.notifications.length + '</span></div>' +
    '<div class="account-list">' + items + '</div></section></div>';
}

function renderServicesView(data) {
  const items = data.services.length ? data.services.map((service) =>
    '<article class="account-list-item"><div class="account-list-avatar">★</div><div class="account-list-copy"><strong>' +
    escapeText(service.serviceName || 'Услуга') + '</strong><small>' + escapeText(service.tariffName || '') +
    ' · ' + Number(service.price || 0).toLocaleString('ru-RU') + ' сум · ' + accountDate(service.createdAt) +
    '</small></div><span class="service-status">' + escapeText(orderStatusLabel(service.status)) + '</span></article>'
  ).join('') : '<div class="account-empty">Услуг пока нет. Выберите привилегию в магазине.</div>';
  return '<div class="account-view" data-account-view="services"><section class="profile-section">' +
    '<div class="section-title-row"><h2>Мои услуги</h2><a class="primary" href="/store">Магазин</a></div>' +
    '<div class="account-list">' + items + '</div></section></div>';
}

function renderAccount(data) {
  const panel = qs('#account-panel');
  if (!panel) return;
  accountState = data;
  const section = currentAccountSection();
  const renderers = {
    profile: renderProfileView,
    messages: renderMessagesView,
    friends: renderFriendsView,
    settings: renderSettingsView,
    balance: renderBalanceView,
    notifications: renderNotificationsView,
    services: renderServicesView
  };
  panel.innerHTML = renderers[section](data);
  qsa('[data-account-link]').forEach((button) => button.classList.toggle('active', button.dataset.accountLink === section));
}

function applyCurrentUser(user) {
  const profile = user.profile || {};
  const topButton = qs('#user-menu-button');
  if (topButton) {
    const button = document.createElement('button');
    button.id = 'user-menu-button';
    button.className = 'user-mini account-trigger';
    button.type = 'button';
    button.dataset.accountToggle = 'true';
    button.innerHTML = accountAvatar(user, 'user-avatar-mini') +
      '<span class="user-trigger-copy"><strong>' + escapeText(profile.displayName || user.login) +
      '</strong><small class="account-role ' + accountRoleClass(user.role) + '">' + escapeText(user.role) + '</small></span><span>⌄</span>';
    topButton.replaceWith(button);
  }

  const dropdown = qs('#account-dropdown');
  if (dropdown) {
    dropdown.innerHTML =
      '<a href="/account#profile" data-account-link="profile">Мой профиль <span>›</span></a>' +
      '<a href="/account#messages" data-account-link="messages">Сообщения <span>›</span></a>' +
      '<a href="/account#friends" data-account-link="friends">Друзья <span>›</span></a>' +
      '<a href="/account#settings" data-account-link="settings">Настройки <span>›</span></a>' +
      '<a href="/account#balance" data-account-link="balance">Баланс: ' + formatAccountMoney(user.balance) + ' <span>›</span></a>' +
      '<a href="/account#notifications" data-account-link="notifications">Уведомления <span>›</span></a>' +
      '<a href="/account#services" data-account-link="services">Услуги <span>›</span></a>' +
      '<button type="button" data-logout>Выход <span>›</span></button>';
  }
  const authPanel = qs('#auth-panel');
  if (authPanel) {
    authPanel.innerHTML =
      '<h3>Личный кабинет</h3><div class="auth-profile"><strong>' +
      escapeText(profile.displayName || user.login) + '</strong><span>Баланс: ' +
      formatAccountMoney(user.balance) +
      '</span><a class="auth-button auth-red" href="/account">Открыть аккаунт</a>' +
      '<button class="auth-button auth-outline" type="button" data-logout>Выйти</button></div>';
  }

  const loginInput = qs('#order-form input[name="login"]');
  if (loginInput && !loginInput.value) loginInput.value = user.login;
}

async function loadAccountData() {
  const response = await fetch('/api/account/data');
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || 'Не удалось загрузить аккаунт');
  renderAccount(data);
}

async function bootSession() {
  try {
    const response = await fetch('/api/me');
    const data = await response.json();
    if (data.ok) {
      applyCurrentUser(data.user);
      if (qs('#account-panel')) await loadAccountData();
      return;
    }
  } catch {}

  const panel = qs('#account-panel');
  if (panel) {
    panel.innerHTML = '<h2>Войдите в аккаунт</h2><p class="note">Для просмотра личного кабинета нужна авторизация.</p>' +
      '<button class="primary" id="account-login-button" type="button">Войти на сайт</button>';
    qs('#account-login-button')?.addEventListener('click', () => openModal('login'));
  }
}

function receiptDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Прикрепите изображение чека'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Файл слишком большой. Максимум 8 МБ'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать чек'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось открыть изображение чека'));
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/jpeg', 0.72);
        if (result.length > 1600000) {
          reject(new Error('После обработки чек всё ещё слишком большой'));
          return;
        }
        resolve(result);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function avatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Выберите изображение аватара'));
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      reject(new Error('Файл слишком большой. Максимум 6 МБ'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать аватар'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось открыть изображение'));
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/jpeg', 0.72);
        if (result.length > 450000) {
          reject(new Error('Аватар после обработки превышает 450 КБ'));
          return;
        }
        resolve(result);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function refreshStatus() {
  const response = await fetch('/api/server-live');
  const data = await response.json();
  if (!data.ok) return;
  const status = data.status || {};
  const max = status.maxPlayers || 32;
  const players = status.players || 0;
  const percent = Math.min(100, Math.round(players / max * 100));
  qs('#server-map') && (qs('#server-map').textContent = status.map || 'Не определено');
  qs('#server-players') && (qs('#server-players').textContent = players + '/' + max);
  qs('#server-total') && (qs('#server-total').textContent = players + '/' + max);
  qs('#server-fill') && (qs('#server-fill').style.width = percent + '%');
  qs('#total-fill') && (qs('#total-fill').style.width = percent + '%');
  renderLiveOnline(data.players || []);
  renderLiveRoles(data.roleGroups || []);
  renderLiveAdmins(data.roleGroups || []);
  renderLiveStats(data);
}

function liveDate(value) {
  if (!value) return 'Навсегда';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Навсегда' : date.toLocaleDateString('ru-RU');
}

function renderLiveOnline(players) {
  const list = qs('#live-online-sidebar');
  qs('#live-online-count') && (qs('#live-online-count').textContent = String(players.length));
  if (!list) return;
  list.innerHTML = players.length ? players.slice(0, 10).map((player) =>
    '<article class="online-user" style="--user-color:#4fd7ff"><div class="avatar">' +
    escapeText(player.name.slice(0, 1).toUpperCase()) + '</div><div><b>' +
    escapeText(player.name) + '</b><small>Онлайн · ping ' + escapeText(player.ping || 0) + '</small></div></article>'
  ).join('') : '<p class="empty">Пока никого нет.</p>';
}

function renderLiveRoles(groups) {
  qsa('[data-live-role-groups]').forEach((root) => {
    const compact = root.dataset.liveRoleGroups === 'compact';
    const visible = compact ? groups.slice(0, 5) : groups;
    root.innerHTML = visible.map((group) =>
      '<article class="role-card" style="--role:' + escapeAttr(group.color) + '"><div class="role-title"><span></span><strong>' +
      escapeText(group.title) + '</strong></div><div class="role-members">' +
      (group.members && group.members.length ? group.members.map((member) =>
        '<div class="role-member"><b>' + escapeText(member.nick) + '</b><small>' + escapeText(member.note) + '</small></div>'
      ).join('') : '<p class="empty">Список пуст.</p>') +
      '</div></article>'
    ).join('');
  });
}

function renderLiveAdmins(groups) {
  const tbody = qs('#live-admin-rows');
  if (!tbody) return;
  const rows = groups.flatMap((group) => (group.members || []).map((member) => ({ group, member })));
  tbody.innerHTML = rows.length ? rows.map((item, index) =>
    '<tr><td>' + (index + 1) + '</td><td><b style="color:' + escapeAttr(item.group.color) + '">' +
    escapeText(item.member.nick) + '</b></td><td>' + escapeText(item.group.title) +
    '</td><td>' + escapeText(item.member.note) + '</td></tr>'
  ).join('') : '<tr><td colspan="4" class="empty-cell">Пользователей пока нет.</td></tr>';
}

function renderLiveStats(data) {
  const status = data.status || {};
  const max = status.maxPlayers || 32;
  qs('#stats-server-state') && (qs('#stats-server-state').textContent = status.online ? 'Онлайн' : 'Недоступен');
  qs('#stats-map') && (qs('#stats-map').textContent = status.map || 'Не определено');
  qs('#stats-players-count') && (qs('#stats-players-count').textContent = (status.players || 0) + '/' + max);
  qs('#stats-bans-count') && (qs('#stats-bans-count').textContent = String((data.bans || []).length));
  const playersRows = qs('#live-player-rows');
  if (playersRows) {
    const players = data.players || [];
    playersRows.innerHTML = players.length ? players.map((player, index) =>
      '<tr><td>' + (index + 1) + '</td><td>' + escapeText(player.name) + '</td><td>' +
      escapeText(player.steamId || '') + '</td><td>' + escapeText(player.frags || 0) +
      '</td><td>' + escapeText(player.time || '') + '</td><td>' + escapeText(player.ping || 0) + '</td></tr>'
    ).join('') : '<tr><td colspan="6" class="empty-cell">Игроков онлайн пока нет</td></tr>';
  }
  const serviceRows = qs('#live-service-rows');
  if (serviceRows) {
    const items = data.entitlements || [];
    serviceRows.innerHTML = items.length ? items.map((item) =>
      '<tr><td>' + escapeText(item.nickname || item.steamId || item.login) + '</td><td>' +
      escapeText(item.serviceName) + '</td><td>' + escapeText(item.tariffName) +
      '</td><td>' + escapeText(liveDate(item.expiresAt)) + '</td></tr>'
    ).join('') : '<tr><td colspan="4" class="empty-cell">Активных услуг пока нет</td></tr>';
  }
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
setInterval(refreshStatus, 10000);

qs('#register-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#register-result');
  const data = await postJson('/api/register', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
  if (data.ok) location.assign(data.redirect || '/account');
});

qs('#login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#login-result');
  const data = await postJson('/api/login', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
  if (data.ok) location.assign(data.redirect || '/account');
});

qs('#order-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#order-result');
  const button = qs('.purchase-submit', event.currentTarget);
  try {
    button && (button.disabled = true);
    result.className = 'result';
    result.textContent = 'Подготавливаем чек...';
    const payload = formData(event.currentTarget);
    const receipt = qs('#receipt-input')?.files?.[0];
    delete payload.receipt;
    payload.receiptData = await receiptDataUrl(receipt);
    const data = await postJson('/api/order', payload);
    result.className = 'result ' + (data.ok ? 'success' : 'error');
    result.textContent = data.message;
    if (data.ok) {
      event.currentTarget.reset();
      fillTariffs();
    }
  } catch (error) {
    result.className = 'result error';
    result.textContent = error.message;
  } finally {
    button && (button.disabled = false);
  }
});

qs('#copy-card')?.addEventListener('click', async () => {
  const number = qs('#payment-card-number')?.textContent || '';
  await navigator.clipboard.writeText(number.replace(/\s/g, ''));
  const button = qs('#copy-card');
  button.textContent = '✓';
  setTimeout(() => { button.textContent = '⧉'; }, 1400);
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

const adminStatusLabels = {
  'pending-payment-review': 'Ожидает проверки',
  'payment-confirming': 'Выполняется выдача',
  'paid-issued': 'Оплачен и выдан',
  'paid-pending-server-integration': 'Оплачен, выдача ожидает',
  rejected: 'Отклонён'
};

function adminPin() {
  try { return sessionStorage.getItem('olderaAdminPin') || ''; } catch { return ''; }
}

function renderAdminOrders(orders) {
  const list = qs('#admin-orders-list');
  if (!list) return;
  const pending = orders.filter((order) => order.status === 'pending-payment-review').length;
  qs('#pending-count').textContent = 'Ожидают проверки: ' + pending;
  if (!orders.length) {
    list.innerHTML = '<div class="admin-empty">Заказов пока нет</div>';
    return;
  }
  list.innerHTML = orders.map((order) => {
    const status = adminStatusLabels[order.status] || order.status;
    const canApprove = order.status === 'pending-payment-review';
    const canRetry = order.status === 'paid-pending-server-integration';
    const created = new Date(order.createdAt).toLocaleString('ru-RU');
    const receipt = order.receiptData
      ? '<a href="' + order.receiptData + '" target="_blank" rel="noopener"><img class="admin-receipt" src="' + order.receiptData + '" alt="Чек заказа"></a>'
      : '<div class="admin-receipt"></div>';
    return '<article class="admin-order" data-status="' + escapeText(order.status) + '">' +
      receipt +
      '<div class="admin-order-main">' +
        '<div class="admin-order-title"><div><h3>' + escapeText(order.serviceName) + '</h3><small>' + escapeText(order.id) + '</small></div>' +
        '<span class="order-status ' + escapeText(order.status) + '">' + escapeText(status) + '</span></div>' +
        '<strong class="admin-order-price">' + Number(order.price || 0).toLocaleString('ru-RU') + ' сум</strong>' +
        '<div class="admin-order-meta">' +
          '<span>Создан: <b>' + escapeText(created) + '</b></span>' +
          '<span>Тариф: <b>' + escapeText(order.tariffName) + '</b></span>' +
          '<span>Логин: <b>' + escapeText(order.login) + '</b></span>' +
          '<span>Игрок: <b>' + escapeText(order.steamId || order.nickname) + '</b></span>' +
          '<span>Отправитель: <b>' + escapeText(order.payerName) + '</b></span>' +
          '<span>Операция: <b>' + escapeText(order.transactionId) + '</b></span>' +
        '</div>' +
        (order.delivery?.message ? '<p class="note">Выдача: ' + escapeText(order.delivery.message) + '</p>' : '') +
        '<div class="admin-order-actions">' +
          (canApprove ? '<button class="approve-order" data-order-action="confirm" data-order-id="' + escapeText(order.id) + '">Подтвердить и выдать</button><button class="reject-order" data-order-action="reject" data-order-id="' + escapeText(order.id) + '">Отклонить</button>' : '') +
          (canRetry ? '<button class="retry-order" data-order-action="retry" data-order-id="' + escapeText(order.id) + '">Повторить выдачу</button>' : '') +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');
}

async function loadAdminOrders() {
  const pin = adminPin();
  if (!pin) return;
  const data = await postJson('/api/admin/orders/list', {}, { 'x-admin-pin': pin });
  const result = qs('#admin-login-result');
  if (!data.ok) {
    result.className = 'result error';
    result.textContent = data.message;
    return;
  }
  result.textContent = '';
  qs('#admin-orders-login').hidden = true;
  qs('#admin-orders-workspace').hidden = false;
  qs('#admin-logout').hidden = false;
  renderAdminOrders(data.orders || []);
}

qs('#admin-orders-login')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const pin = new FormData(event.currentTarget).get('pin') || '';
  try { sessionStorage.setItem('olderaAdminPin', pin); } catch {}
  await loadAdminOrders();
});

qs('#refresh-admin-orders')?.addEventListener('click', loadAdminOrders);
qs('#admin-logout')?.addEventListener('click', () => {
  try { sessionStorage.removeItem('olderaAdminPin'); } catch {}
  location.reload();
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-order-action]');
  if (!button) return;
  const action = button.dataset.orderAction;
  if (action === 'reject' && !confirm('Отклонить этот перевод?')) return;
  button.disabled = true;
  const data = await postJson('/api/admin/orders/action', {
    orderId: button.dataset.orderId,
    action
  }, { 'x-admin-pin': adminPin() });
  alert(data.message);
  await loadAdminOrders();
});

if (qs('#admin-orders-workspace') && adminPin()) loadAdminOrders();

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
setInterval(loadBans, 15000);

qs('#ticket-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = qs('#ticket-result');
  const data = await postJson('/api/ticket', formData(event.currentTarget));
  result.className = 'result ' + (data.ok ? 'success' : 'error');
  result.textContent = data.message;
});

qs('#mobile-menu-toggle')?.addEventListener('click', () => {
  qs('#main-nav')?.classList.toggle('show');
});

window.addEventListener('hashchange', () => {
  if (accountState && qs('#account-panel')) renderAccount(accountState);
});

document.addEventListener('click', async (event) => {
  const accountToggle = event.target.closest('[data-account-toggle]');
  const dropdown = qs('#account-dropdown');
  if (accountToggle && dropdown) {
    event.preventDefault();
    dropdown.hidden = !dropdown.hidden;
    qs('#main-nav')?.classList.remove('show');
    return;
  }

  const accountLink = event.target.closest('[data-account-link]');
  if (accountLink) {
    const section = accountLink.dataset.accountLink;
    if (location.pathname === '/account') {
      event.preventDefault();
      if (location.hash === '#' + section) renderAccount(accountState);
      else location.hash = section;
    }
    if (dropdown) dropdown.hidden = true;
    qs('#main-nav')?.classList.remove('show');
    return;
  }

  if (dropdown && !dropdown.hidden && !event.target.closest('#account-dropdown')) dropdown.hidden = true;

  const friendButton = event.target.closest('[data-friend-action]');
  if (friendButton) {
    friendButton.disabled = true;
    const data = await postJson('/api/account/friend', {
      action: friendButton.dataset.friendAction,
      login: friendButton.dataset.friendLogin
    });
    if (!data.ok) alert(data.message);
    await loadAccountData();
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id === 'profile-form') {
    event.preventDefault();
    const result = qs('#profile-result');
    const values = formData(form);
    const payload = {
      displayName: values.displayName,
      firstName: values.firstName,
      birthDate: values.birthDate,
      serverNick: values.serverNick,
      discord: values.discord,
      bio: values.bio,
      removeAvatar: Boolean(values.removeAvatar)
    };
    const file = qs('#avatar-input')?.files?.[0];
    try {
      result.className = 'result';
      result.textContent = 'Сохраняем...';
      if (file) payload.avatarData = await avatarDataUrl(file);
      const data = await postJson('/api/account/profile', payload);
      result.className = 'result ' + (data.ok ? 'success' : 'error');
      result.textContent = data.message;
      if (data.ok) {
        applyCurrentUser(data.user);
        await loadAccountData();
      }
    } catch (error) {
      result.className = 'result error';
      result.textContent = error.message;
    }
    return;
  }

  if (form.id === 'wall-form') {
    event.preventDefault();
    const result = qs('#wall-result');
    const data = await postJson('/api/account/wall', formData(form));
    result.className = 'result ' + (data.ok ? 'success' : 'error');
    result.textContent = data.message;
    if (data.ok) await loadAccountData();
    return;
  }

  if (form.id === 'message-form') {
    event.preventDefault();
    const result = qs('#message-result');
    const data = await postJson('/api/account/message', formData(form));
    result.className = 'result ' + (data.ok ? 'success' : 'error');
    result.textContent = data.message;
    if (data.ok) await loadAccountData();
    return;
  }

  if (form.id === 'friend-search-form') {
    event.preventDefault();
    const result = qs('#friend-result');
    const query = new FormData(form).get('q') || '';
    const response = await fetch('/api/account/users?q=' + encodeURIComponent(query));
    const data = await response.json();
    result.className = 'result ' + (data.ok ? 'success' : 'error');
    result.textContent = data.ok ? 'Найдено: ' + data.users.length : data.message;
    const list = qs('#friend-search-results');
    if (list) {
      list.innerHTML = data.ok && data.users.length ? data.users.map((user) =>
        '<article class="account-result"><div><strong>' + escapeText(user.profile?.displayName || user.login) +
        '</strong><small>' + escapeText(user.login) + '</small></div><button type="button" data-friend-action="add" data-friend-login="' +
        escapeAttr(user.login) + '">Добавить</button></article>'
      ).join('') : '<div class="account-empty">Пользователи не найдены.</div>';
    }
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-logout]');
  if (!button) return;
  button.disabled = true;
  await postJson('/api/logout', {});
  location.assign('/');
});

bootSession();
`;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/server-status" && req.method === "GET") {
    json(res, 200, await serverStatus());
    return;
  }

  if (pathname === "/api/server-live" && req.method === "GET") {
    const db = await readDb();
    json(res, 200, { ok: true, ...(await serverLiveSnapshot(db)) });
    return;
  }

  if (pathname === "/api/me" && req.method === "GET") {
    const db = await readDb();
    const user = currentUser(req, db);
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    const orders = db.orders
      .filter((order) => String(order.login || "").toLowerCase() === user.login.toLowerCase())
      .map((order) => ({
        id: order.id,
        service: order.service,
        serviceName: order.serviceName,
        tariffName: order.tariffName,
        price: order.price,
        status: order.status,
        createdAt: order.createdAt
      }))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    json(res, 200, { ok: true, user: publicUser(user), orders });
    return;
  }

  if (pathname === "/api/account/data" && req.method === "GET") {
    const db = await readDb();
    const user = currentUser(req, db);
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    const friendships = db.friendships.filter((item) => friendshipIncludes(item, user.login));
    const friends = friendships
      .map((item) => findUser(db, otherFriendLogin(item, user.login)))
      .filter(Boolean)
      .map(publicMember);
    const messages = db.messages
      .filter((item) => [item.from, item.to].some((login) => String(login).toLowerCase() === user.login.toLowerCase()))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100);
    const notifications = db.notifications
      .filter((item) => String(item.login).toLowerCase() === user.login.toLowerCase())
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100);
    const wallPosts = db.wallPosts
      .filter((item) => String(item.login).toLowerCase() === user.login.toLowerCase())
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100);
    const services = db.orders
      .filter((order) => String(order.login || "").toLowerCase() === user.login.toLowerCase())
      .map((order) => ({
        id: order.id,
        serviceName: order.serviceName,
        tariffName: order.tariffName,
        price: order.price,
        status: order.status,
        createdAt: order.createdAt
      }))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    json(res, 200, {
      ok: true,
      user: publicUser(user),
      friends,
      messages,
      notifications,
      wallPosts,
      services
    });
    return;
  }

  if (pathname === "/api/account/users" && req.method === "GET") {
    const db = await readDb();
    const user = currentUser(req, db);
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const users = query.length < 2 ? [] : db.users
      .filter((item) => item.login.toLowerCase() !== user.login.toLowerCase())
      .filter((item) => [item.login, item.profile?.displayName, item.profile?.serverNick].join(" ").toLowerCase().includes(query))
      .slice(0, 8)
      .map(publicMember);
    json(res, 200, { ok: true, users });
    return;
  }

  if (pathname === "/api/account/profile" && req.method === "POST") {
    const data = await readRequestBody(req);
    const db = await readDb();
    const user = currentUser(req, db);
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    const birthDate = String(data.birthDate || "").trim();
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      json(res, 400, { ok: false, message: "Некорректная дата рождения" });
      return;
    }
    if (data.avatarData && !validAvatarData(data.avatarData)) {
      json(res, 400, { ok: false, message: "Аватар должен быть изображением размером до 450 КБ" });
      return;
    }
    user.profile ||= {};
    user.profile.displayName = String(data.displayName || user.login).trim().slice(0, 60) || user.login;
    user.profile.firstName = String(data.firstName || "").trim().slice(0, 40);
    user.profile.birthDate = birthDate;
    user.profile.serverNick = String(data.serverNick || "").trim().slice(0, 32);
    user.profile.discord = String(data.discord || "").trim().slice(0, 60);
    user.profile.bio = String(data.bio || "").trim().slice(0, 500);
    if (data.removeAvatar) user.profile.avatarData = "";
    else if (data.avatarData) user.profile.avatarData = data.avatarData;
    await writeDb(db);
    json(res, 200, { ok: true, message: "Профиль сохранён", user: publicUser(user) });
    return;
  }

  if (pathname === "/api/account/wall" && req.method === "POST") {
    const data = await readRequestBody(req);
    const db = await readDb();
    const user = currentUser(req, db);
    const text = String(data.text || "").trim();
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    if (!text || text.length > 1000) {
      json(res, 400, { ok: false, message: "Сообщение должно содержать от 1 до 1000 символов" });
      return;
    }
    const post = { id: randomUUID(), login: user.login, text, createdAt: new Date().toISOString() };
    db.wallPosts.push(post);
    await writeDb(db);
    json(res, 201, { ok: true, message: "Запись опубликована", post });
    return;
  }

  if (pathname === "/api/account/friend" && req.method === "POST") {
    const data = await readRequestBody(req);
    const db = await readDb();
    const user = currentUser(req, db);
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    const target = findUser(db, data.login);
    if (!target || target.login.toLowerCase() === user.login.toLowerCase()) {
      json(res, 404, { ok: false, message: "Пользователь не найден" });
      return;
    }
    const existing = db.friendships.find((item) =>
      friendshipIncludes(item, user.login) && friendshipIncludes(item, target.login)
    );
    if (data.action === "remove") {
      db.friendships = db.friendships.filter((item) => item !== existing);
      await writeDb(db);
      json(res, 200, { ok: true, message: `${target.login} удалён из друзей` });
      return;
    }
    if (!existing) {
      db.friendships.push({
        id: randomUUID(),
        users: [user.login, target.login],
        createdAt: new Date().toISOString()
      });
      addNotification(db, target.login, `${user.login} добавил вас в друзья`, "friend");
      await writeDb(db);
    }
    json(res, 200, { ok: true, message: `${target.login} добавлен в друзья` });
    return;
  }

  if (pathname === "/api/account/message" && req.method === "POST") {
    const data = await readRequestBody(req);
    const db = await readDb();
    const user = currentUser(req, db);
    const target = findUser(db, data.to);
    const text = String(data.text || "").trim();
    if (!user) {
      json(res, 401, { ok: false, message: "Требуется авторизация" });
      return;
    }
    if (!target || target.login.toLowerCase() === user.login.toLowerCase()) {
      json(res, 404, { ok: false, message: "Получатель не найден" });
      return;
    }
    if (!text || text.length > 1000) {
      json(res, 400, { ok: false, message: "Сообщение должно содержать от 1 до 1000 символов" });
      return;
    }
    const message = {
      id: randomUUID(),
      from: user.login,
      to: target.login,
      text,
      createdAt: new Date().toISOString()
    };
    db.messages.push(message);
    addNotification(db, target.login, `Новое сообщение от ${user.login}`, "message");
    await writeDb(db);
    json(res, 201, { ok: true, message: "Сообщение отправлено", item: message });
    return;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const db = await readDb();
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      const id = sessionHash(token);
      db.sessions = db.sessions.filter((session) => session.id !== id);
      await writeDb(db);
    }
    clearSessionCookie(req, res);
    json(res, 200, { ok: true, message: "Вы вышли из аккаунта" });
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
    if (login.length < 3 || password.length < 6) {
      json(res, 400, { ok: false, message: "Логин должен быть от 3 символов, пароль — от 6 символов" });
      return;
    }

    const db = await readDb();
    if (db.users.some((user) => user.login.toLowerCase() === login.toLowerCase() || user.email === email)) {
      json(res, 409, { ok: false, message: "Такой логин или email уже зарегистрирован" });
      return;
    }

    const user = {
      id: randomUUID(),
      login,
      email,
      password: hashPassword(password),
      balance: 0,
      active: true,
      role: "Пользователь",
      profile: {
        displayName: login,
        firstName: "",
        birthDate: "",
        serverNick: "",
        discord: "",
        bio: "",
        avatarData: ""
      },
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    addNotification(db, user.login, `Добро пожаловать на ${BRAND.name}! Заполните профиль и укажите игровой ник.`, "welcome");
    const token = createUserSession(db, user);
    await writeDb(db);
    setSessionCookie(req, res, token);
    json(res, 201, {
      ok: true,
      message: "Аккаунт создан. Открываем личный кабинет...",
      redirect: "/account",
      user: publicUser(user)
    });
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

  if (pathname === "/api/admin/orders/list" && req.method === "POST") {
    const data = await readRequestBody(req);
    if (!hasValidAdminPin(req, data)) {
      json(res, 403, { ok: false, message: "Неверный Admin PIN" });
      return;
    }
    const db = await readDb();
    const orders = db.orders
      .filter((order) => order.paymentMethod === "manual-card")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    json(res, 200, { ok: true, orders });
    return;
  }

  if (pathname === "/api/admin/orders/action" && req.method === "POST") {
    const data = await readRequestBody(req);
    if (!hasValidAdminPin(req, data)) {
      json(res, 403, { ok: false, message: "Неверный Admin PIN" });
      return;
    }

    const action = String(data.action || "");
    const db = await readDb();
    const order = db.orders.find((item) => item.id === String(data.orderId || "") && item.paymentMethod === "manual-card");
    if (!order) {
      json(res, 404, { ok: false, message: "Заказ не найден" });
      return;
    }

    if (action === "reject") {
      if (order.status !== "pending-payment-review") {
        json(res, 409, { ok: false, message: "Этот заказ уже обработан" });
        return;
      }
      order.status = "rejected";
      order.reviewedAt = new Date().toISOString();
      await writeDb(db);
      json(res, 200, { ok: true, message: "Заказ отклонён. Услуга не выдавалась." });
      return;
    }

    const canIssue = action === "confirm" && order.status === "pending-payment-review";
    const canRetry = action === "retry" && order.status === "paid-pending-server-integration";
    if (!canIssue && !canRetry) {
      json(res, 409, { ok: false, message: "Этот заказ уже обработан или действие недоступно" });
      return;
    }

    order.status = "payment-confirming";
    order.reviewedAt ||= new Date().toISOString();
    order.deliveryStartedAt = new Date().toISOString();
    await writeDb(db);

    order.delivery = await issueServerEntitlement(order);
    order.deliveryFinishedAt = new Date().toISOString();
    order.status = order.delivery.ok ? "paid-issued" : "paid-pending-server-integration";
    await writeDb(db);
    json(res, 200, {
      ok: true,
      delivery: order.delivery,
      message: order.delivery.ok
        ? "Платёж подтверждён, услуга автоматически выдана на сервере."
        : `Платёж подтверждён, но сервер не принял выдачу: ${order.delivery.message}`
    });
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
    const user = db.users.find((item) =>
      (item.login.toLowerCase() === login.toLowerCase() || item.email === login.toLowerCase())
      && verifyPassword(password, item.password)
    );
    if (!user) {
      json(res, 401, { ok: false, message: "Неверный логин или пароль" });
      return;
    }
    if (!String(user.password).startsWith("scrypt$")) user.password = hashPassword(password);
    user.active = true;
    user.role ||= "Пользователь";
    const token = createUserSession(db, user);
    await writeDb(db);
    setSessionCookie(req, res, token);
    json(res, 200, {
      ok: true,
      message: "Вы вошли. Открываем личный кабинет...",
      redirect: "/account",
      user: publicUser(user)
    });
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
    if (!MANUAL_PAYMENT_CONFIGURED) {
      json(res, 503, { ok: false, message: "Реквизиты для перевода ещё не настроены" });
      return;
    }
    if (!String(data.payerName || "").trim() || !String(data.transactionId || "").trim()) {
      json(res, 400, { ok: false, message: "Укажите отправителя и номер операции" });
      return;
    }
    if (!validReceiptData(data.receiptData)) {
      json(res, 400, { ok: false, message: "Прикрепите корректное изображение чека размером до 1,6 МБ" });
      return;
    }

    const db = await readDb();
    const user = db.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    if (!user) {
      json(res, 404, { ok: false, message: "Пользователь с таким логином не найден" });
      return;
    }

    const price = tariff[1];
    const transactionId = String(data.transactionId).trim();
    const payerName = String(data.payerName).trim();
    const receiptData = String(data.receiptData);
    const receiptHash = createHash("sha256").update(receiptData).digest("hex");
    const duplicate = db.orders.find((item) => item.paymentMethod === "manual-card"
      && item.status !== "rejected"
      && (item.receiptHash === receiptHash
        || (String(item.transactionId || "").toLowerCase() === transactionId.toLowerCase()
          && String(item.payerName || "").toLowerCase() === payerName.toLowerCase()
          && Number(item.price) === Number(price))));
    if (duplicate) {
      json(res, 409, { ok: false, message: "Заказ с таким номером операции уже создан" });
      return;
    }

    const order = {
      id: randomUUID(),
      server: BRAND.serverAddress,
      login: user.login,
      nickname: String(data.nickname || "").trim(),
      steamId: String(data.steamId || "").trim(),
      bindType: String(data.bindType || ""),
      service: service.id,
      serviceName: service.name,
      tariffName: tariff[0],
      price,
      paymentMethod: "manual-card",
      payerName,
      transactionId,
      receiptData,
      receiptHash,
      status: "pending-payment-review",
      createdAt: new Date().toISOString()
    };
    db.orders.push(order);
    await writeDb(db);
    json(res, 200, {
      ok: true,
      orderId: order.id,
      message: `Заказ создан на ${formatMoney(price)}. Администратор проверит перевод, после подтверждения услуга выдастся автоматически.`
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
  if (pathname === "/account") return accountPage();
  if (pathname === "/balance") return balancePage();
  if (pathname === "/admin/orders") return adminOrdersPage();
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
    return statsPage();
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
          payme: Boolean(process.env.PAYME_MERCHANT_ID),
          manualCard: MANUAL_PAYMENT_CONFIGURED
        },
        persistence: SUPABASE_CONFIGURED ? "supabase" : "local-file",
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
    const status = Number(error.statusCode || 500);
    if (String(req.url || "").startsWith("/api/")) {
      json(res, status, { ok: false, message: status === 500 ? "Внутренняя ошибка сервера" : error.message });
      return;
    }
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(status === 500 ? "Внутренняя ошибка сервера" : error.message);
  }
});

server.listen(PORT, () => {
  console.log(`${BRAND.name} site: http://localhost:${PORT}`);
});
