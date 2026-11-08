"use strict";
const $ = (id) => document.getElementById(id);
const API = "/api";
const TOKEN_KEY = "xochilgest_token";
let token = localStorage.getItem(TOKEN_KEY);
let products = [];
let sales = [];
let editingId = null;

async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 && path !== "/auth/login") logout(false);
        throw new Error(body.error || "No se pudo completar la solicitud.");
    }
    return body;
}

function money(value) {
    return Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function showMessage(id, text, type = "success") {
    const element = $(id); element.textContent = text; element.className = `message ${type}`;
}
function clearMessage(id) { $(id).textContent = ""; $(id).className = "message"; }
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function showView(view) {
    $("loginView").classList.toggle("hidden", view !== "login");
    $("registerView").classList.toggle("hidden", view !== "register");
    $("appView").classList.toggle("hidden", view !== "app");
}
function setBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = busy; button.setAttribute("aria-busy", String(busy)); }
}
function handleError(id, error) { showMessage(id, error.message || "Ocurrió un error.", "error"); }

$("showRegister").addEventListener("click", () => { clearMessage("registerMessage"); showView("register"); });
$("showLogin").addEventListener("click", () => { clearMessage("loginMessage"); showView("login"); });

$("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
    try {
        await request("/auth/register", { method: "POST", body: JSON.stringify({ name: $("registerName").value.trim(), email: $("registerEmail").value.trim(), password: $("registerPassword").value }) });
        form.reset(); showMessage("loginMessage", "Cuenta creada. Ahora puedes iniciar sesión."); showView("login");
    } catch (error) { handleError("registerMessage", error); } finally { setBusy(form, false); }
});

$("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
    try {
        const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: $("loginEmail").value.trim(), password: $("loginPassword").value }) });
        token = result.token; localStorage.setItem(TOKEN_KEY, token); form.reset(); clearMessage("loginMessage"); await openApp(result.user);
    } catch (error) { handleError("loginMessage", error); } finally { setBusy(form, false); }
});

function logout(callApi = true) {
    const oldToken = token; token = null; localStorage.removeItem(TOKEN_KEY);
    if (callApi && oldToken) fetch(`${API}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${oldToken}` } }).catch(() => {});
    showView("login");
}
$("logoutBtn").addEventListener("click", () => logout());

async function openApp(user) {
    $("welcomeUser").textContent = `Hola, ${user.name}`; showView("app");
    try { await refreshData(); } catch (error) { logout(false); showMessage("loginMessage", error.message, "error"); }
}
async function refreshData() {
    const data = await request("/store"); products = data.products; sales = data.sales; renderAll();
}

document.querySelectorAll(".tab-btn").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== button.dataset.tab));
}));

