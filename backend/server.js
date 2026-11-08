"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { MongoClient } = require("mongodb");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const sessions = new Map();
let database = { users: [], products: [], sales: [] };
let writeQueue = Promise.resolve();
let mongo;
let collections;

async function loadEnvironment() {
    try {
        const contents = await fs.readFile(path.join(__dirname, ".env"), "utf8");
        for (const line of contents.split(/\r?\n/)) {
            const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
            if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
        }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function loadDatabase() {
    mongo = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017");
    await mongo.connect();
    const db = mongo.db(process.env.MONGODB_DB || "xochilgest");
    collections = { users: db.collection("users"), products: db.collection("products"), sales: db.collection("sales") };
    await collections.users.createIndex({ email: 1 }, { unique: true });
    database = {
        users: await collections.users.find({}, { projection: { _id: 0 } }).toArray(),
        products: await collections.products.find({}, { projection: { _id: 0 } }).toArray(),
        sales: await collections.sales.find({}, { projection: { _id: 0 } }).toArray()
    };
}
function persist() {
    const snapshot = structuredClone(database);
    writeQueue = writeQueue.then(async () => {
        for (const [name, rows] of Object.entries(snapshot)) {
            await collections[name].deleteMany({});
            if (rows.length) await collections[name].insertMany(rows);
        }
    });
    return writeQueue;
}
function send(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(data));
}
function safeUser(user) { return { id: user.id, name: user.name, email: user.email }; }
function auth(req) {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
    const userId = match && sessions.get(match[1]);
    return userId ? database.users.find(user => user.id === userId) : null;
}
async function body(req) {
    let raw = "";
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1_000_000) throw Object.assign(new Error("La solicitud es demasiado grande."), { status: 413 });
    }
    try { return raw ? JSON.parse(raw) : {}; }
    catch { throw Object.assign(new Error("El cuerpo JSON no es válido."), { status: 400 }); }
}
function validText(value, max) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
}
function checkPassword(password, user) {
    const actual = crypto.scryptSync(password, user.salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(user.passwordHash, "hex"));
}
async function serveStatic(req, res, pathname) {
    const route = pathname === "/" ? "/index.html" : pathname;
    let file;
    try { file = path.resolve(FRONTEND, `.${decodeURIComponent(route)}`); }
    catch { return send(res, 400, { error: "Ruta no válida." }); }
    if (!file.startsWith(FRONTEND + path.sep)) return send(res, 403, { error: "Acceso denegado." });
    try {
        const stat = await fs.stat(file);
        if (!stat.isFile()) throw new Error("not a file");
        const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
        fs.createReadStream(file).pipe(res);
    } catch { send(res, 404, { error: "Archivo no encontrado." }); }
}
async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname;
    if (!route.startsWith("/api/")) return serveStatic(req, res, route);
    if (req.method === "GET" && route === "/api/health") return send(res, 200, { status: "ok" });
    if (req.method === "POST" && route === "/api/auth/register") {
        const data = await body(req);
        const name = typeof data.name === "string" ? data.name.trim() : "";
        const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
        if (!validText(name, 80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof data.password !== "string" || data.password.length < 8 || data.password.length > 128) return send(res, 400, { error: "Revisa tus datos. La contraseña debe tener entre 8 y 128 caracteres." });
        if (database.users.some(user => user.email === email)) return send(res, 409, { error: "Ya existe una cuenta con ese correo." });
        const credentials = hashPassword(data.password);
        database.users.push({ id: crypto.randomUUID(), name, email, ...credentials });
        await persist(); return send(res, 201, { message: "Cuenta creada." });
    }
    if (req.method === "POST" && route === "/api/auth/login") {
        const data = await body(req), email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
        const user = database.users.find(item => item.email === email);
        if (!user || typeof data.password !== "string" || !checkPassword(data.password, user)) return send(res, 401, { error: "Correo o contraseña incorrectos." });
        const token = crypto.randomBytes(32).toString("hex"); sessions.set(token, user.id);
        return send(res, 200, { token, user: safeUser(user) });
    }
    if (req.method === "POST" && route === "/api/auth/logout") {
        const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ""); if (match) sessions.delete(match[1]);
        return send(res, 200, { message: "Sesión cerrada." });
    }
    const user = auth(req);
    if (req.method === "GET" && route === "/api/auth/me") return user ? send(res, 200, { user: safeUser(user) }) : send(res, 401, { error: "Inicia sesión de nuevo." });
    if (!user) return send(res, 401, { error: "Inicia sesión para continuar." });
    const userProducts = () => database.products.filter(item => item.userId === user.id);
    if (req.method === "GET" && route === "/api/store") return send(res, 200, { products: userProducts(), sales: database.sales.filter(item => item.userId === user.id) });
    if (req.method === "POST" && route === "/api/products") {
        const data = await body(req);
        if (!validText(data.name, 100) || !validText(data.category, 60) || !Number.isFinite(data.price) || data.price <= 0 || !Number.isInteger(data.stock) || data.stock < 0) return send(res, 400, { error: "Datos de producto no válidos." });
        const product = { id: crypto.randomUUID(), userId: user.id, name: data.name.trim(), category: data.category.trim(), price: data.price, stock: data.stock };
        database.products.push(product); await persist(); return send(res, 201, { product });
    }
    const productRoute = /^\/api\/products\/([^/]+)$/.exec(route);
    if (productRoute) {
        const id = decodeURIComponent(productRoute[1]), product = userProducts().find(item => item.id === id);
        if (!product) return send(res, 404, { error: "Producto no encontrado." });
        if (req.method === "PUT") {
            const data = await body(req);
            if (!validText(data.name, 100) || !validText(data.category, 60) || !Number.isFinite(data.price) || data.price <= 0) return send(res, 400, { error: "Datos de producto no válidos." });
            product.name = data.name.trim(); product.category = data.category.trim(); product.price = data.price;
            await persist(); return send(res, 200, { product });
        }
        if (req.method === "DELETE") {
            if (database.sales.some(sale => sale.userId === user.id && sale.items.some(item => item.productId === id))) return send(res, 409, { error: "Este producto tiene ventas registradas y no se puede eliminar." });
            database.products = database.products.filter(item => item.id !== id); await persist(); return send(res, 200, { message: "Producto eliminado." });
        }
    }
    if (req.method === "POST" && route === "/api/sales") {
        const data = await body(req), product = userProducts().find(item => item.id === data.productId), quantity = data.quantity;
        if (!product || !Number.isInteger(quantity) || quantity < 1) return send(res, 400, { error: "Selecciona un producto y una cantidad válidos." });
        if (quantity > product.stock) return send(res, 409, { error: `Solo hay ${product.stock} unidades disponibles.` });
        product.stock -= quantity; const total = product.price * quantity;
        const sale = { id: crypto.randomUUID(), userId: user.id, date: new Date().toISOString(), items: [{ productId: product.id, productName: product.name, quantity, unitPrice: product.price, total }], total };
        database.sales.push(sale); await persist(); return send(res, 201, sale);
    }
    return send(res, 404, { error: "Ruta de API no encontrada." });
}

const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
        console.error(error);
        if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : "Error interno del servidor." });
        else res.destroy();
    });
});
loadEnvironment().then(loadDatabase).then(() => {
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, "0.0.0.0", () => console.log(`XochilGest disponible en http://localhost:${port}`));
}).catch(error => { console.error("No se pudo conectar con MongoDB o cargar la configuración:", error.message); process.exitCode = 1; });
