
"use strict";
const $ = (id) => document.getElementById(id);

const STORAGE = {
    users: "xochilgest_users",
    products: "xochilgest_products",
    sales: "xochilgest_sales",
    session: "xochilgest_session"
};

const readData = (key, fallback) => {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

const saveData = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

let products = readData(STORAGE.products, []);
let sales = readData(STORAGE.sales, []);
let editingId = null;



function money(value) {
    return Number(value).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN"
    });
}

function showMessage(id, text, type = "success") {
    const element = $(id);
    element.textContent = text;
    element.className = `message ${type}`;
}

function clearMessage(id) {
    $(id).textContent = "";
    $(id).className = "message";
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}



function showView(view) {
    $("loginView").classList.toggle("hidden", view !== "login");
    $("registerView").classList.toggle("hidden", view !== "register");
    $("appView").classList.toggle("hidden", view !== "app");
}

function currentUser() {
    return readData(STORAGE.session, null);
}

function openApp(user) {
    $("welcomeUser").textContent = `Hola, ${user.name}`;
    showView("app");
    renderAll();
}

$("showRegister").addEventListener("click", () => {
    clearMessage("registerMessage");
    showView("register");
});

$("showLogin").addEventListener("click", () => {
    clearMessage("loginMessage");
    showView("login");
});



$("registerForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const name = $("registerName").value.trim();
    const email = $("registerEmail").value.trim().toLowerCase();
    const password = $("registerPassword").value;

    if (!name || !email || password.length < 8) {
        showMessage(
            "registerMessage",
            "Completa todos los campos. La contraseña debe tener al menos 8 caracteres.",
            "error"
        );
        return;
    }

    const users = readData(STORAGE.users, []);

    if (users.some(user => user.email === email)) {
        showMessage(
            "registerMessage",
            "Ya existe una cuenta con ese correo.",
            "error"
        );
        return;
    }

    users.push({
        id: crypto.randomUUID(),
        name,
        email,
        password
    });

    saveData(STORAGE.users, users);
    $("registerForm").reset();

    showMessage(
        "loginMessage",
        "Cuenta creada. Ahora puedes iniciar sesión."
    );

    showView("login");
});


$("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const email = $("loginEmail").value.trim().toLowerCase();
    const password = $("loginPassword").value;
    const users = readData(STORAGE.users, []);

    const user = users.find(
        item => item.email === email && item.password === password
    );

    if (!user) {
        showMessage(
            "loginMessage",
            "Correo o contraseña incorrectos.",
            "error"
        );
        return;
    }

    saveData(STORAGE.session, {
        id: user.id,
        name: user.name,
        email: user.email
    });

    $("loginForm").reset();
    clearMessage("loginMessage");
    openApp(user);
});

$("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE.session);
    showView("login");
});



document.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(tab => {
            tab.classList.toggle("active", tab === button);
        });

        document.querySelectorAll(".panel").forEach(panel => {
            panel.classList.toggle(
                "hidden",
                panel.id !== button.dataset.tab
            );
        });

        renderAll();
    });
});


function resetProductForm() {
    editingId = null;
    $("productForm").reset();
    $("productId").value = "";
    $("saveProductBtn").textContent = "Guardar producto";
    $("cancelEditBtn").classList.add("hidden");
    clearMessage("productMessage");
}

$("cancelEditBtn").addEventListener("click", resetProductForm);

$("productForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const name = $("productName").value.trim();
    const category = $("productCategory").value.trim();
    const price = Number($("productPrice").value);
    const stock = Number($("productStock").value);

    if (
        !name ||
        !category ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isInteger(stock) ||
        stock < 0
    ) {
        showMessage(
            "productMessage",
            "Revisa el nombre, la categoría, el precio y las existencias.",
            "error"
        );
        return;
    }

    if (editingId !== null) {
        const product = products.find(item => item.id === editingId);

        if (!product) {
            resetProductForm();
            return;
        }

        product.name = name;
        product.category = category;
        product.price = price;



        showMessage("productMessage", "Producto actualizado.");
    } else {
        products.push({
            id: crypto.randomUUID(),
            name,
            category,
            price,
            stock
        });

        showMessage("productMessage", "Producto registrado.");
    }

    saveData(STORAGE.products, products);
    resetProductForm();
    renderAll();
});

