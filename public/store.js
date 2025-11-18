let products = [];
let cart = [];
let filteredProducts = [];
let paymentSettings = null;
let currentCustomer = null;

const API_BASE = window.location.origin + '/api';

// Get store slug from URL
function getStoreSlug() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(s => s);
    // If path is like /store-name, get the last segment
    // If path is / or /guest, return 'guest'
    if (segments.length === 0 || segments[0] === 'guest' || segments[0] === 'index.html') {
        return 'guest';
    }
    return segments[segments.length - 1];
}

// Load products on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user has made a choice (login, signup, or guest)
    // If not, redirect to login page
    const hasMadeChoice = localStorage.getItem('customerChoiceMade');
    
    // Check if user is logged in by making an API call
    let isLoggedIn = false;
    if (!hasMadeChoice) {
        try {
            const response = await fetch(`${API_BASE}/customer-auth/me`, {
                credentials: 'include'
            });
            isLoggedIn = response.ok;
            if (isLoggedIn) {
                // User is logged in, mark choice as made
                localStorage.setItem('customerChoiceMade', 'true');
            }
        } catch (error) {
            // Not logged in
            isLoggedIn = false;
        }
    }
    
    if (!hasMadeChoice && !isLoggedIn) {
        // User hasn't made a choice yet, redirect to login page
        const storeSlug = getStoreSlug();
        window.location.href = `/customer-login.html?store=${storeSlug}`;
        return;
    }
    
    const storeSlug = getStoreSlug();
    loadProducts(storeSlug);
    loadCart();
    loadStoreDetails(storeSlug);
    checkCustomerAuth();
    checkRepeatOrder();
});

