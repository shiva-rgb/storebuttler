const API_BASE = window.location.origin + '/api';

let orders = [];

// Get store slug from URL
function getStoreSlug() {
    const urlParams = new URLSearchParams(window.location.search);
    const store = urlParams.get('store');
    if (store) return store;
    
    const path = window.location.pathname;
    const segments = path.split('/').filter(s => s);
    if (segments.length === 0 || segments[0] === 'guest') {
        return 'guest';
    }
    return segments[segments.length - 1];
}

// Load orders on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndLoadOrders();
});

async function checkAuthAndLoadOrders() {
    try {
        // Check if customer is logged in
        const authResponse = await fetch(`${API_BASE}/customer-auth/me`, {
            credentials: 'include'
        });
        
        if (!authResponse.ok) {
            // Not logged in, redirect to login
            const storeSlug = getStoreSlug();
            window.location.href = `/customer-login.html?store=${storeSlug}`;
            return;
        }
        
        // Load orders
        await loadOrders();
    } catch (error) {
        console.error('Error checking auth:', error);
        const storeSlug = getStoreSlug();
        window.location.href = `/customer-login.html?store=${storeSlug}`;
    }
}

async function loadOrders(showLoading = false) {
    try {
        if (showLoading) {
            document.getElementById('orders-container').innerHTML = 
                '<p class="loading">Loading orders...</p>';
        }
        
        const response = await fetch(`${API_BASE}/customer/orders`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Not authenticated, redirect to login
                const storeSlug = getStoreSlug();
                window.location.href = `/customer-login.html?store=${storeSlug}`;
                return;
            }
            throw new Error('Failed to load orders');
        }
        
        orders = await response.json();
        displayOrders();
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('orders-container').innerHTML = 
            '<p class="loading" style="color: red;">Error loading orders. Please try again.</p>';
    }
}

async function refreshOrders() {
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = document.getElementById('refresh-icon');
    
    // Disable button and show spinning animation
    refreshBtn.classList.add('loading');
    refreshIcon.classList.add('spinning');
    
    try {
        await loadOrders(true);
    } finally {
        // Re-enable button and stop animation after a short delay
        setTimeout(() => {
            refreshBtn.classList.remove('loading');
            refreshIcon.classList.remove('spinning');
        }, 500);
    }
}

function displayOrders() {
    const container = document.getElementById('orders-container');
    
    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-orders"><h3>No orders yet</h3><p>Your order history will appear here.</p></div>';
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const date = new Date(order.createdAt);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const statusClass = `status-${order.status}`;
        const statusText = order.status.charAt(0).toUpperCase() + order.status.slice(1);
        
        const itemsHtml = order.items.map(item => `
            <div class="order-item">
                <span>${item.productName} × ${item.quantity}</span>
                <span>₹${(item.productPrice * item.quantity).toFixed(2)}</span>
            </div>
        `).join('');
        
        // Payment status display
        const paymentStatusHtml = order.paymentMethod === 'online' 
            ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                    <strong style="color: #666;">Payment:</strong>
                    <span style="background: ${order.paymentStatus === 'paid' ? '#28a745' : order.paymentStatus === 'failed' ? '#dc3545' : '#ffc107'}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">
                        ${order.paymentStatus === 'paid' ? 'Paid Online' : order.paymentStatus === 'failed' ? 'Payment Failed' : 'Payment Pending'}
                    </span>
                </div>
                ${order.razorpayPaymentId ? `<div style="color: #666; font-size: 0.85em; margin-top: 5px;">Payment ID: ${order.razorpayPaymentId}</div>` : ''}
            </div>`
            : `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <strong style="color: #666;">Payment:</strong>
                    <span style="background: #6c757d; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">COD</span>
                </div>
            </div>`;
        
        return `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <div class="order-id">Order #${order.id}</div>
                        <div class="order-date">${formattedDate}</div>
                    </div>
                    <span class="order-status ${statusClass}">${statusText}</span>
                </div>
                <div class="order-items">
                    ${itemsHtml}
                </div>
                <div class="order-total">Total: ₹${order.total.toFixed(2)}</div>
                ${paymentStatusHtml}
                <button class="repeat-order-btn" onclick="repeatOrder('${order.id}')">Repeat this order</button>
            </div>
        `;
    }).join('');
}

async function repeatOrder(orderId) {
    try {
        // Get order details
        const response = await fetch(`${API_BASE}/customer/orders/${orderId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load order details');
        }
        
        const order = await response.json();
        
        // Get current products to check availability
        const storeSlug = getStoreSlug();
        const productsResponse = await fetch(`${API_BASE}/store/${storeSlug}/products`);
        const products = await productsResponse.json();
        
        // Create a map of product IDs to products for quick lookup
        const productMap = {};
        products.forEach(p => {
            productMap[p.id] = p;
        });
        
        // Prepare items to add to cart
        const itemsToAdd = [];
        const unavailableItems = [];
        
        order.items.forEach(orderItem => {
            const product = productMap[orderItem.productId];
            
            if (!product) {
                // Product no longer exists
                unavailableItems.push({
                    name: orderItem.productName,
                    reason: 'Product no longer available'
                });
            } else if (product.quantity === 0) {
                // Product out of stock
                unavailableItems.push({
                    name: orderItem.productName,
                    reason: 'Out of Stock'
                });
            } else {
                // Product available - add to cart
                const quantity = Math.min(orderItem.quantity, product.quantity);
                itemsToAdd.push({
                    productId: product.id,
                    quantity: quantity,
                    name: product.name,
                    price: product.price,
                    unit: product.unit || '',
                    originalQuantity: orderItem.quantity,
                    availableQuantity: product.quantity
                });
                
                if (quantity < orderItem.quantity) {
                    unavailableItems.push({
                        name: orderItem.productName,
                        reason: `Only ${product.quantity} available (requested ${orderItem.quantity})`
                    });
                }
            }
        });
        
        // Store items in localStorage to add to cart
        // We'll use a special key that store.js will check
        const repeatOrderData = {
            items: itemsToAdd,
            unavailableItems: unavailableItems,
            timestamp: Date.now()
        };
        localStorage.setItem('repeatOrder', JSON.stringify(repeatOrderData));
        
        // Redirect to store
        window.location.href = storeSlug === 'guest' ? '/guest' : `/${storeSlug}`;
        
    } catch (error) {
        console.error('Error repeating order:', error);
        alert('Error loading order details. Please try again.');
    }
}

function goBackToStore() {
    const storeSlug = getStoreSlug();
    window.location.href = storeSlug === 'guest' ? '/guest' : `/${storeSlug}`;
}

async function logout() {
    try {
        const response = await fetch(`${API_BASE}/customer-auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            const storeSlug = getStoreSlug();
            window.location.href = storeSlug === 'guest' ? '/guest' : `/${storeSlug}`;
        }
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

