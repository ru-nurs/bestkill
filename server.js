import dgram from "node:dgram";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "oldera.json");

const BRAND = {
  name: "OLDERA.UZ",
  domain: "oldera.uz",
  serverName: "Oldera Zombie Server",
  serverAddress: "195.158.4.108:27047"
};

const NAV = [
  ["/", "Главная"],
  ["/store", "Магазин"],
  ["/banlist", "Баны"],
  ["/admins", "Администраторы"],
  ["/rules_public", "Правила"],
  ["/chat", "Чат сервера"],
  ["/stats", "Статистика"],
  ["/demo", "Демо"]
];

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

async function readDb() {
  try {
    return JSON.parse(await readFile(DB_FILE, "utf8"));
  } catch {
    return { users: [], orders: [], tickets: [] };
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
    <nav class="nav">${NAV.map(([href, label]) => `<a class="${active(href)}" href="${href}">${label}</a>`).join("")}</nav>
    <button class="user-mini" data-modal="login">Войти</button>
  </header>
  <div class="crumb">Главная страница${pathName === "/" ? "" : " / " + escapeHtml(title)}</div>
  <main class="layout">
    <aside class="sidebar">
      <a class="logo" href="/" aria-label="${escapeHtml(BRAND.name)}">
        <span class="logo-mark">O</span>
        <strong>${escapeHtml(BRAND.name)}</strong>
      </a>
      <div class="side-actions">
        <a href="/news" class="side-btn">★ Подписка</a>
        <a href="/clans" class="side-btn">♣ Кланы</a>
        <a href="/giveaway" class="side-btn accent">🎁 Розыгрыш</a>
        <a href="steam://connect/${BRAND.serverAddress}" class="side-btn">⬇ Подключиться к серверу</a>
      </div>
      <section class="panel">
        <h3>Сервер</h3>
        <a href="steam://connect/${BRAND.serverAddress}">${escapeHtml(BRAND.serverName)}</a>
        <small>${escapeHtml(BRAND.serverAddress)}</small>
      </section>
      <section class="panel">
        <h3>Навигация</h3>
        ${NAV.slice(1).map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}
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
      <section class="panel">
        <div class="panel-head">
          <h2>ТОП игроки</h2>
          <span class="status-pill">данные будут подключены позже</span>
        </div>
        <div class="empty-grid">
          ${Array.from({ length: 5 }, (_, i) => `<div class="player-card empty"><span>#${i + 1}</span><b>Свободно</b><small>Статистика пока пустая</small></div>`).join("")}
        </div>
      </section>
      <section class="panel two-col">
        <div>
          <h2>Новости проекта</h2>
          <p class="empty">Новостей пока нет. Здесь будут объявления ${escapeHtml(BRAND.name)}.</p>
        </div>
        <div>
          <h2>Чат сервера</h2>
          <p class="empty">Чат пустой. Сообщения чужого проекта здесь не отображаются.</p>
        </div>
      </section>`
  });
}

function storePage() {
  return pageShell({
    title: "Магазин",
    pathName: "/store",
    content: `${serverTable()}
      <section class="panel store">
        <h2>Покупка привилегий</h2>
        <p class="note">Форма принимает заявку на покупку. Автоматическая выдача на CS-сервер требует подключения платежки и доступа к управлению сервером.</p>
        <form id="order-form" class="form-grid">
          <label>Сервер<select name="server"><option value="${BRAND.serverAddress}">${BRAND.serverName}</option></select></label>
          <label>Услуга<select name="service" id="service-select">${SERVICES.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select></label>
          <label>Тариф<select name="tariff" id="tariff-select"></select></label>
          <label>Тип привязки<select name="bindType"><option>Ник + пароль</option><option>STEAM ID</option><option>STEAM ID + пароль</option></select></label>
          <label>Ник игрока<input name="nickname" maxlength="32" placeholder="Введите ник"></label>
          <label>STEAM ID<input name="steamId" maxlength="40" placeholder="STEAM_0:0:000000"></label>
          <button class="primary" type="submit">Оставить заявку</button>
          <div id="order-result" class="result"></div>
        </form>
      </section>`
  });
}

function simplePage(title, pathName, body) {
  return pageShell({ title, pathName, content: `${serverTable()}<section class="panel">${body}</section>` });
}

function adminsPage() {
  return simplePage("Администраторы", "/admins", `<h2>Администраторы</h2>
    <p class="empty">Список администраторов пустой. Чужие пользователи и услуги удалены.</p>
    <table><thead><tr><th>#</th><th>Пользователь</th><th>Идентификатор</th><th>Услуги</th></tr></thead>
    <tbody><tr><td colspan="4" class="empty-cell">Пока нет администраторов</td></tr></tbody></table>`);
}

function rulesPage() {
  return simplePage("Правила", "/rules_public", `<h2>Правила проекта</h2>
    <ol class="rules">
      <li>Играйте честно и уважайте других игроков.</li>
      <li>Запрещены читы, скрипты, обходы банов и вредные команды.</li>
      <li>Запрещены оскорбления, реклама и провокации.</li>
      <li>Администрация ${escapeHtml(BRAND.name)} может обновлять правила по мере развития проекта.</li>
    </ol>`);
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
.empty-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.player-card{min-height:132px;border:1px solid #2b3b50;border-radius:8px;background:#0e1825;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.player-card span{color:#ffce48}.player-card b{margin:10px 0}.player-card small,.empty,.note,.policy{color:var(--muted);line-height:1.5}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}.status-pill{color:#9decc5;background:#143525;border:1px solid #26754f;border-radius:999px;padding:6px 10px;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid label{display:grid;gap:7px;color:#cbd7e7}.form-grid .wide{grid-column:1/-1}input,select,textarea{width:100%;background:#0b1320;color:var(--text);border:1px solid #2d3d52;border-radius:6px;padding:12px}textarea{min-height:120px;resize:vertical}.primary{border:0;border-radius:7px;background:linear-gradient(135deg,#28c2e8,#f04c9c);color:white;padding:12px 18px;font-weight:800;cursor:pointer}.result{align-self:center}.success{color:#7df0a6}.error{color:#ff8998}.empty-cell{text-align:center;color:var(--muted)}.rules{line-height:1.9}
.modal{position:fixed;inset:0;background:#0009;display:none;align-items:center;justify-content:center;z-index:20;padding:20px}.modal.show{display:flex}.dialog{width:min(420px,100%);background:#111a27;border:1px solid #34445a;border-radius:10px;padding:24px;position:relative}.dialog form{display:grid;gap:12px}.close{position:absolute;right:14px;top:10px;background:transparent;border:0;color:white;font-size:28px;cursor:pointer}
.footer{max-width:1180px;margin:40px auto 0;padding:34px 18px 52px;display:grid;grid-template-columns:2fr 1fr 1fr 1.2fr;gap:28px;color:#aeb8c7;border-top:1px solid #273343}.footer a{display:block;color:#aeb8c7;margin:8px 0}.footer-logo{color:#fff!important;font-size:24px;font-weight:900}.footer p{line-height:1.6}.monitor{padding:0}.monitor .panel-head{padding:18px 22px}.monitor .table-wrap{border-left:0;border-right:0;border-radius:0}.monitor .total{margin:10px 12px 12px}
@media (max-width:900px){.layout{grid-template-columns:1fr}.nav{overflow:auto;justify-content:flex-start;width:100%}.nav a{padding:0 12px;white-space:nowrap}.empty-grid{grid-template-columns:1fr 1fr}.two-col,.form-grid,.footer{grid-template-columns:1fr}.user-mini{display:none}}
`;
}

function clientScript() {
  return `
const services = ${JSON.stringify(SERVICES)};

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
  tariff.innerHTML = selected.tariffs.map(([name, price]) => '<option value="' + name + '">' + name + ' - ' + price.toLocaleString('ru-RU') + ' сум</option>').join('');
}

qs('#refresh-status')?.addEventListener('click', refreshStatus);
qs('#service-select')?.addEventListener('change', fillTariffs);
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

    db.users.push({ login, email, password, active: false, createdAt: new Date().toISOString() });
    await writeDb(db);
    json(res, 200, { ok: true, message: "Регистрация принята. Аккаунт создан в тестовом режиме." });
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
    if (!data.nickname && !data.steamId) {
      json(res, 400, { ok: false, message: "Укажите ник или STEAM ID для привязки" });
      return;
    }
    const db = await readDb();
    db.orders.push({ ...data, status: "pending-integration", createdAt: new Date().toISOString() });
    await writeDb(db);
    json(res, 200, { ok: true, message: "Заявка сохранена. Автовыдача на сервер будет подключена после RCON/AMXX и платежки." });
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
  if (pathname === "/rules_public" || pathname === "/pages/rules") return rulesPage();
  if (pathname === "/admins") return adminsPage();
  if (pathname === "/support") return supportPage();
  if (pathname === "/banlist" || pathname === "/bans") {
    return simplePage("Баны", pathname, `<h2>Список банов</h2>
      <p class="note">После интеграции с бан-системой сервера здесь будут отображаться реальные баны: причина, срок, сколько осталось и платный разбан.</p>
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
        <tbody>
          <tr><td colspan="5" class="empty-cell">Активных банов пока нет</td></tr>
        </tbody>
      </table>`);
  }
  if (pathname === "/forum" || pathname === "/chat" || pathname === "/news") {
    const title = pathname === "/forum" ? "Форум" : pathname === "/chat" ? "Чат сервера" : "Новости";
    return simplePage(title, pathname, `<h2>${title}</h2><p class="empty">Раздел пустой. Чужие сообщения и новости удалены.</p>`);
  }
  if (pathname === "/users" || pathname === "/stats") {
    const title = pathname === "/users" ? "Пользователи" : "Статистика";
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
        mode: "standalone"
      });
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