async function loadProducts(storeSlug = 'guest') {
    try {
        const response = await fetch(`${API_BASE}/store/${storeSlug}/products`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        // Ensure products is an array
        if (!Array.isArray(data)) {
            throw new Error('Invalid response format: expected array');
        }
        
        products = data;
        // Debug: log first product to check for unit field
        if (products.length > 0) {
            console.log('Sample product:', products[0]);
        }
        filteredProducts = products;
        displayProducts();
        updateCategoryFilter();
        // Update cart UI after products are loaded
        updateCartUI();
    } catch (error) {
        console.error('Error loading products:', error);
        const errorMessage = error.message || 'Unknown error';
        document.getElementById('products-grid').innerHTML = 
            `<p class="loading" style="color: red;">Error loading products: ${errorMessage}</p>`;
    }
}

function displayProducts() {
    const grid = document.getElementById('products-grid');
    
    if (filteredProducts.length === 0) {
        grid.innerHTML = '<p class="loading">No products found.</p>';
        return;
    }

    grid.innerHTML = filteredProducts.map(product => {
        const cartItem = cart.find(item => item.productId === product.id);
        const quantityInCart = cartItem ? cartItem.quantity : 0;
        const isOutOfStock = product.quantity === 0;
        
        // Ensure price is a number before calling toFixed
        const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
        
        return `
        <div class="product-card">
            ${product.image ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none'">` : ''}
            <h3>${product.name}</h3>
            <div class="category">${product.category || 'Uncategorized'}</div>
            <div class="price">₹${price.toFixed(2)}${product.unit ? ` <span style="color: #667eea; font-weight: 500;">/ ${product.unit}</span>` : ''}</div>
            ${product.description ? `<p style="font-size: 0.9em; color: #666; margin: 10px 0;">${product.description}</p>` : ''}
            ${isOutOfStock ? 
                '<button disabled style="width: 100%; padding: 12px; background: #ccc; color: white; border: none; border-radius: 5px; cursor: not-allowed;">Out of Stock</button>' :
                `<div class="quantity-controls">
                    <button class="qty-btn minus-btn" onclick="updateProductQuantity('${product.id}', -1)" ${quantityInCart === 0 ? 'disabled' : ''}>-</button>
                    <span class="qty-display">${quantityInCart}</span>
                    <button class="qty-btn plus-btn" onclick="updateProductQuantity('${product.id}', 1)" ${product.quantity === quantityInCart ? 'disabled' : ''}>+</button>
                </div>`
            }
        </div>
        `;
    }).join('');
}

function updateCategoryFilter() {
    const categories = [...new Set(products.map(p => p.category || 'Uncategorized'))];
    const filter = document.getElementById('category-filter');
    const currentValue = filter.value;
    
    filter.innerHTML = '<option value="">All Categories</option>' + 
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    if (currentValue) {
        filter.value = currentValue;
    }
}

function filterProducts() {
    const category = document.getElementById('category-filter').value;
    const search = document.getElementById('search-box').value.toLowerCase();
    
    filteredProducts = products.filter(product => {
        const matchesCategory = !category || product.category === category || 
            (!product.category && category === 'Uncategorized');
        const matchesSearch = !search || 
            product.name.toLowerCase().includes(search) ||
            (product.description && product.description.toLowerCase().includes(search));
        return matchesCategory && matchesSearch;
    });
    
    displayProducts();
}

function updateProductQuantity(productId, change) {
    const product = products.find(p => p.id === productId);
    if (!product || product.quantity === 0) return;
    
    const existingItem = cart.find(item => item.productId === productId);
    const currentQuantity = existingItem ? (typeof existingItem.quantity === 'number' ? existingItem.quantity : parseInt(existingItem.quantity) || 0) : 0;
    const newQuantity = currentQuantity + change;
    
    if (newQuantity < 0) {
        return; // Can't go below 0
    }
    
    if (newQuantity === 0) {
        // Remove from cart if quantity becomes 0
        removeFromCart(productId);
    } else if (newQuantity > product.quantity) {
        alert('Not enough stock available!');
        return;
    } else {
        // Ensure price is a number
        const productPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
        
        // Update or add to cart
        if (existingItem) {
            existingItem.quantity = newQuantity;
            // Update price in case it changed
            existingItem.price = productPrice;
            existingItem.name = product.name;
            existingItem.unit = product.unit || '';
        } else {
            cart.push({
                productId: productId,
                quantity: newQuantity,
                name: product.name || 'Unknown Product',
                price: productPrice,
                unit: product.unit || ''
            });
        }
        saveCart();
        updateCartUI();
    }
    
    // Refresh product display to update button states
    displayProducts();
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.productId !== productId);
    saveCart();
    updateCartUI();
    // Refresh product display to update button states
    displayProducts();
}

function updateCartQuantity(productId, change) {
    const item = cart.find(item => item.productId === productId);
    if (!item) return;
    
    const product = products.find(p => p.id === productId);
    const newQuantity = item.quantity + change;
    
    if (newQuantity <= 0) {
        removeFromCart(productId);
    } else if (newQuantity > product.quantity) {
        alert('Not enough stock available!');
    } else {
        item.quantity = newQuantity;
        saveCart();
        updateCartUI();
        // Refresh product display to update button states
        displayProducts();
    }
}

function saveCart() {
    try {
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
    } catch (error) {
        console.error('Error saving cart to localStorage:', error);
    }
}

function loadCart() {
    try {
        const saved = localStorage.getItem('cart');
        if (saved) {
            cart = JSON.parse(saved);
            // Ensure cart is an array
            if (!Array.isArray(cart)) {
                cart = [];
            }
            // Validate and clean cart items
            cart = cart.filter(item => {
                return item && item.productId && item.quantity > 0;
            });
            // Update cart count immediately, UI will update after products load
            updateCartCount();
        }
    } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        cart = [];
    }
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = count;
}

function updateCartUI() {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    if (!cartItems) {
        console.error('Cart items element not found');
        return;
    }
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
        if (checkoutBtn) checkoutBtn.disabled = true;
        if (cartTotal) cartTotal.textContent = '0.00';
    } else {
        // Filter out out-of-stock items for display and checkout
        const availableItems = cart.filter(item => !item.outOfStock);
        const outOfStockItems = cart.filter(item => item.outOfStock);
        
        let cartHtml = '';
        
        // Display available items
        cartHtml += availableItems.map(item => {
            // Ensure price is a number
            const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
            const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0;
            
            // Try to get unit from products array, fallback to item.unit
            const product = products.find(p => p.id === item.productId);
            const unit = product ? (product.unit || '') : (item.unit || '');
            const itemName = item.name || (product ? product.name : 'Unknown Product');
            
            return `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <h4>${itemName}</h4>
                        <p>₹${price.toFixed(2)}${unit ? ` / ${unit}` : ''} × ${quantity}${unit ? ` ${unit}` : ''}</p>
                    </div>
                    <div class="cart-item-controls">
                        <button onclick="updateCartQuantity('${item.productId}', -1)">-</button>
                        <span>${quantity}</span>
                        <button onclick="updateCartQuantity('${item.productId}', 1)">+</button>
                        <button onclick="removeFromCart('${item.productId}')" style="background: #dc3545; margin-left: 10px;">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Display out-of-stock items (no interactive buttons)
        if (outOfStockItems.length > 0) {
            cartHtml += outOfStockItems.map(item => {
                const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
                const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0;
                const product = products.find(p => p.id === item.productId);
                const unit = product ? (product.unit || '') : (item.unit || '');
                const itemName = item.name || (product ? product.name : 'Unknown Product');
                
                return `
                    <div class="cart-item" style="opacity: 0.6; background: #f8f8f8;">
                        <div class="cart-item-info">
                            <h4>${itemName} <span style="color: #dc3545; font-size: 0.9em;">(Out of Stock)</span></h4>
                            <p>₹${price.toFixed(2)}${unit ? ` / ${unit}` : ''} × ${quantity}${unit ? ` ${unit}` : ''}</p>
                        </div>
                        <div class="cart-item-controls">
                            <button disabled style="opacity: 0.5; cursor: not-allowed;">-</button>
                            <span>${quantity}</span>
                            <button disabled style="opacity: 0.5; cursor: not-allowed;">+</button>
                            <button onclick="removeFromCart('${item.productId}')" style="background: #dc3545; margin-left: 10px;">Remove</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        cartItems.innerHTML = cartHtml;
        
        // Calculate total only from available items (exclude out-of-stock)
        const total = availableItems.reduce((sum, item) => {
            const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
            const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0;
            return sum + (price * quantity);
        }, 0);
        
        if (cartTotal) cartTotal.textContent = total.toFixed(2);
        if (checkoutBtn) checkoutBtn.disabled = availableItems.length === 0;
        
        // Check and display minimum order value message
        const cartMinimumMessage = document.getElementById('cart-minimum-message');
        console.log('[CART] Checking minimum order value:', {
            paymentSettings: paymentSettings,
            minimumOrderValue: paymentSettings?.minimumOrderValue,
            total: total,
            cartMinimumMessage: cartMinimumMessage
        });
        
        if (paymentSettings && paymentSettings.minimumOrderValue && paymentSettings.minimumOrderValue > 0) {
            if (total < paymentSettings.minimumOrderValue) {
                const remaining = (paymentSettings.minimumOrderValue - total).toFixed(2);
                if (cartMinimumMessage) {
                    cartMinimumMessage.style.display = 'block';
                    cartMinimumMessage.style.visibility = 'visible';
                    cartMinimumMessage.style.opacity = '1';
                    cartMinimumMessage.innerHTML = `<div style="color: #856404; font-weight: 600; margin-bottom: 5px;">⚠️ Minimum order value: ₹${paymentSettings.minimumOrderValue.toFixed(2)}</div><div style="color: #856404;">Add ₹${remaining} more to checkout.</div>`;
                    console.log('[CART] Showing minimum order message:', cartMinimumMessage.innerHTML);
                } else {
                    console.log('[CART] cart-minimum-message element not found');
                }
            } else {
                if (cartMinimumMessage) {
                    cartMinimumMessage.style.display = 'none';
                }
            }
        } else {
            if (cartMinimumMessage) {
                cartMinimumMessage.style.display = 'none';
            }
            console.log('[CART] No minimum order value set or value is 0/null');
        }
    }
    
    updateCartCount();
}

function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    sidebar.classList.toggle('open');
}

function updateStoreHeader() {
    const storeNameHeader = document.getElementById('store-name-header');
    if (paymentSettings && paymentSettings.storeName) {
        storeNameHeader.textContent = `🛒 ${paymentSettings.storeName}`;
    }
}

function showMaintenanceMessage() {
    const main = document.querySelector('main');
    if (!main) return;
    
    // Hide the main content
    const storeHeader = document.querySelector('.store-header');
    const filters = document.querySelector('.filters');
    const productsGrid = document.getElementById('products-grid');
    
    if (storeHeader) storeHeader.style.display = 'none';
    if (filters) filters.style.display = 'none';
    if (productsGrid) productsGrid.style.display = 'none';
    
    // Show maintenance message
    let maintenanceDiv = document.getElementById('maintenance-message');
    if (!maintenanceDiv) {
        maintenanceDiv = document.createElement('div');
        maintenanceDiv.id = 'maintenance-message';
        maintenanceDiv.className = 'maintenance-message';
        maintenanceDiv.innerHTML = `
            <h2>🔧 Under Maintenance</h2>
            <p>We're currently updating our inventory. Please check back soon!</p>
            <p style="margin-top: 20px; font-size: 0.9em; color: #999;">Thank you for your patience.</p>
        `;
        main.insertBefore(maintenanceDiv, main.firstChild);
    }
    maintenanceDiv.style.display = 'block';
}

function hideMaintenanceMessage() {
    const maintenanceDiv = document.getElementById('maintenance-message');
    if (maintenanceDiv) {
        maintenanceDiv.style.display = 'none';
    }
    
    // Show the main content
    const storeHeader = document.querySelector('.store-header');
    const filters = document.querySelector('.filters');
    const productsGrid = document.getElementById('products-grid');
    
    if (storeHeader) storeHeader.style.display = 'flex';
    if (filters) filters.style.display = 'flex';
    if (productsGrid) productsGrid.style.display = 'grid';
}

async function loadStoreDetails(storeSlug = 'guest') {
    try {
        const response = await fetch(`${API_BASE}/store/${storeSlug}/details`);
        if (!response.ok) {
            // If store not found, show maintenance
            showMaintenanceMessage();
            return;
        }
        paymentSettings = await response.json();
        
        console.log('[STORE] Loaded payment settings:', paymentSettings);
        console.log('[STORE] Minimum order value:', paymentSettings.minimumOrderValue);
        
        // Check if store is live
        if (!paymentSettings.isLive) {
            showMaintenanceMessage();
            return;
        }
        
        // Store is live, hide maintenance message and show store
        hideMaintenanceMessage();
        
        // Update store name in navigation header
        updateStoreHeader();
        
        // Show/hide online payment option based on store settings
        const onlinePaymentOption = document.getElementById('online-payment-option');
        console.log('[STORE] Online payment enabled:', paymentSettings?.onlinePaymentEnabled);
        if (onlinePaymentOption) {
            if (paymentSettings && paymentSettings.onlinePaymentEnabled === true) {
                console.log('[STORE] Showing online payment option');
                onlinePaymentOption.style.display = 'flex';
                const onlineRadio = onlinePaymentOption.querySelector('input[name="payment-method"][value="online"]');
                if (onlineRadio) {
                    onlineRadio.disabled = false;
                }
            } else {
                console.log('[STORE] Hiding online payment option');
                onlinePaymentOption.style.display = 'none';
                const codRadio = document.querySelector('input[name="payment-method"][value="cod"]');
                if (codRadio) {
                    codRadio.checked = true;
                }
            }
        } else {
            console.error('[STORE] online-payment-option element not found!');
        }
        
        // Update cart UI to show minimum order value message if needed
        updateCartUI();
        
    } catch (error) {
        console.error('Error loading store details:', error);
    }
}

async function checkout() {
    if (cart.length === 0) return;
    
    // Calculate cart total
    const availableItems = cart.filter(item => !item.outOfStock);
    const cartTotal = availableItems.reduce((sum, item) => {
        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0;
        return sum + (price * quantity);
    }, 0);
    
    // Reload store details in case it was updated
    const storeSlug = getStoreSlug();
    await loadStoreDetails(storeSlug);
    
    // Check minimum order value
    const minimumOrderMessage = document.getElementById('minimum-order-message');
    const checkoutForm = document.getElementById('checkout-form');
    const submitBtn = checkoutForm ? checkoutForm.querySelector('button[type="submit"]') : null;
    
    console.log('[CHECKOUT] Checking minimum order value:', {
        paymentSettings: paymentSettings,
        minimumOrderValue: paymentSettings?.minimumOrderValue,
        cartTotal: cartTotal,
        minimumOrderMessage: minimumOrderMessage,
        submitBtn: submitBtn
    });
    
    if (paymentSettings && paymentSettings.minimumOrderValue && paymentSettings.minimumOrderValue > 0) {
        if (cartTotal < paymentSettings.minimumOrderValue) {
            const remaining = (paymentSettings.minimumOrderValue - cartTotal).toFixed(2);
            console.log('[CHECKOUT] Cart total below minimum. Showing message.');
            if (minimumOrderMessage) {
                minimumOrderMessage.style.display = 'block';
                minimumOrderMessage.style.visibility = 'visible';
                minimumOrderMessage.style.opacity = '1';
                minimumOrderMessage.innerHTML = `<div style="color: #856404; font-weight: 600; margin-bottom: 8px; font-size: 1em;">⚠️ Minimum Order Value Required</div><div style="color: #856404; font-size: 0.95em;">Your cart total is ₹${cartTotal.toFixed(2)}. Please add items worth ₹${remaining} more to proceed with checkout.</div>`;
                console.log('[CHECKOUT] Minimum order message displayed:', minimumOrderMessage.innerHTML);
                console.log('[CHECKOUT] Message element computed style:', window.getComputedStyle(minimumOrderMessage));
            } else {
                console.error('[CHECKOUT] minimum-order-message element not found!');
            }
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = `Minimum cart value above ₹${paymentSettings.minimumOrderValue.toFixed(2)}`;
                console.log('[CHECKOUT] Submit button disabled and text updated');
            } else {
                console.error('[CHECKOUT] Submit button not found!');
            }
        } else {
            console.log('[CHECKOUT] Cart total meets minimum requirement');
            if (minimumOrderMessage) {
                minimumOrderMessage.style.display = 'none';
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Place Order';
            }
        }
    } else {
        console.log('[CHECKOUT] No minimum order value set');
        if (minimumOrderMessage) {
            minimumOrderMessage.style.display = 'none';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Place Order';
        }
    }
    
    document.getElementById('checkout-modal').style.display = 'block';
    
    // Pre-fill customer info if logged in
    if (currentCustomer) {
        const form = document.getElementById('checkout-form');
        if (form) {
            const nameInput = form.querySelector('input[name="name"]');
            const phoneInput = form.querySelector('input[name="phone"]');
            if (nameInput) nameInput.value = currentCustomer.name || '';
            if (phoneInput) phoneInput.value = currentCustomer.phone || '';
        }
    }
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').style.display = 'none';
}

async function submitOrder(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    
    // Check which payment method is selected
    const codRadio = document.querySelector('input[name="payment-method"][value="cod"]');
    const onlineRadio = document.querySelector('input[name="payment-method"][value="online"]');
    
    let paymentMethod = 'cod';
    if (onlineRadio && onlineRadio.checked) {
        paymentMethod = 'online';
    } else if (codRadio && codRadio.checked) {
        paymentMethod = 'cod';
    }
    
    const customerInfo = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        address: formData.get('address')
    };
    
    // Only include available items (exclude out-of-stock items)
    const availableItems = cart.filter(item => !item.outOfStock);
    
    if (availableItems.length === 0) {
        alert('No available items in cart. Please add items to proceed.');
        return;
    }
    
    // Calculate total
    const total = availableItems.reduce((sum, item) => {
        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0;
        return sum + (price * quantity);
    }, 0);
    
    // Check minimum order value
    if (paymentSettings && paymentSettings.minimumOrderValue && paymentSettings.minimumOrderValue > 0) {
        if (total < paymentSettings.minimumOrderValue) {
            const remaining = (paymentSettings.minimumOrderValue - total).toFixed(2);
            alert(`Minimum order value is ₹${paymentSettings.minimumOrderValue.toFixed(2)}. Your cart total is ₹${total.toFixed(2)}. Please add items worth ₹${remaining} more to proceed.`);
            return;
        }
    }
    
    const orderItems = availableItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        productPrice: item.price // Include price for order creation
    }));
    
    // Get store slug for order creation
    const storeSlug = getStoreSlug();
    
    if (paymentMethod === 'cod') {
        // Create COD order
        try {
            const response = await fetch(`${API_BASE}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: orderItems,
                    customerInfo: customerInfo,
                    storeSlug: storeSlug,
                    paymentMethod: 'cod',
                    paymentStatus: 'paid' // COD is considered paid
                })
            });
            
            if (response.status === 503) {
                const data = await response.json();
                alert(data.error || 'Store is currently under maintenance. Please try again later.');
                return;
            }
            
            if (response.ok) {
                const result = await response.json();
                alert('Order placed successfully! Order ID: ' + result.order.id);
                // Remove only available items from cart (keep out-of-stock items for reference)
                cart = cart.filter(item => item.outOfStock);
                saveCart();
                updateCartUI();
                closeCheckoutModal();
                loadProducts(storeSlug); // Refresh inventory
            } else {
                const error = await response.json();
                alert('Error: ' + error.error);
            }
        } catch (error) {
            console.error('Error placing order:', error);
            alert('Error placing order. Please try again.');
        }
    } else {
        // Online payment - create Razorpay order first
        try {
            // Create Razorpay order
            const razorpayResponse = await fetch(`${API_BASE}/razorpay/create-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: total,
                    currency: 'INR',
                    receipt: `receipt_${Date.now()}`,
                    notes: {
                        store_slug: storeSlug
                    },
                    storeSlug: storeSlug
                })
            });
            
            if (!razorpayResponse.ok) {
                const errorData = await razorpayResponse.json();
                throw new Error(errorData.error || 'Failed to create payment order');
            }
            
            const razorpayData = await razorpayResponse.json();
            const razorpayOrderId = razorpayData.order.id;
            
            // Check if Razorpay is loaded
            if (typeof Razorpay === 'undefined') {
                throw new Error('Razorpay payment gateway is not loaded. Please refresh the page and try again.');
            }
            
            // Create our order with pending payment status
            // Order ID will be generated by the server
            const orderResponse = await fetch(`${API_BASE}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: orderItems,
                    customerInfo: customerInfo,
                    storeSlug: storeSlug,
                    paymentMethod: 'online',
                    paymentStatus: 'pending',
                    razorpayOrderId: razorpayOrderId
                })
            });
            
            if (!orderResponse.ok) {
                const errorData = await orderResponse.json();
                throw new Error(errorData.error || 'Failed to create order');
            }
            
            const orderResult = await orderResponse.json();
            const orderId = orderResult.order.id; // Get the generated order ID from server
            
            // Get Razorpay key from server
            let razorpayKey = null;
            try {
                const keyResponse = await fetch(`${API_BASE}/razorpay/key/${storeSlug}`);
                if (keyResponse.ok) {
                    const keyData = await keyResponse.json();
                    razorpayKey = keyData.key;
                } else {
                    throw new Error('Failed to get Razorpay key');
                }
            } catch (error) {
                console.error('Failed to fetch Razorpay key:', error);
                throw new Error('Failed to initialize payment gateway');
            }
            
            // Initialize Razorpay checkout
            const options = {
                key: razorpayKey,
                amount: razorpayData.order.amount,
                currency: razorpayData.order.currency,
                name: paymentSettings?.storeName || 'Store',
                description: `Order ${orderId}`,
                order_id: razorpayOrderId,
                prefill: {
                    name: customerInfo.name,
                    email: customerInfo.email,
                    contact: customerInfo.phone
                },
                handler: async function(response) {
                    // Payment successful
                    try {
                        // Verify payment
                        const verifyResponse = await fetch(`${API_BASE}/razorpay/verify-payment`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                order_id: orderId,
                                storeSlug: storeSlug
                            })
                        });
                        
                        if (verifyResponse.ok) {
                            alert('Payment successful! Order ID: ' + orderId);
                            // Remove only available items from cart
                            cart = cart.filter(item => item.outOfStock);
                            saveCart();
                            updateCartUI();
                            closeCheckoutModal();
                            loadProducts(storeSlug);
                        } else {
                            const errorData = await verifyResponse.json();
                            throw new Error(errorData.error || 'Payment verification failed');
                        }
                    } catch (error) {
                        console.error('Error verifying payment:', error);
                        alert('Payment successful but verification failed. Please contact support with Order ID: ' + orderId);
                    }
                },
                modal: {
                    ondismiss: function() {
                        console.log('Payment modal dismissed by user');
                    }
                }
            };
            
            // Create Razorpay instance and open checkout
            try {
                const rzp = new Razorpay(options);
                
                rzp.on('payment.failed', function(response) {
                    console.error('Payment failed:', response);
                    const errorMsg = response.error ? (response.error.description || response.error.reason || 'Unknown error') : 'Payment failed';
                    alert('Payment failed. Error: ' + errorMsg + '\n\nOrder ID: ' + orderId + '\nYou can retry payment or contact support.');
                });
                
                // Open Razorpay checkout
                rzp.open();
                
                // Close the checkout modal since Razorpay will handle the payment UI
                closeCheckoutModal();
                
            } catch (rzpError) {
                console.error('Error initializing Razorpay:', rzpError);
                throw new Error('Failed to initialize payment gateway: ' + rzpError.message);
            }
            
        } catch (error) {
            console.error('Error processing online payment:', error);
            if (confirm('Error processing payment: ' + error.message + '\n\nWould you like to try Cash on Delivery instead?')) {
                // Switch to COD
                const codRadio = document.querySelector('input[name="payment-method"][value="cod"]');
                if (codRadio) {
                    codRadio.checked = true;
                    submitOrder(event);
                }
            }
        }
    }
}