function editProduct(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;

    editingId = id;

    $("productId").value = id;
    $("productName").value = product.name;
    $("productCategory").value = product.category;
    $("productPrice").value = product.price;
    $("productStock").value = product.stock;

    $("saveProductBtn").textContent = "Guardar cambios";
    $("cancelEditBtn").classList.remove("hidden");

    $("productStock").disabled = true;

    $("productMessage").textContent =
        "Edita el nombre, la categoría o el precio. El stock se conserva.";

    $("productForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}



function deleteProduct(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;

    const hasSales = sales.some(sale =>
        sale.items.some(item => item.productId === id)
    );

    if (hasSales) {
        alert(
            "Este producto tiene ventas registradas. " +
            "No se puede eliminar para conservar el historial."
        );
        return;
    }

    if (!confirm(`¿Eliminar el producto "${product.name}"?`)) {
        return;
    }

    products = products.filter(item => item.id !== id);
    saveData(STORAGE.products, products);

    if (editingId === id) resetProductForm();

    renderAll();
}


$("productsTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;

    if (button.dataset.action === "edit") {
        editProduct(id);
    }

    if (button.dataset.action === "delete") {
        deleteProduct(id);
    }
});



$("productSearch").addEventListener("input", renderProducts);
$("inventorySearch").addEventListener("input", renderInventory);


function renderProducts() {
    const query = $("productSearch").value.trim().toLowerCase();

    const filtered = products.filter(product =>
        `${product.name} ${product.category}`
            .toLowerCase()
            .includes(query)
    );

    if (filtered.length === 0) {
        $("productsTable").innerHTML =
            '<tr><td colspan="5">No hay productos para mostrar.</td></tr>';
        return;
    }

    $("productsTable").innerHTML = filtered.map(product => `
        <tr>
            <td>${escapeHTML(product.name)}</td>
            <td>${escapeHTML(product.category)}</td>
            <td>${money(product.price)}</td>
            <td>${product.stock}</td>
            <td>
                <button class="action-btn edit-btn"
                    data-action="edit"
                    data-id="${escapeHTML(product.id)}">
                    Editar
                </button>
                <button class="action-btn delete-btn"
                    data-action="delete"
                    data-id="${escapeHTML(product.id)}">
                    Eliminar
                </button>
            </td>
        </tr>
    `).join("");
}


function renderInventory() {
    const query = $("inventorySearch").value.trim().toLowerCase();

    const filtered = products.filter(product =>
        `${product.name} ${product.category}`
            .toLowerCase()
            .includes(query)
    );

    if (filtered.length === 0) {
        $("inventoryTable").innerHTML =
            '<tr><td colspan="5">No hay existencias registradas.</td></tr>';
        return;
    }

    $("inventoryTable").innerHTML = filtered.map(product => {
        const lowStock = product.stock <= 5;

        return `
            <tr>
                <td>${escapeHTML(product.name)}</td>
                <td>${escapeHTML(product.category)}</td>
                <td>${money(product.price)}</td>
                <td>${product.stock}</td>
                <td>
                    <span class="status ${lowStock ? "low" : "ok"}">
                        ${lowStock ? "Stock bajo" : "Disponible"}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}


function renderPurchaseOptions() {
    const select = $("purchaseProduct");
    const previousValue = select.value;

    select.innerHTML =
        '<option value="">Selecciona un producto</option>';

    products
        .filter(product => product.stock > 0)
        .forEach(product => {
            const option = document.createElement("option");
            option.value = product.id;
            option.textContent =
                `${product.name} — ${money(product.price)} ` +
                `(Disponibles: ${product.stock})`;

            select.appendChild(option);
        });

    if (products.some(product =>
        product.id === previousValue && product.stock > 0
    )) {
        select.value = previousValue;
    }

    updatePurchaseTotal();
}

function updatePurchaseTotal() {
    const product = products.find(
        item => item.id === $("purchaseProduct").value
    );

    const quantity = Number($("purchaseQuantity").value);

    const total = product &&
        Number.isInteger(quantity) &&
        quantity > 0
        ? product.price * quantity
        : 0;

    $("purchaseTotal").textContent = money(total);
}

$("purchaseProduct").addEventListener("change", updatePurchaseTotal);
$("purchaseQuantity").addEventListener("input", updatePurchaseTotal);

$("purchaseForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const product = products.find(
        item => item.id === $("purchaseProduct").value
    );

    const quantity = Number($("purchaseQuantity").value);

    if (!product) {
        showMessage(
            "purchaseMessage",
            "Selecciona un producto disponible.",
            "error"
        );
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        showMessage(
            "purchaseMessage",
            "Ingresa una cantidad válida.",
            "error"
        );
        return;
    }

    if (quantity > product.stock) {
        showMessage(
            "purchaseMessage",
            `Solo hay ${product.stock} unidades disponibles.`,
            "error"
        );
        return;
    }

    const total = product.price * quantity;

    product.stock -= quantity;

    sales.push({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        items: [{
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice: product.price,
            total
        }],
        total
    });

    saveData(STORAGE.products, products);
    saveData(STORAGE.sales, sales);

    $("purchaseForm").reset();
    $("purchaseQuantity").value = 1;

    showMessage(
        "purchaseMessage",
        `Venta registrada correctamente. Total: ${money(total)}`
    );

    renderAll();
});


function renderSales() {
    const rows = [];

    sales.slice().reverse().forEach(sale => {
        sale.items.forEach(item => {
            rows.push(`
                <tr>
                    <td>${new Date(sale.date).toLocaleString("es-MX")}</td>
                    <td>${escapeHTML(item.productName)}</td>
                    <td>${item.quantity}</td>
                    <td>${money(item.total)}</td>
                </tr>
            `);
        });
    });

    $("salesTable").innerHTML = rows.length
        ? rows.join("")
        : '<tr><td colspan="4">Todavía no hay ventas registradas.</td></tr>';
}



function renderDashboard() {
    $("statProducts").textContent = products.length;

    $("statStock").textContent = products.reduce(
        (sum, product) => sum + product.stock, 0
    );

    $("statSales").textContent = sales.length;

    $("statIncome").textContent = money(
        sales.reduce((sum, sale) => sum + sale.total, 0)
    );
}

function renderAll() {
    renderDashboard();
    renderProducts();
    renderInventory();
    renderPurchaseOptions();
    renderSales();
}


function init() {

    $("productStock").disabled = false;

    const session = currentUser();
    const users = readData(STORAGE.users, []);

    const validUser = session &&
        users.some(user =>
            user.id === session.id &&
            user.email === session.email
        );

    if (validUser) {
        openApp(session);
    } else {
        localStorage.removeItem(STORAGE.session);
        showView("login");
    }
}

init();