function resetProductForm() {
    editingId = null; $("productForm").reset(); $("productId").value = ""; $("productStock").disabled = false;
    $("saveProductBtn").textContent = "Guardar producto"; $("cancelEditBtn").classList.add("hidden"); clearMessage("productMessage");
}
$("cancelEditBtn").addEventListener("click", resetProductForm);
$("productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = { name: $("productName").value.trim(), category: $("productCategory").value.trim(), price: Number($("productPrice").value), stock: Number($("productStock").value) };
    if (!payload.name || !payload.category || !Number.isFinite(payload.price) || payload.price <= 0 || !Number.isInteger(payload.stock) || payload.stock < 0) return showMessage("productMessage", "Revisa el nombre, la categoría, el precio y las existencias.", "error");
    try {
        if (editingId) { await request(`/products/${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify({ ...payload, stock: undefined }) }); showMessage("productMessage", "Producto actualizado."); }
        else { await request("/products", { method: "POST", body: JSON.stringify(payload) }); showMessage("productMessage", "Producto registrado."); }
        resetProductForm(); await refreshData();
    } catch (error) { handleError("productMessage", error); }
});
function editProduct(id) {
    const product = products.find(item => item.id === id); if (!product) return;
    editingId = id; $("productId").value = id; $("productName").value = product.name; $("productCategory").value = product.category; $("productPrice").value = product.price; $("productStock").value = product.stock; $("productStock").disabled = true;
    $("saveProductBtn").textContent = "Guardar cambios"; $("cancelEditBtn").classList.remove("hidden"); $("productMessage").textContent = "Edita el nombre, la categoría o el precio. El stock se conserva.";
    $("productForm").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function deleteProduct(id) {
    const product = products.find(item => item.id === id); if (!product || !confirm(`¿Eliminar el producto "${product.name}"?`)) return;
    try { await request(`/products/${encodeURIComponent(id)}`, { method: "DELETE" }); if (editingId === id) resetProductForm(); await refreshData(); }
    catch (error) { alert(error.message); }
}
$("productsTable").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]"); if (!button) return;
    if (button.dataset.action === "edit") editProduct(button.dataset.id);
    if (button.dataset.action === "delete") deleteProduct(button.dataset.id);
});
$("productSearch").addEventListener("input", renderProducts);
$("inventorySearch").addEventListener("input", renderInventory);

function renderProducts() {
    const query = $("productSearch").value.trim().toLowerCase();
    const filtered = products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(query));
    $("productsTable").innerHTML = filtered.length ? filtered.map(product => `<tr><td>${escapeHTML(product.name)}</td><td>${escapeHTML(product.category)}</td><td>${money(product.price)}</td><td>${product.stock}</td><td><button class="action-btn edit-btn" data-action="edit" data-id="${escapeHTML(product.id)}">Editar</button><button class="action-btn delete-btn" data-action="delete" data-id="${escapeHTML(product.id)}">Eliminar</button></td></tr>`).join("") : '<tr><td colspan="5">No hay productos para mostrar.</td></tr>';
}
function renderInventory() {
    const query = $("inventorySearch").value.trim().toLowerCase();
    const filtered = products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(query));
    $("inventoryTable").innerHTML = filtered.length ? filtered.map(product => { const low = product.stock <= 5; return `<tr><td>${escapeHTML(product.name)}</td><td>${escapeHTML(product.category)}</td><td>${money(product.price)}</td><td>${product.stock}</td><td><span class="status ${low ? "low" : "ok"}">${low ? "Stock bajo" : "Disponible"}</span></td></tr>`; }).join("") : '<tr><td colspan="5">No hay existencias registradas.</td></tr>';
}
function renderPurchaseOptions() {
    const select = $("purchaseProduct"), previous = select.value;
    select.innerHTML = '<option value="">Selecciona un producto</option>';
    products.filter(product => product.stock > 0).forEach(product => { const option = document.createElement("option"); option.value = product.id; option.textContent = `${product.name} — ${money(product.price)} (Disponibles: ${product.stock})`; select.appendChild(option); });
    if (products.some(product => product.id === previous && product.stock > 0)) select.value = previous;
    updatePurchaseTotal();
}
function updatePurchaseTotal() {
    const product = products.find(item => item.id === $("purchaseProduct").value), quantity = Number($("purchaseQuantity").value);
    $("purchaseTotal").textContent = money(product && Number.isInteger(quantity) && quantity > 0 ? product.price * quantity : 0);
}
$("purchaseProduct").addEventListener("change", updatePurchaseTotal);
$("purchaseQuantity").addEventListener("input", updatePurchaseTotal);
$("purchaseForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        const sale = await request("/sales", { method: "POST", body: JSON.stringify({ productId: $("purchaseProduct").value, quantity: Number($("purchaseQuantity").value) }) });
        $("purchaseForm").reset(); $("purchaseQuantity").value = 1; showMessage("purchaseMessage", `Venta registrada correctamente. Total: ${money(sale.total)}`); await refreshData();
    } catch (error) { handleError("purchaseMessage", error); }
});
function renderSales() {
    const rows = [];
    sales.slice().reverse().forEach(sale => sale.items.forEach(item => rows.push(`<tr><td>${new Date(sale.date).toLocaleString("es-MX")}</td><td>${escapeHTML(item.productName)}</td><td>${item.quantity}</td><td>${money(item.total)}</td></tr>`)));
    $("salesTable").innerHTML = rows.length ? rows.join("") : '<tr><td colspan="4">Todavía no hay ventas registradas.</td></tr>';
}
function renderDashboard() {
    $("statProducts").textContent = products.length;
    $("statStock").textContent = products.reduce((sum, product) => sum + product.stock, 0);
    $("statSales").textContent = sales.length;
    $("statIncome").textContent = money(sales.reduce((sum, sale) => sum + sale.total, 0));
}
function renderAll() { renderDashboard(); renderProducts(); renderInventory(); renderPurchaseOptions(); renderSales(); }

async function init() {
    $("productStock").disabled = false;
    if (!token) return showView("login");
    try { const { user } = await request("/auth/me"); await openApp(user); }
    catch { logout(false); }
}
init();