// Contact Us Modal Functions
function openContactModal() {
    const modal = document.getElementById('contact-modal');
    modal.style.display = 'block';
    displayContactDetails();
}

function closeContactModal() {
    document.getElementById('contact-modal').style.display = 'none';
}

function displayContactDetails() {
    const contactDetails = document.getElementById('contact-details');
    
    if (!paymentSettings) {
        contactDetails.innerHTML = '<p class="loading">Loading contact information...</p>';
        // Try to load store details if not already loaded
        loadStoreDetails().then(() => {
            displayContactDetails();
        });
        return;
    }
    
    let html = '';
    
    if (paymentSettings.storeName) {
        html += `<h3 style="margin-bottom: 15px; color: #667eea;">${paymentSettings.storeName}</h3>`;
    }
    
    html += '<div style="line-height: 1.8;">';
    
    if (paymentSettings.contactNumber1) {
        html += `<p><strong>📞 Contact Number 1:</strong> <a href="tel:${paymentSettings.contactNumber1}" style="color: #667eea; text-decoration: none;">${paymentSettings.contactNumber1}</a></p>`;
    }
    
    if (paymentSettings.contactNumber2) {
        html += `<p><strong>📞 Contact Number 2:</strong> <a href="tel:${paymentSettings.contactNumber2}" style="color: #667eea; text-decoration: none;">${paymentSettings.contactNumber2}</a></p>`;
    }
    
    if (paymentSettings.email) {
        html += `<p><strong>📧 Email:</strong> <a href="mailto:${paymentSettings.email}" style="color: #667eea; text-decoration: none;">${paymentSettings.email}</a></p>`;
    }
    
    if (paymentSettings.address) {
        html += `<p><strong>📍 Address:</strong><br>${paymentSettings.address.replace(/\n/g, '<br>')}</p>`;
    }
    
    // UPI ID is disabled, so don't show it
    // if (paymentSettings.upiId) {
    //     html += `<p><strong>💳 UPI ID:</strong> <span style="color: #667eea; font-weight: bold;">${paymentSettings.upiId}</span></p>`;
    // }
    
    html += '</div>';
    
    if (!paymentSettings.contactNumber1 && !paymentSettings.address) {
        html = '<p style="color: #666;">Contact information not available. Please contact the store administrator.</p>';
    }
    
    contactDetails.innerHTML = html;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const checkoutModal = document.getElementById('checkout-modal');
    const contactModal = document.getElementById('contact-modal');
    
    if (event.target === checkoutModal) {
        closeCheckoutModal();
    }
    if (event.target === contactModal) {
        closeContactModal();
    }
}

