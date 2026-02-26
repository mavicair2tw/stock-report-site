const products = [
  { id: 1, name: 'MXIII 無線飛鼠遙控器', cat: 'remote', price: 690, img: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600' },
  { id: 2, name: 'G20S Pro Voice 遙控器', cat: 'remote', price: 890, img: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600' },
  { id: 3, name: 'Android TV Box 4K', cat: 'box', price: 2390, img: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600' },
  { id: 4, name: 'HDMI 高速線 2m', cat: 'accessory', price: 250, img: 'https://images.unsplash.com/photo-1585298723682-7115561c51b7?w=600' },
  { id: 5, name: '語音遙控接收器', cat: 'accessory', price: 390, img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600' }
];

let cart = [];
let currentCat = 'all';

const productsEl = document.getElementById('products');
const cartItemsEl = document.getElementById('cartItems');
const totalEl = document.getElementById('total');
const cartCountEl = document.getElementById('cartCount');

function renderProducts() {
  const list = currentCat === 'all' ? products : products.filter(p => p.cat === currentCat);
  productsEl.innerHTML = list.map(p => `
    <article class="card">
      <img src="${p.img}" alt="${p.name}" />
      <h4>${p.name}</h4>
      <div class="price">NT$ ${p.price}</div>
      <button onclick="addToCart(${p.id})">加入購物車</button>
    </article>
  `).join('');
}

function addToCart(id) {
  const p = products.find(x => x.id === id);
  const hit = cart.find(x => x.id === id);
  if (hit) hit.qty += 1;
  else cart.push({ ...p, qty: 1 });
  renderCart();
}

function renderCart() {
  cartItemsEl.innerHTML = cart.length ? cart.map(c => `
    <div class="cart-row"><span>${c.name} × ${c.qty}</span><strong>NT$ ${c.qty * c.price}</strong></div>
  `).join('') : '<p>目前沒有商品</p>';
  const total = cart.reduce((a, b) => a + b.price * b.qty, 0);
  totalEl.textContent = total;
  cartCountEl.textContent = cart.reduce((a,b)=>a+b.qty,0);
}

document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    renderProducts();
  });
});

document.getElementById('cartBtn').addEventListener('click', () => document.getElementById('drawer').classList.remove('hidden'));
document.getElementById('closeDrawer').addEventListener('click', () => document.getElementById('drawer').classList.add('hidden'));
document.getElementById('checkoutForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!cart.length) return alert('購物車是空的');
  alert('訂單已送出！(示範站)');
  cart = [];
  renderCart();
  document.getElementById('drawer').classList.add('hidden');
});

renderProducts();
renderCart();
