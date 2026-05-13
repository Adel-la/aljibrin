/**
 * ALJIBRIN ARCHIVE - CORE ENGINE (FINAL STABLE v2.3)
 * Фикс: уведомление о поиске только по завершении (Enter / Blur)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJbqhmAYdpod5VVxbQzzZ0cCPHcBxYUVE",
  authDomain: "aljibrin-archive.firebaseapp.com",
  projectId: "aljibrin-archive",
  storageBucket: "aljibrin-archive.firebasestorage.app",
  messagingSenderId: "747636421534",
  appId: "1:747636421534:web:79577233fc3d73b0a19c8f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let cart = [];
let originalProducts = [];
let currentProducts = [];
let currentItem = null;
let selectedSize = 'M';
let sortMode = 0;
const sortLabels = ['SORT: DEFAULT', 'PRICE: ↑', 'PRICE: ↓'];

const dot = document.getElementById('cursor-dot');
const ring = document.getElementById('cursor-ring');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0, lastTime = 0;

// --- 1. ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadCart();
    loadProductsFromCloud();
    requestAnimationFrame(renderCursor);
    
    // Добавляем прослушку клавиши Enter для поиска
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                window.filterItems(true); // true означает "показать уведомление"
            }
        });
        // Опционально: уведомление при потере фокуса (когда убрал курсор из поиска)
        searchInput.addEventListener('blur', () => {
            if (searchInput.value.trim() !== "") window.filterItems(true);
        });
    }

    setTimeout(() => document.getElementById('splash')?.classList.add('hidden'), 1500);
});

// --- 2. ЗАГРУЗКА ДАННЫХ ---
async function loadProductsFromCloud() {
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const temp = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (doc.id !== "_TEMPLATE_" && data.title && data.price !== undefined) {
                temp.push({
                    id: doc.id,
                    title: data.title,
                    price: Number(data.price),
                    img: data.img || '',
                    tags: data.tags || '',
                    searchData: (data.title + " " + (data.tags || "")).toLowerCase()
                });
            }
        });
        originalProducts = temp;
        currentProducts = [...originalProducts];
        renderGrid(currentProducts);

        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        if (productId) setTimeout(() => window.openProduct(productId), 500);
    } catch (e) { console.error(e); showToast("DATABASE ERROR"); }
}

// --- 3. РЕНДЕР И ПОИСК ---
function renderGrid(arr, isSuggestion = false) {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;

    // Если массив пустой и это НЕ предложение похожих товаров
    if (arr.length === 0 && !isSuggestion) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 100px; opacity: 0.5;">
                <div style="font-family:'Oswald'; font-size: 24px; letter-spacing: 4px;">NOTHING FOUND</div>
                <div style="margin-top: 20px; font-size: 12px; color: #888;">TRY DIFFERENT KEYWORDS</div>
            </div>`;
        return;
    }

    // Формируем HTML
    let html = "";

    // Если это блок с подсказками "Возможно вы имели в виду"
    if (isSuggestion && arr.length > 0) {
        html += `
            <div style="grid-column: 1/-1; text-align: center; margin-bottom: 40px;">
                <div style="font-family:'Oswald'; font-size: 24px; letter-spacing: 4px; opacity: 0.5; margin-bottom: 10px;">NOTHING FOUND</div>
                <div style="font-size: 12px; opacity: 0.4; letter-spacing: 2px; text-transform: uppercase;">Possibly you meant:</div>
            </div>`;
    }

    html += arr.map((p, i) => `
        <div class="item click-area" data-search="${p.searchData}" style="animation-delay: ${i * 0.02}s" onclick="openProduct('${p.id}')">
            <div class="image-box" style="background-image: url('${p.img}'); background-size: cover; background-position: center;">
                <div class="image-inner">${p.img ? '' : 'View Piece'}</div>
            </div>
            <p class="item-title">${p.title}</p>
            <p class="item-price">${p.price} $</p>
        </div>
    `).join('');

    grid.innerHTML = html;
    
    // Привязываем курсор к новым элементам
    if (typeof bindCursorHover === 'function') bindCursorHover();
}

window.filterItems = (showLog = false) => {
    const query = document.getElementById('search').value.toLowerCase().trim();
    
    // Если поиск пустой — возвращаем все товары
    if (query === "") {
        currentProducts = [...originalProducts];
        renderGrid(currentProducts);
        return;
    }

    // 1. Ищем точные совпадения
    const filtered = originalProducts.filter(p => p.searchData.includes(query));

    if (filtered.length > 0) {
        // Если нашли — рендерим как обычно
        renderGrid(filtered);
        if(showLog) showToast(`SEARCH: ${query.toUpperCase()} (${filtered.length})`);
    } else {
        // 2. Если ничего не нашли — ищем похожие (по первым двум буквам)
        const suggestionQuery = query.substring(0, 2);
        const suggestions = originalProducts.filter(p => 
            p.searchData.includes(suggestionQuery) || 
            p.title.toLowerCase().startsWith(query[0])
        ).slice(0, 3); // Берем максимум 3 похожих товара

        // Рендерим пустую сетку с подсказками
        renderGrid(suggestions, true); 
        
        if(showLog) showToast(`NO RESULTS FOR: ${query.toUpperCase()}`);
    }
};

// --- 4. МОДАЛКА И ССЫЛКИ ---
window.openProduct = (id) => {
    currentItem = originalProducts.find(p => p.id === id);
    if (!currentItem) return;

    document.getElementById('m-title').innerText = currentItem.title;
    document.getElementById('m-price').innerText = currentItem.price + ' $';
    
    const img = document.getElementById('tilt-img');
    if (img) {
        // Устанавливаем картинку фоном и очищаем текст "VIEW PIECE"
        img.style.backgroundImage = `url('${currentItem.img}')`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
        img.innerText = ''; // Убираем текст внутри блока
        img.style.transform = 'rotateX(0deg) rotateY(0deg)'; // Сброс наклона
    }

    const modal = document.getElementById('product-modal');
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('active'), 10);
};

// --- 5. КОРЗИНА ---
window.addToCart = () => {
    const existing = cart.find(i => i.id === currentItem.id && i.size === selectedSize);
    if (existing) existing.qty++;
    else cart.push({ ...currentItem, size: selectedSize, qty: 1 });
    saveCart();
    updateCartUI();
    showToast('ADDED TO ARCHIVE');
    window.closeProduct();
};

window.removeFromCart = (idx) => {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
    showToast('REMOVED');
};

function saveCart() {
    const user = localStorage.getItem('aljbrin_logged_in') === 'true' ? localStorage.getItem('aljbrin_user') : 'guest';
    localStorage.setItem(`aljbrin_cart_${user}`, JSON.stringify(cart));
}

function loadCart() {
    const user = localStorage.getItem('aljbrin_logged_in') === 'true' ? localStorage.getItem('aljbrin_user') : 'guest';
    cart = JSON.parse(localStorage.getItem(`aljbrin_cart_${user}`)) || [];
    updateCartUI();
}

function updateCartUI() {
    const count = document.getElementById('cart-count');
    const items = document.getElementById('cart-items');
    const total = document.getElementById('cart-total');
    if(count) count.innerText = cart.reduce((s, i) => s + (i.qty || 1), 0);
    if(items) {
        items.innerHTML = cart.map((item, idx) => `
            <div class="cart-item">
                <div>
                    <div style="font-size:16px;">${item.title} ${item.qty>1?`(x${item.qty})`:''}</div>
                    <div style="font-size:12px; color:#888;">SIZE: ${item.size} | ${item.price}$</div>
                </div>
                <div class="cart-remove click-area" onclick="removeFromCart(${idx})">✕</div>
            </div>`).join('');
    }
    if(total) total.innerText = cart.reduce((s, i) => s + (i.price * (i.qty||1)), 0) + '$';
}

// --- 6. ИНТЕРФЕЙС И КУРСОР ---
window.toggleCart = () => document.getElementById('cart-panel').classList.toggle('active');
window.openAuth = () => document.getElementById('auth-panel').classList.toggle('active');

window.toggleSort = () => {
    sortMode = (sortMode + 1) % 3;
    document.getElementById('sort-label').innerText = sortLabels[sortMode];
    if (sortMode === 1) currentProducts.sort((a, b) => a.price - b.price);
    else if (sortMode === 2) currentProducts.sort((a, b) => b.price - a.price);
    else currentProducts = [...originalProducts];
    renderGrid(currentProducts);
    showToast(sortLabels[sortMode]);
};

window.selectSize = (el) => {
    document.querySelectorAll('.size-box').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    selectedSize = el.innerText;
    showToast(`SIZE: ${selectedSize}`);
};

function renderCursor(time) {
    if (!lastTime) lastTime = time;
    const dt = (time - lastTime) / 1000;
    lastTime = time;
    const e = Math.min(dt * 10, 1);
    ringX += (mouseX - ringX) * e; ringY += (mouseY - ringY) * e;
    if(ring) { ring.style.left = ringX+'px'; ring.style.top = ringY+'px'; }
    requestAnimationFrame(renderCursor);
}

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    if(dot) { dot.style.left = mouseX+'px'; dot.style.top = mouseY+'px'; }
});

function bindCursorHover() {
    document.querySelectorAll('.click-area').forEach(el => {
        el.onmouseenter = () => document.body.classList.add('hovered-cursor');
        el.onmouseleave = () => document.body.classList.remove('hovered-cursor');
    });
}

// --- 7. АВТОРИЗАЦИЯ ---
window.login = () => {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    if (localStorage.getItem(`aljbrin_pass_${u}`) === p) {
        localStorage.setItem('aljbrin_user', u);
        localStorage.setItem('aljbrin_logged_in', 'true');
        location.reload();
    } else showToast('ACCESS DENIED');
};

window.register = () => {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    if (u.length < 3) return showToast('NAME TOO SHORT');
    localStorage.setItem(`aljbrin_pass_${u}`, p);
    showToast('REGISTERED. PLEASE LOG IN.');
};

window.logout = () => {
    localStorage.removeItem('aljbrin_logged_in');
    location.reload();
};

function checkAuth() {
    const isLogged = localStorage.getItem('aljbrin_logged_in') === 'true';
    const user = localStorage.getItem('aljbrin_user');
    const forms = document.getElementById('auth-forms');
    const prof = document.getElementById('profile-view');
    if(forms) forms.style.display = isLogged ? 'none' : 'block';
    if(prof) prof.style.display = isLogged ? 'block' : 'none';
    if (isLogged && user) {
        document.getElementById('prof-name').innerText = user.toUpperCase();
        document.getElementById('nav-user-text').innerText = user.toUpperCase();
    }
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const t = document.createElement('div');
    t.className = 'toast'; t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// --- ЭФФЕКТ 3D НАКЛОНА ДЛЯ КАРТИНКИ В МОДАЛКЕ ---
document.addEventListener('mousemove', (e) => {
    const modal = document.getElementById('product-modal');
    // Работает только если модалка открыта
    if (modal && modal.style.display === 'block') {
        const img = document.getElementById('tilt-img');
        if (!img) return;

        // Находим центр экрана
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        // Считаем отклонение курсора от центра (от -1 до 1)
        const dx = (e.clientX - cx) / cx;
        const dy = (e.clientY - cy) / cy;

        // Наклоняем (максимум на 15 градусов для мягкости)
        const tiltX = dy * -15; 
        const tiltY = dx * 15;

        img.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    }
});

// Функция для быстрого добавления товара
window.uploadProduct = async () => {
    // Подключаем нужные методы из Firebase (если они еще не импортированы глобально)
    const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

    const title = document.getElementById('adm-title').value.trim();
    const price = document.getElementById('adm-price').value;
    const img = document.getElementById('adm-img').value.trim();
    const tags = document.getElementById('adm-tags').value.trim();
    const desc = document.getElementById('adm-desc').value.trim();

    // Проверка на пустые поля
    if (!title || !price || !img) {
        showToast("FILL REQUIRED FIELDS (TITLE, PRICE, IMG)");
        return;
    }

    try {
        showToast("UPLOADING...");
        
        await addDoc(collection(db, "products"), {
            title: title,
            price: Number(price),
            img: img,
            tags: tags,
            description: desc || "Archive piece",
            createdAt: new Date() // Чтобы знать, когда добавили
        });

        showToast("SUCCESSFULLY ADDED");

        // Очищаем поля после загрузки
        document.querySelectorAll('#admin-panel .form-input').forEach(input => input.value = "");
        
        // Перезагружаем товары, чтобы новый сразу появился в сетке
        loadProductsFromCloud(); 

    } catch (e) {
        console.error(e);
        showToast("UPLOAD FAILED");
    }
};
// Функция для добавления нового товара через форму на сайте
window.uploadProduct = async () => {
    const title = document.getElementById('adm-title').value.trim();
    const price = document.getElementById('adm-price').value;
    const img = document.getElementById('adm-img').value.trim();
    const tags = document.getElementById('adm-tags').value.trim();
    const desc = document.getElementById('adm-desc').value.trim();

    if (!title || !price || !img) {
        showToast("FILL TITLE, PRICE AND IMG");
        return;
    }

    try {
        await addDoc(collection(db, "products"), {
            title: title,
            price: Number(price),
            img: img,
            tags: tags,
            description: desc || "Archive piece",
            createdAt: new Date()
        });
        showToast("SUCCESSFULLY ADDED");
        // Очистка полей
        document.querySelectorAll('#admin-panel input, #admin-panel textarea').forEach(i => i.value = "");
        loadProductsFromCloud(); 
    } catch (e) {
        showToast("UPLOAD ERROR");
    }
};

// Функция закрытия модалки
window.closeProduct = () => {
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 600);
    }
    // Сбрасываем URL в адресной строке
    window.history.pushState({}, '', window.location.pathname);
};

// Функция выбора размера (чтобы не было аналогичной ошибки)
window.selectSize = (el) => {
    document.querySelectorAll('.size-box').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    // Можно сохранить выбранный размер в переменную, если нужно
};