// Customer Authentication Functions
async function checkCustomerAuth() {
    try {
        const response = await fetch(`${API_BASE}/customer-auth/me`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            currentCustomer = data.customer;
            updateCustomerUI();
        } else {
            currentCustomer = null;
            updateCustomerUI();
        }
    } catch (error) {
        console.error('Error checking customer auth:', error);
        currentCustomer = null;
        updateCustomerUI();
    }
}

function updateCustomerUI() {
    const loginLink = document.getElementById('login-link');
    const orderHistoryLink = document.getElementById('order-history-link');
    const logoutLink = document.getElementById('logout-link');
    const contactUsLink = document.getElementById('contact-us-link');
    const welcomeMsg = document.getElementById('store-welcome');
    
    if (currentCustomer) {
        // Customer is logged in - show Order History, Logout and Contact Us
        if (loginLink) loginLink.style.display = 'none';
        if (orderHistoryLink) orderHistoryLink.style.display = 'inline';
        if (logoutLink) logoutLink.style.display = 'inline';
        if (contactUsLink) contactUsLink.style.display = 'inline';
        if (welcomeMsg) {
            welcomeMsg.textContent = `Welcome ${currentCustomer.name}!`;
        }
    } else {
        // Customer is not logged in - show Login and Contact Us
        if (loginLink) loginLink.style.display = 'inline';
        if (orderHistoryLink) orderHistoryLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'none';
        if (contactUsLink) contactUsLink.style.display = 'inline';
        if (welcomeMsg) {
            welcomeMsg.textContent = 'Welcome Guest!!';
        }
    }
}

function goToLogin() {
    // Clear the choice flag so user can see login page
    localStorage.removeItem('customerChoiceMade');
    const storeSlug = getStoreSlug();
    window.location.href = `/customer-login.html?store=${storeSlug}`;
}

function goToOrderHistory() {
    const storeSlug = getStoreSlug();
    window.location.href = `/order-history.html?store=${storeSlug}`;
}

async function customerLogout() {
    try {
        const response = await fetch(`${API_BASE}/customer-auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            currentCustomer = null;
            // Clear the choice flag so user will see login page again
            localStorage.removeItem('customerChoiceMade');
            updateCustomerUI();
            // Reload page to refresh state
            window.location.reload();
        }
    } catch (error) {
        console.error('Error logging out:', error);
        alert('Error logging out. Please try again.');
    }
}

// Repeat Order Functionality
async function checkRepeatOrder() {
    try {
        const repeatOrderData = localStorage.getItem('repeatOrder');
        if (!repeatOrderData) return;
        
        const data = JSON.parse(repeatOrderData);
        
        // Check if data is recent (within 5 minutes)
        const age = Date.now() - data.timestamp;
        if (age > 5 * 60 * 1000) {
            localStorage.removeItem('repeatOrder');
            return;
        }
        
        // Wait for products to load
        if (products.length === 0) {
            setTimeout(checkRepeatOrder, 500);
            return;
        }
        
        // Process repeat order
        await processRepeatOrder(data);
        
        // Clear the repeat order data
        localStorage.removeItem('repeatOrder');
    } catch (error) {
        console.error('Error processing repeat order:', error);
        localStorage.removeItem('repeatOrder');
    }
}

async function processRepeatOrder(data) {
    const { items, unavailableItems } = data;
    
    // Add available items to cart
    items.forEach(item => {
        const existingItem = cart.find(c => c.productId === item.productId);
        
        if (existingItem) {
            // Item already in cart, update quantity if needed
            const maxQuantity = Math.min(item.quantity, item.availableQuantity);
            if (existingItem.quantity < maxQuantity) {
                existingItem.quantity = maxQuantity;
            }
        } else {
            // Add new item to cart
            cart.push({
                productId: item.productId,
                quantity: item.quantity,
                name: item.name,
                price: item.price,
                unit: item.unit,
                outOfStock: false
            });
        }
    });
    
    // Mark unavailable items in cart (if they exist)
    unavailableItems.forEach(unavailable => {
        const cartItem = cart.find(c => c.name === unavailable.name);
        if (cartItem) {
            cartItem.outOfStock = true;
        }
    });
    
    saveCart();
    updateCartUI();
    displayProducts();
    
    // Show notification
    let message = `Added ${items.length} item(s) to cart.`;
    if (unavailableItems.length > 0) {
        message += `\n\n${unavailableItems.length} item(s) unavailable:\n`;
        unavailableItems.forEach(item => {
            message += `• ${item.name} - ${item.reason}\n`;
        });
    }
    alert(message);
}

