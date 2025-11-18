const API_BASE = window.location.origin + '/api';

let inventory = [];
let orders = [];
let customers = [];
let filteredCustomers = [];
let sortColumn = null;
let sortDirection = 'asc';
let filteredInventory = [];
let filteredOrders = [];
let orderFilters = {
    dateFrom: '',
    dateTo: '',
    status: '',
    orderId: ''
};

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
    }
    
    loadInventory();
    loadOrders();
    loadCustomers();
    loadPaymentSettings();
    
    document.getElementById('upload-form').addEventListener('submit', handleUpload);
});

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            credentials: 'include'
        });
        return response.ok;
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Logout function
async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        // Still redirect even if logout fails
        window.location.href = 'login.html';
    }
}

function switchTab(tabName, buttonElement) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Add active class to clicked button
    buttonElement.classList.add('active');
}

async function handleUpload(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('file-input');
    const statusDiv = document.getElementById('upload-status');
    
    if (!fileInput.files[0]) {
        statusDiv.innerHTML = '<div class="error">Please select a file</div>';
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    statusDiv.innerHTML = '<div>Uploading and processing...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/upload-inventory`, {
            credentials: 'include',
            method: 'POST',
            body: formData
        });
        
        // Read response as text first (so we can see what we got if parsing fails)
        const text = await response.text();
        let result;
        
        // Try to parse as JSON
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            // If it's not JSON, show the raw response
            console.error('Response is not JSON:', text);
            statusDiv.innerHTML = `<div class="error">Server error: ${response.status} ${response.statusText}. Response: ${text.substring(0, 300)}</div>`;
            return;
        }
        
        if (response.ok) {
            statusDiv.innerHTML = `<div class="success">${result.message}</div>`;
            fileInput.value = '';
            // Reload inventory which will also populate category filter
            await loadInventory();
        } else {
            statusDiv.innerHTML = `<div class="error">Error: ${result.error || 'Unknown error'}</div>`;
        }
    } catch (error) {
        console.error('Upload error:', error);
        if (error.message.includes('fetch')) {
            statusDiv.innerHTML = `<div class="error">Cannot connect to server. Please make sure the server is running on ${API_BASE}</div>`;
        } else {
            statusDiv.innerHTML = `<div class="error">Error uploading file: ${error.message}</div>`;
        }
    }
}

async function loadInventory() {
    try {
        const response = await fetch(`${API_BASE}/inventory`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        inventory = data;
        // Debug: log first product to check for unit field
        if (inventory.length > 0) {
            console.log('Sample inventory product:', inventory[0]);
            console.log('Has unit field?', 'unit' in inventory[0]);
        }
        populateCategoryFilter();
        filterInventory();
    } catch (error) {
        console.error('Error loading inventory:', error);
        const errorMessage = error.message || 'Unknown error';
        document.getElementById('inventory-table-body').innerHTML = 
            `<tr><td colspan="7" class="loading" style="color: red;">Error loading inventory: ${errorMessage}</td></tr>`;
    }
}

function populateCategoryFilter() {
    // Get all unique categories from inventory
    const categories = [...new Set(inventory.map(product => 
        product.category || 'Uncategorized'
    ))].sort();
    
    const categoryFilter = document.getElementById('filter-category');
    const currentValue = categoryFilter.value; // Preserve current selection
    
    // Clear and populate dropdown
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    
    // Restore previous selection if it still exists
    if (currentValue) {
        categoryFilter.value = currentValue;
    }
}

function filterInventory() {
    // Get all filter values
    const search = document.getElementById('search-inventory').value.toLowerCase();
    const filterName = document.getElementById('filter-name').value.toLowerCase();
    const filterPrice = document.getElementById('filter-price').value;
    const filterUnit = document.getElementById('filter-unit').value.toLowerCase();
    const filterQuantity = document.getElementById('filter-quantity').value;
    const filterCategory = document.getElementById('filter-category').value;
    
    // Apply filters
    filteredInventory = inventory.filter(product => {
        // Search filter (searches in name and category)
        const matchesSearch = !search || 
            product.name.toLowerCase().includes(search) ||
            (product.category && product.category.toLowerCase().includes(search));
        
        // Name filter
        const matchesName = !filterName || product.name.toLowerCase().includes(filterName);
        
        // Price filter
        let matchesPrice = true;
        if (filterPrice) {
            const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
            if (filterPrice === '0-50') {
                matchesPrice = price >= 0 && price <= 50;
            } else if (filterPrice === '50-100') {
                matchesPrice = price > 50 && price <= 100;
            } else if (filterPrice === '100-200') {
                matchesPrice = price > 100 && price <= 200;
            } else if (filterPrice === '200+') {
                matchesPrice = price > 200;
            }
        }
        
        // Quantity filter
        let matchesQuantity = true;
        if (filterQuantity) {
            if (filterQuantity === '0') {
                matchesQuantity = product.quantity === 0;
            } else if (filterQuantity === '1-10') {
                matchesQuantity = product.quantity >= 1 && product.quantity <= 10;
            } else if (filterQuantity === '11-50') {
                matchesQuantity = product.quantity >= 11 && product.quantity <= 50;
            } else if (filterQuantity === '51-100') {
                matchesQuantity = product.quantity >= 51 && product.quantity <= 100;
            } else if (filterQuantity === '100+') {
                matchesQuantity = product.quantity > 100;
            }
        }
        
        // Unit filter
        const matchesUnit = !filterUnit || 
            (product.unit && product.unit.toLowerCase().includes(filterUnit));
        
        // Category filter (exact match)
        const matchesCategory = !filterCategory || 
            (product.category || 'Uncategorized') === filterCategory;
        
        return matchesSearch && matchesName && matchesPrice && matchesUnit && matchesQuantity && matchesCategory;
    });
    
    // Apply sorting
    applySorting();
    
    // Display results
    displayInventory();
}

function sortInventory(column) {
    // If clicking the same column, toggle direction
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    // Update sort indicators
    updateSortIndicators();
    
    // Apply sorting and display
    applySorting();
    displayInventory();
}

function applySorting() {
    if (!sortColumn) return;
    
    filteredInventory.sort((a, b) => {
        let aVal, bVal;
        
        switch(sortColumn) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
            case 'price':
                aVal = typeof a.price === 'number' ? a.price : parseFloat(a.price) || 0;
                bVal = typeof b.price === 'number' ? b.price : parseFloat(b.price) || 0;
                break;
            case 'quantity':
                aVal = a.quantity;
                bVal = b.quantity;
                break;
            case 'category':
                aVal = (a.category || 'Uncategorized').toLowerCase();
                bVal = (b.category || 'Uncategorized').toLowerCase();
                break;
            default:
                return 0;
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortIndicators() {
    // Clear all indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });
    
    if (sortColumn) {
        const indicator = document.getElementById(`sort-${sortColumn}`);
        if (indicator) {
            indicator.textContent = sortDirection === 'asc' ? ' ▲' : ' ▼';
        }
    }
}

function displayInventory() {
    const tbody = document.getElementById('inventory-table-body');
    const countElement = document.getElementById('inventory-count');
    
    if (filteredInventory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No products found matching the filters.</td></tr>';
        updateDeleteButtonState();
        // Update count message
        if (countElement) {
            const totalCount = inventory.length;
            if (totalCount > 0) {
                countElement.textContent = `${totalCount} Product${totalCount !== 1 ? 's' : ''} added`;
            } else {
                countElement.textContent = '';
            }
        }
        return;
    }
    
    tbody.innerHTML = filteredInventory.map(product => {
        // Ensure price is a number before calling toFixed
        const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
        return `
        <tr>
            <td><input type="checkbox" class="product-checkbox" value="${product.id}" onchange="updateDeleteButtonState()"></td>
            <td>${product.name}</td>
            <td>₹${price.toFixed(2)}</td>
            <td>${product.unit || '-'}</td>
            <td>${product.quantity}</td>
            <td>${product.category || 'Uncategorized'}</td>
            <td>
                <button class="action-btn edit-btn" onclick="editProduct('${product.id}')">Edit</button>
                <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">Delete</button>
            </td>
        </tr>
    `;
    }).join('');
    
    updateDeleteButtonState();
    updateSelectAllCheckbox();
    
    // Update count message
    if (countElement) {
        const totalCount = inventory.length;
        if (totalCount > 0) {
            countElement.textContent = `${totalCount} Product${totalCount !== 1 ? 's' : ''} added`;
        } else {
            countElement.textContent = '';
        }
    }
}

function clearFilters() {
    document.getElementById('search-inventory').value = '';
    document.getElementById('filter-name').value = '';
    document.getElementById('filter-price').value = '';
    document.getElementById('filter-unit').value = '';
    document.getElementById('filter-quantity').value = '';
    document.getElementById('filter-category').value = '';
    sortColumn = null;
    sortDirection = 'asc';
    updateSortIndicators();
    filterInventory();
}

function openAddModal() {
    document.getElementById('add-modal').style.display = 'block';
    // Clear form
    document.getElementById('add-form').reset();
}

function closeAddModal() {
    document.getElementById('add-modal').style.display = 'none';
}

async function addProduct(event) {
    event.preventDefault();
    
    const productData = {
        name: document.getElementById('add-name').value,
        price: parseFloat(document.getElementById('add-price').value),
        quantity: parseInt(document.getElementById('add-quantity').value),
        unit: document.getElementById('add-unit').value,
        category: document.getElementById('add-category').value,
        description: document.getElementById('add-description').value,
        image: document.getElementById('add-image').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/inventory`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        
        // Read response as text first (so we can see what we got if parsing fails)
        const text = await response.text();
        let result;
        
        // Try to parse as JSON
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            // If it's not JSON, show the raw response
            console.error('Response is not JSON:', text);
            alert('Server error: ' + response.status + ' ' + response.statusText + '. Please check the server console for errors.');
            return;
        }
        
        if (response.ok) {
            closeAddModal();
            // Reload inventory and reapply filters
            try {
                const response = await fetch(`${API_BASE}/inventory`, {
            credentials: 'include'
        });
                inventory = await response.json();
                populateCategoryFilter();
                filterInventory();
            } catch (error) {
                console.error('Error reloading inventory:', error);
                loadInventory();
            }
            alert('Product added successfully!');
        } else {
            alert('Error adding product: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error adding product:', error);
        if (error.message.includes('fetch')) {
            alert('Cannot connect to server. Please make sure the server is running on ' + API_BASE);
        } else {
            alert('Error adding product: ' + error.message);
        }
    }
}

async function editProduct(id) {
    const product = inventory.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('edit-id').value = product.id;
    document.getElementById('edit-name').value = product.name;
    document.getElementById('edit-price').value = product.price;
    document.getElementById('edit-quantity').value = product.quantity;
    document.getElementById('edit-unit').value = product.unit || '';
    document.getElementById('edit-category').value = product.category || '';
    document.getElementById('edit-description').value = product.description || '';
    
    document.getElementById('edit-modal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveProduct(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-id').value;
    const productData = {
        name: document.getElementById('edit-name').value,
        price: parseFloat(document.getElementById('edit-price').value),
        quantity: parseInt(document.getElementById('edit-quantity').value),
        unit: document.getElementById('edit-unit').value,
        category: document.getElementById('edit-category').value,
        description: document.getElementById('edit-description').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/inventory/${id}`, {
            credentials: 'include',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        if (response.ok) {
            closeEditModal();
            // Reload inventory and reapply filters
            try {
                const response = await fetch(`${API_BASE}/inventory`, {
            credentials: 'include'
        });
                inventory = await response.json();
                populateCategoryFilter();
                filterInventory();
            } catch (error) {
                console.error('Error reloading inventory:', error);
                loadInventory();
            }
        } else {
            alert('Error updating product');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Error saving product');
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/inventory/${id}`, {
            credentials: 'include',
            method: 'DELETE'
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        if (response.ok) {
            // Reload inventory and reapply filters
            try {
                const response = await fetch(`${API_BASE}/inventory`, {
            credentials: 'include'
        });
                inventory = await response.json();
                populateCategoryFilter();
                filterInventory();
            } catch (error) {
                console.error('Error reloading inventory:', error);
                loadInventory();
            }
        } else {
            alert('Error deleting product');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Error deleting product');
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.product-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateDeleteButtonState();
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.product-checkbox');
    
    if (checkboxes.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }
    
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    if (checkedCount === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
    } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
    }
}

function updateDeleteButtonState() {
    const checkboxes = document.querySelectorAll('.product-checkbox');
    const deleteBtn = document.getElementById('delete-selected-btn');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    deleteBtn.disabled = checkedCount === 0;
    
    if (checkedCount > 0) {
        deleteBtn.textContent = `Delete Selected (${checkedCount})`;
    } else {
        deleteBtn.textContent = 'Delete Selected';
    }
    
    updateSelectAllCheckbox();
}

async function deleteSelected() {
    const checkboxes = document.querySelectorAll('.product-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
        alert('No products selected');
        return;
    }
    
    const count = selectedIds.length;
    if (!confirm(`Are you sure you want to delete ${count} product(s)?`)) {
        return;
    }
    
    // Delete products one by one
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of selectedIds) {
        try {
            const response = await fetch(`${API_BASE}/inventory/${id}`, {
            credentials: 'include',
                method: 'DELETE'
            });
            
            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`Error deleting product ${id}:`, error);
            errorCount++;
        }
    }
    
    if (successCount > 0) {
        // Reload inventory and reapply filters
        try {
            const response = await fetch(`${API_BASE}/inventory`, {
            credentials: 'include'
        });
            inventory = await response.json();
            populateCategoryFilter();
            filterInventory();
        } catch (error) {
            console.error('Error reloading inventory:', error);
            loadInventory();
        }
        
        if (errorCount > 0) {
            alert(`Deleted ${successCount} product(s). ${errorCount} product(s) failed to delete.`);
        }
    } else {
        alert('Failed to delete selected products');
    }
}

async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        orders = await response.json();
        filterOrders();
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('orders-container').innerHTML = 
            '<p class="loading">Error loading orders</p>';
    }
}

function filterOrders() {
    // Get filter values
    const orderIdFilter = document.getElementById('filter-order-id')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('filter-order-status')?.value || '';
    const dateFromFilter = document.getElementById('filter-date-from')?.value || '';
    const dateToFilter = document.getElementById('filter-date-to')?.value || '';
    
    // Update filter object
    orderFilters.orderId = orderIdFilter;
    orderFilters.status = statusFilter;
    orderFilters.dateFrom = dateFromFilter;
    orderFilters.dateTo = dateToFilter;
    
    // If no filters are active, set filteredOrders to empty array (will use all orders in displayOrders)
    if (!orderIdFilter && !statusFilter && !dateFromFilter && !dateToFilter) {
        filteredOrders = [];
        displayOrders();
        return;
    }
    
    // Filter orders
    filteredOrders = orders.filter(order => {
        // Order ID filter
        if (orderIdFilter && !order.id.toLowerCase().includes(orderIdFilter)) {
            return false;
        }
        
        // Status filter
        if (statusFilter && order.status !== statusFilter) {
            return false;
        }
        
        // Date filters
        if (dateFromFilter || dateToFilter) {
            const orderDate = new Date(order.createdAt);
            orderDate.setHours(0, 0, 0, 0); // Reset time to start of day
            
            if (dateFromFilter) {
                const fromDate = new Date(dateFromFilter);
                fromDate.setHours(0, 0, 0, 0);
                if (orderDate < fromDate) {
                    return false;
                }
            }
            
            if (dateToFilter) {
                const toDate = new Date(dateToFilter);
                toDate.setHours(23, 59, 59, 999); // End of day
                if (orderDate > toDate) {
                    return false;
                }
            }
        }
        
        return true;
    });
    
    displayOrders();
}

function clearOrderFilters() {
    document.getElementById('filter-order-id').value = '';
    document.getElementById('filter-order-status').value = '';
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    
    orderFilters = {
        dateFrom: '',
        dateTo: '',
        status: '',
        orderId: ''
    };
    
    filterOrders();
}

function displayOrders() {
    const container = document.getElementById('orders-container');
    const countElement = document.getElementById('orders-count');
    
    if (orders.length === 0) {
        container.innerHTML = '<p class="loading">No orders yet</p>';
        if (countElement) countElement.textContent = '';
        const totalElement = document.getElementById('orders-total');
        if (totalElement) totalElement.style.display = 'none';
        return;
    }
    
    // Use filtered orders if filters are active, otherwise use all orders
    const hasActiveFilters = orderFilters.orderId || orderFilters.status || orderFilters.dateFrom || orderFilters.dateTo;
    const ordersToDisplay = hasActiveFilters ? filteredOrders : orders;
    
    // Update count
    if (countElement) {
        const totalCount = orders.length;
        const filteredCount = ordersToDisplay.length;
        if (filteredCount < totalCount) {
            countElement.textContent = `Showing ${filteredCount} of ${totalCount} orders`;
        } else {
            countElement.textContent = `Total: ${totalCount} order${totalCount !== 1 ? 's' : ''}`;
        }
    }
    
    // Calculate and display total order value
    const totalElement = document.getElementById('orders-total');
    const totalAmountElement = document.getElementById('orders-total-amount');
    if (totalElement && totalAmountElement) {
        if (ordersToDisplay.length > 0) {
            const totalValue = ordersToDisplay.reduce((sum, order) => {
                return sum + (parseFloat(order.total) || 0);
            }, 0);
            totalAmountElement.textContent = `₹${totalValue.toFixed(2)}`;
            totalElement.style.display = 'flex';
        } else {
            totalElement.style.display = 'none';
        }
    }
    
    if (ordersToDisplay.length === 0) {
        container.innerHTML = '<p class="loading">No orders match the selected filters</p>';
        return;
    }
    
    // Sort orders by date (newest first)
    const sortedOrders = [...ordersToDisplay].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    container.innerHTML = sortedOrders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <strong>Order #${order.id}</strong>
                    <p style="color: #666; font-size: 0.9em; margin-top: 5px;">
                        ${new Date(order.createdAt).toLocaleString()}
                    </p>
                </div>
                <select class="order-status ${order.status}" onchange="updateOrderStatus('${order.id}', this.value)" style="padding: 5px 15px; border-radius: 20px; border: none; font-weight: bold;">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </div>
            <div class="order-items">
                ${order.items.map(item => {
                    // Use stored product info if available, otherwise try to find in inventory
                    const productName = item.productName || (inventory.find(p => p.id === item.productId)?.name) || 'Unknown Product';
                    const productPrice = item.productPrice !== undefined ? item.productPrice : (inventory.find(p => p.id === item.productId)?.price || 0);
                    const itemTotal = productPrice * item.quantity;
                    return `
                        <div class="order-item">
                            <span>${productName} × ${item.quantity}</span>
                            <span>₹${itemTotal.toFixed(2)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="order-total">Total: ₹${order.total.toFixed(2)}</div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <strong>Payment:</strong>
                    ${order.paymentMethod === 'online' 
                        ? `<span style="background: ${order.paymentStatus === 'paid' ? '#28a745' : order.paymentStatus === 'failed' ? '#dc3545' : '#ffc107'}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">
                            ${order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'failed' ? 'Payment Failed' : 'Payment Pending'}
                        </span>`
                        : `<span style="background: #6c757d; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">COD</span>`
                    }
                    ${order.razorpayPaymentId ? `<span style="color: #666; font-size: 0.85em;">Payment ID: ${order.razorpayPaymentId}</span>` : ''}
                </div>
                <p><strong>Customer:</strong> ${order.customerInfo.name || 'N/A'}</p>
                <p><strong>Email:</strong> ${order.customerInfo.email || 'N/A'}</p>
                <p><strong>Phone:</strong> ${order.customerInfo.phone || 'N/A'}</p>
                <p><strong>Address:</strong> ${order.customerInfo.address || 'N/A'}</p>
            </div>
        </div>
    `).join('');
}

async function updateOrderStatus(orderId, status) {
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        if (response.ok) {
            loadOrders();
        } else {
            alert('Error updating order status');
        }
    } catch (error) {
        console.error('Error updating order:', error);
        alert('Error updating order status');
    }
}

// Store Details Functions
async function loadPaymentSettings() {
    try {
        const response = await fetch(`${API_BASE}/payment`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        const storeDetails = await response.json();
        
        document.getElementById('store-name').value = storeDetails.storeName || '';
        document.getElementById('contact-number-1').value = storeDetails.contactNumber1 || '';
        document.getElementById('contact-number-2').value = storeDetails.contactNumber2 || '';
        document.getElementById('store-email').value = storeDetails.email || '';
        document.getElementById('address').value = storeDetails.address || '';
        document.getElementById('payment-instructions').value = storeDetails.instructions || '';
        document.getElementById('minimum-order-value').value = storeDetails.minimumOrderValue || '';
        
        // Load operating schedule
        loadOperatingSchedule(storeDetails);
        
        // Update toggle switch and status text
        const toggle = document.getElementById('store-live-toggle');
        const statusText = document.getElementById('store-status-text');
        if (toggle) {
            toggle.checked = storeDetails.isLive || false;
            if (statusText) {
                statusText.textContent = toggle.checked ? 'Live' : 'Under Maintenance';
                statusText.style.color = toggle.checked ? '#28a745' : '#dc3545';
            }
        }
        
        // Generate and show public link
        if (storeDetails.storeName) {
            goLive();
        }
        
        // Load Razorpay payment settings
        await loadRazorpaySettings(storeDetails);
    } catch (error) {
        console.error('Error loading store details:', error);
    }
}

// Store original key secret for edit mode
let originalKeySecret = null;
let isKeysEditMode = false;

async function loadRazorpaySettings(storeDetails) {
    try {
        const toggle = document.getElementById('online-payment-toggle');
        const message = document.getElementById('payment-toggle-message');
        const keysSection = document.getElementById('razorpay-keys-section');
        const keyIdInput = document.getElementById('razorpay-key-id');
        const keySecretInput = document.getElementById('razorpay-key-secret');
        const editBtn = document.getElementById('edit-keys-btn');
        const saveBtn = document.getElementById('save-keys-btn');
        
        if (!toggle || !message || !keysSection) return;
        
        // Always populate key fields from database if they exist, regardless of online payment status
        // This ensures keys are preserved even when online payment is disabled
        if (storeDetails.razorpayKeyId) {
            if (keyIdInput) {
                keyIdInput.value = storeDetails.razorpayKeyId;
            }
            // Show masked secret if keys exist
            if (keySecretInput) {
                keySecretInput.value = '••••••••••••••••';
                originalKeySecret = '••••••••••••••••'; // Placeholder to indicate secret exists
            }
        } else {
            // Only clear if keys don't exist in database
            if (keyIdInput) keyIdInput.value = '';
            if (keySecretInput) keySecretInput.value = '';
            originalKeySecret = null;
        }
        
        // Check if online payment is enabled
        if (storeDetails.onlinePaymentEnabled && storeDetails.razorpayKeyId) {
            toggle.checked = true;
            message.textContent = 'Online payment is enabled';
            message.style.color = '#28a745';
            keysSection.style.display = 'block';
            
            // Set to view mode
            setKeysViewMode();
        } else {
            toggle.checked = false;
            message.textContent = 'COD is selected by default';
            message.style.color = '#666';
            keysSection.style.display = 'none';
            
            // Set to view mode if keys exist (so they're ready when user enables toggle)
            if (storeDetails.razorpayKeyId) {
                setKeysViewMode();
            }
        }
    } catch (error) {
        console.error('Error loading Razorpay settings:', error);
    }
}

function setKeysViewMode() {
    const keyIdInput = document.getElementById('razorpay-key-id');
    const keySecretInput = document.getElementById('razorpay-key-secret');
    const editBtn = document.getElementById('edit-keys-btn');
    const saveBtn = document.getElementById('save-keys-btn');
    
    if (keyIdInput) keyIdInput.readOnly = true;
    if (keySecretInput) keySecretInput.readOnly = true;
    if (editBtn) editBtn.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'none';
    isKeysEditMode = false;
}

function setKeysEditMode() {
    const keyIdInput = document.getElementById('razorpay-key-id');
    const keySecretInput = document.getElementById('razorpay-key-secret');
    const editBtn = document.getElementById('edit-keys-btn');
    const saveBtn = document.getElementById('save-keys-btn');
    
    if (keyIdInput) keyIdInput.readOnly = false;
    if (keySecretInput) {
        keySecretInput.readOnly = false;
        // Clear the masked value when entering edit mode
        if (keySecretInput.value === '••••••••••••••••') {
            keySecretInput.value = '';
        }
    }
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';
    isKeysEditMode = true;
}

async function toggleKeysEdit() {
    if (isKeysEditMode) {
        // Cancel edit - restore original values
        const keyIdInput = document.getElementById('razorpay-key-id');
        const keySecretInput = document.getElementById('razorpay-key-secret');
        
        // Reload from store details
        await loadPaymentSettings();
        setKeysViewMode();
    } else {
        setKeysEditMode();
    }
}

async function handlePaymentToggle() {
    const toggle = document.getElementById('online-payment-toggle');
    const keysSection = document.getElementById('razorpay-keys-section');
    const message = document.getElementById('payment-toggle-message');
    const keyIdInput = document.getElementById('razorpay-key-id');
    
    if (toggle.checked) {
        // Check if keys are already saved (either in input field or need to reload from database)
        let hasKeys = keyIdInput && keyIdInput.value && keyIdInput.value.trim() !== '' && keyIdInput.value !== '••••••••••••••••';
        
        // If keys not found in input, try to reload from database
        if (!hasKeys) {
            try {
                const response = await fetch(`${API_BASE}/payment`, {
                    credentials: 'include'
                });
                if (response.ok) {
                    const storeDetails = await response.json();
                    if (storeDetails.razorpayKeyId) {
                        // Keys exist in database, populate the fields
                        if (keyIdInput) {
                            keyIdInput.value = storeDetails.razorpayKeyId;
                        }
                        const keySecretInput = document.getElementById('razorpay-key-secret');
                        if (keySecretInput) {
                            keySecretInput.value = '••••••••••••••••';
                            originalKeySecret = '••••••••••••••••';
                        }
                        hasKeys = true;
                    }
                }
            } catch (error) {
                console.error('Error checking for existing keys:', error);
            }
        }
        
        if (!hasKeys) {
            // Prevent enabling without keys - uncheck the toggle
            toggle.checked = false;
            alert('Please save Razorpay API keys first before enabling online payment.');
            
            // Show Razorpay keys section for entering keys
            if (keysSection) {
                keysSection.style.display = 'block';
            }
            message.textContent = 'Please enter and save your Razorpay API keys below to enable online payment';
            message.style.color = '#ffc107';
            
            // Set to edit mode for new keys
            setKeysEditMode();
        } else {
            // Keys already exist, just show the section
            if (keysSection) {
                keysSection.style.display = 'block';
            }
            message.textContent = 'Online payment is enabled';
            message.style.color = '#28a745';
            
            // Set to view mode if not already in edit mode
            if (!isKeysEditMode) {
                setKeysViewMode();
            }
            
            // Save the enabled state to database
            await updateOnlinePaymentStatus(true);
        }
    } else {
        // Hide Razorpay keys section
        if (keysSection) {
            keysSection.style.display = 'none';
        }
        message.textContent = 'COD is selected by default';
        message.style.color = '#666';
        
        // Save the disabled state to database
        await updateOnlinePaymentStatus(false);
    }
}

async function updateOnlinePaymentStatus(enabled) {
    try {
        const response = await fetch(`${API_BASE}/payment/online-payment-status`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                onlinePaymentEnabled: enabled
            })
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            console.error('Error updating online payment status:', result.error);
            // Revert toggle on error
            const toggle = document.getElementById('online-payment-toggle');
            if (toggle) {
                toggle.checked = !enabled;
            }
            alert('Error updating online payment status. Please try again.');
        }
    } catch (error) {
        console.error('Error updating online payment status:', error);
        // Revert toggle on error
        const toggle = document.getElementById('online-payment-toggle');
        if (toggle) {
            toggle.checked = !enabled;
        }
        alert('Error updating online payment status. Please try again.');
    }
}

async function saveRazorpayKeys() {
    const keyId = document.getElementById('razorpay-key-id').value.trim();
    const keySecretInput = document.getElementById('razorpay-key-secret');
    const keySecret = keySecretInput ? keySecretInput.value.trim() : '';
    const toggle = document.getElementById('online-payment-toggle');
    
    if (!toggle.checked) {
        alert('Please enable online payment first by toggling the switch.');
        return;
    }
    
    if (!keyId) {
        alert('Please enter Razorpay Key ID.');
        return;
    }
    
    // If secret is masked or empty, we'll send a flag to keep existing secret
    const isSecretMasked = keySecret === '••••••••••••••••' || keySecret === '';
    const needsNewSecret = !isSecretMasked;
    
    if (!needsNewSecret && originalKeySecret !== '••••••••••••••••') {
        alert('Please enter Razorpay Key Secret.');
        return;
    }
    
    // Validate key_id format
    if (!keyId.startsWith('rzp_live_') && !keyId.startsWith('rzp_test_')) {
        if (!confirm('Key ID should start with "rzp_live_" or "rzp_test_". Do you want to continue anyway?')) {
            return;
        }
    }
    
    try {
        const requestBody = {
            razorpayKeyId: keyId,
            onlinePaymentEnabled: true
        };
        
        // Only include key_secret if user provided a new one
        if (needsNewSecret) {
            requestBody.razorpayKeySecret = keySecret;
        } else {
            // Send flag to keep existing secret
            requestBody.keepExistingSecret = true;
        }
        
        const response = await fetch(`${API_BASE}/payment/razorpay-keys`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) {
            alert('Razorpay keys saved successfully! Online payment is now enabled.');
            
            // Enable the toggle
            if (toggle) {
                toggle.checked = true;
            }
            
            // Update UI
            const message = document.getElementById('payment-toggle-message');
            message.textContent = 'Online payment is enabled';
            message.style.color = '#28a745';
            
            // Show masked secret
            if (keySecretInput) {
                keySecretInput.value = '••••••••••••••••';
                originalKeySecret = '••••••••••••••••';
            }
            
            // Set to view mode
            setKeysViewMode();
            
            // Reload store details to refresh UI
            await loadPaymentSettings();
        } else {
            alert('Error saving Razorpay keys: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving Razorpay keys:', error);
        alert('Error saving Razorpay keys: ' + (error.message || 'Please check the console for details.'));
    }
}

async function savePaymentSettings(event) {
    event.preventDefault();
    
    const storeName = document.getElementById('store-name').value.trim();
    const contactNumber1 = document.getElementById('contact-number-1').value.trim();
    const contactNumber2 = document.getElementById('contact-number-2').value.trim();
    const email = document.getElementById('store-email').value.trim();
    const address = document.getElementById('address').value.trim();
    const instructions = document.getElementById('payment-instructions').value.trim();
    const minimumOrderValue = document.getElementById('minimum-order-value').value.trim();
    const statusDiv = document.getElementById('payment-status');
    
    if (!storeName) {
        statusDiv.innerHTML = '<div class="error">Store Name is required</div>';
        return;
    }
    
    if (!contactNumber1) {
        statusDiv.innerHTML = '<div class="error">Contact Number 1 is required</div>';
        return;
    }
    
    if (!address) {
        statusDiv.innerHTML = '<div class="error">Address is required</div>';
        return;
    }
    
    // UPI ID is now optional (disabled)
    // if (!upiId) {
    //     statusDiv.innerHTML = '<div class="error">UPI ID is required</div>';
    //     return;
    // }
    
    try {
        const response = await fetch(`${API_BASE}/payment`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                storeName, 
                contactNumber1, 
                contactNumber2, 
                email, 
                address, 
                instructions,
                minimumOrderValue: minimumOrderValue ? parseFloat(minimumOrderValue) : null
            })
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        // Read response as text first (so we can see what we got if parsing fails)
        const text = await response.text();
        let result;
        
        // Try to parse as JSON
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            // If it's not JSON, show the raw response
            console.error('Response is not JSON:', text);
            statusDiv.innerHTML = `<div class="error">Server error: ${response.status} ${response.statusText}. Please check the server console for errors.</div>`;
            return;
        }
        
        if (response.ok) {
            statusDiv.innerHTML = '<div class="success">Store details saved successfully!</div>';
        } else {
            statusDiv.innerHTML = `<div class="error">Error: ${result.error || 'Unknown error'}</div>`;
        }
    } catch (error) {
        console.error('Error saving store details:', error);
        if (error.message.includes('fetch')) {
            statusDiv.innerHTML = `<div class="error">Cannot connect to server. Please make sure the server is running on ${API_BASE}</div>`;
        } else {
            statusDiv.innerHTML = `<div class="error">Error saving store details: ${error.message}</div>`;
        }
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const addModal = document.getElementById('add-modal');
    const editModal = document.getElementById('edit-modal');
    
    if (event.target === addModal) {
        closeAddModal();
    }
    if (event.target === editModal) {
        closeEditModal();
    }
}

// Helper function to create URL-friendly slug from store name
function createSlug(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, and multiple hyphens with single hyphen
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

// Toggle store status
async function toggleStoreStatus() {
    const toggle = document.getElementById('store-live-toggle');
    const statusText = document.getElementById('store-status-text');
    const isLive = toggle.checked;
    
    try {
        const response = await fetch(`${API_BASE}/store/live-status`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isLive })
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        if (response.ok) {
            // Update status text
            if (statusText) {
                statusText.textContent = isLive ? 'Live' : 'Under Maintenance';
                statusText.style.color = isLive ? '#28a745' : '#dc3545';
            }
        } else {
            // Revert toggle on error
            toggle.checked = !isLive;
            const data = await response.json();
            alert('Error updating store status: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error toggling store status:', error);
        // Revert toggle on error
        toggle.checked = !isLive;
        alert('Error updating store status. Please try again.');
    }
}

// Generate public link
async function goLive() {
    try {
        // Fetch store details to get store name
        const response = await fetch(`${API_BASE}/payment`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            // Not authenticated, use guest
            return;
        }
        
        const storeDetails = await response.json();
        
        let storeSlug = 'guest'; // Default fallback
        if (storeDetails && storeDetails.storeName) {
            storeSlug = createSlug(storeDetails.storeName);
        }
        
        // Generate the public link using store name
        const protocol = window.location.protocol;
        const host = window.location.host;
        const publicLink = `${protocol}//${host}/${storeSlug}`;
        
        // Display the link container
        const linkContainer = document.getElementById('public-link-container');
        const linkInput = document.getElementById('public-link');
        
        if (linkContainer && linkInput) {
            linkInput.value = publicLink;
            linkContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error generating public link:', error);
    }
}

// Copy public link to clipboard
async function copyPublicLink() {
    const linkInput = document.getElementById('public-link');
    const copyStatus = document.getElementById('copy-status');
    
    try {
        // Use the Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(linkInput.value);
            copyStatus.innerHTML = '<span style="color: #28a745;">✓ Link copied to clipboard!</span>';
        } else {
            // Fallback for older browsers
            linkInput.select();
            linkInput.setSelectionRange(0, 99999); // For mobile devices
            document.execCommand('copy');
            copyStatus.innerHTML = '<span style="color: #28a745;">✓ Link copied to clipboard!</span>';
        }
        
        // Clear the status message after 3 seconds
        setTimeout(() => {
            copyStatus.innerHTML = '';
        }, 3000);
    } catch (error) {
        console.error('Error copying link:', error);
        copyStatus.innerHTML = '<span style="color: #dc3545;">✗ Failed to copy. Please select and copy manually.</span>';
    }
}

// About Us Modal Functions
function openAboutUs() {
    document.getElementById('about-us-modal').style.display = 'block';
}

function closeAboutUs() {
    document.getElementById('about-us-modal').style.display = 'none';
}

function closeAboutUsOnBackdrop(event) {
    if (event.target.id === 'about-us-modal') {
        closeAboutUs();
    }
}

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('about-us-modal');
        if (modal && modal.style.display === 'block') {
            closeAboutUs();
        }
    }
});

// Customer Management Functions
async function loadCustomers() {
    try {
        const response = await fetch(`${API_BASE}/admin/customers`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to load customers');
        }
        
        customers = await response.json();
        filteredCustomers = customers;
        displayCustomers();
    } catch (error) {
        console.error('Error loading customers:', error);
        const tbody = document.getElementById('customers-table-body');
        if (tbody) {
            const errorMessage = error.message || 'Error loading customers. Please try again.';
            tbody.innerHTML = `<tr><td colspan="3" class="loading" style="color: red;">${errorMessage}<br><small style="font-size: 0.8em;">Make sure the database migrations have been run (009_create_customers_table.sql and 010_add_customer_id_to_orders.sql)</small></td></tr>`;
        }
    }
}

function displayCustomers() {
    const tbody = document.getElementById('customers-table-body');
    const countSpan = document.getElementById('customers-count');
    
    if (!tbody) return;
    
    if (filteredCustomers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">No customers found</td></tr>';
        if (countSpan) countSpan.textContent = '0 customers';
        return;
    }
    
    tbody.innerHTML = filteredCustomers.map(customer => {
        const date = new Date(customer.registrationDate);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        });
        
        return `
            <tr>
                <td>${customer.name || 'N/A'}</td>
                <td>${customer.phone || 'N/A'}</td>
                <td>${formattedDate}</td>
                <td>
                    <button onclick="viewCustomerOrders(${customer.id}, '${(customer.name || 'Customer').replace(/'/g, "\\'")}')" 
                            style="background: #667eea; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 1.1em;" 
                            title="View Orders">
                        👁️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    if (countSpan) {
        countSpan.textContent = `${filteredCustomers.length} customer${filteredCustomers.length !== 1 ? 's' : ''}`;
    }
}

function filterCustomers() {
    const searchTerm = document.getElementById('search-customers').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredCustomers = customers;
    } else {
        filteredCustomers = customers.filter(customer => {
            const name = (customer.name || '').toLowerCase();
            const phone = (customer.phone || '').toLowerCase();
            return name.includes(searchTerm) || phone.includes(searchTerm);
        });
    }
    
    displayCustomers();
}

// Customer Orders Modal Functions
let currentCustomerOrders = [];
let filteredCustomerOrders = [];
let currentCustomerId = null;
let customerOrderFilters = {
    orderId: '',
    dateFrom: '',
    dateTo: ''
};

async function viewCustomerOrders(customerId, customerName) {
    currentCustomerId = customerId;
    const modal = document.getElementById('customer-orders-modal');
    const title = document.getElementById('customer-orders-title');
    const container = document.getElementById('customer-orders-container');
    
    if (title) {
        title.textContent = `Orders - ${customerName}`;
    }
    
    if (container) {
        container.innerHTML = '<p class="loading">Loading orders...</p>';
    }
    
    // Clear filters
    document.getElementById('filter-customer-order-id').value = '';
    document.getElementById('filter-customer-date-from').value = '';
    document.getElementById('filter-customer-date-to').value = '';
    customerOrderFilters = { orderId: '', dateFrom: '', dateTo: '' };
    
    // Show modal
    if (modal) {
        modal.style.display = 'block';
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/customers/${customerId}/orders`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load orders' }));
            throw new Error(errorData.error || 'Failed to load customer orders');
        }
        
        currentCustomerOrders = await response.json();
        filteredCustomerOrders = currentCustomerOrders;
        displayCustomerOrders();
    } catch (error) {
        console.error('Error loading customer orders:', error);
        if (container) {
            container.innerHTML = `<p class="loading" style="color: red;">Error loading orders: ${error.message}</p>`;
        }
    }
}

function displayCustomerOrders() {
    const container = document.getElementById('customer-orders-container');
    const countSpan = document.getElementById('customer-orders-count');
    const totalSpan = document.getElementById('customer-orders-total');
    
    if (!container) return;
    
    if (filteredCustomerOrders.length === 0) {
        container.innerHTML = '<p class="loading">No orders found for this customer.</p>';
        if (countSpan) countSpan.textContent = '0 orders';
        if (totalSpan) totalSpan.textContent = '₹0.00';
        return;
    }
    
    // Calculate total
    const totalValue = filteredCustomerOrders.reduce((sum, order) => {
        return sum + (parseFloat(order.total) || 0);
    }, 0);
    
    // Update summary
    if (countSpan) {
        const totalCount = currentCustomerOrders.length;
        const filteredCount = filteredCustomerOrders.length;
        if (filteredCount < totalCount) {
            countSpan.textContent = `Showing ${filteredCount} of ${totalCount} orders`;
        } else {
            countSpan.textContent = `${totalCount} order${totalCount !== 1 ? 's' : ''}`;
        }
    }
    if (totalSpan) {
        totalSpan.textContent = `₹${totalValue.toFixed(2)}`;
    }
    
    // Display orders
    container.innerHTML = filteredCustomerOrders.map(order => {
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
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
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
            <div class="order-card" style="margin-bottom: 20px;">
                <div class="order-header">
                    <div>
                        <strong>Order #${order.id}</strong>
                        <p style="color: #666; font-size: 0.9em; margin-top: 5px;">${formattedDate}</p>
                    </div>
                    <span class="order-status ${statusClass}">${statusText}</span>
                </div>
                <div class="order-items">
                    ${itemsHtml}
                </div>
                <div class="order-total">Total: ₹${order.total.toFixed(2)}</div>
                ${paymentStatusHtml}
            </div>
        `;
    }).join('');
}

function filterCustomerOrders() {
    const orderIdFilter = document.getElementById('filter-customer-order-id')?.value.toLowerCase().trim() || '';
    const dateFromFilter = document.getElementById('filter-customer-date-from')?.value || '';
    const dateToFilter = document.getElementById('filter-customer-date-to')?.value || '';
    
    customerOrderFilters.orderId = orderIdFilter;
    customerOrderFilters.dateFrom = dateFromFilter;
    customerOrderFilters.dateTo = dateToFilter;
    
    // Filter orders
    filteredCustomerOrders = currentCustomerOrders.filter(order => {
        // Order ID filter (check both formatted ID and original ID)
        if (orderIdFilter) {
            const orderIdStr = String(order.id).toLowerCase();
            if (!orderIdStr.includes(orderIdFilter)) {
                return false;
            }
        }
        
        // Date filters
        if (dateFromFilter || dateToFilter) {
            const orderDate = new Date(order.createdAt);
            orderDate.setHours(0, 0, 0, 0);
            
            if (dateFromFilter) {
                const fromDate = new Date(dateFromFilter);
                fromDate.setHours(0, 0, 0, 0);
                if (orderDate < fromDate) {
                    return false;
                }
            }
            
            if (dateToFilter) {
                const toDate = new Date(dateToFilter);
                toDate.setHours(23, 59, 59, 999);
                if (orderDate > toDate) {
                    return false;
                }
            }
        }
        
        return true;
    });
    
    displayCustomerOrders();
}

function clearCustomerOrderFilters() {
    document.getElementById('filter-customer-order-id').value = '';
    document.getElementById('filter-customer-date-from').value = '';
    document.getElementById('filter-customer-date-to').value = '';
    customerOrderFilters = { orderId: '', dateFrom: '', dateTo: '' };
    filterCustomerOrders();
}

function closeCustomerOrdersModal() {
    const modal = document.getElementById('customer-orders-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentCustomerOrders = [];
    filteredCustomerOrders = [];
    currentCustomerId = null;
}

// Operating Schedule Functions
function loadOperatingSchedule(storeDetails) {
    const toggle = document.getElementById('operating-schedule-toggle');
    const fields = document.getElementById('operating-schedule-fields');
    
    if (!toggle || !fields) return;
    
    // Set toggle state
    toggle.checked = storeDetails.operatingScheduleEnabled || false;
    
    // Show/hide fields based on toggle
    if (toggle.checked) {
        fields.style.display = 'block';
    } else {
        fields.style.display = 'none';
    }
    
    // Load days
    if (storeDetails.operatingScheduleDays) {
        const days = Array.isArray(storeDetails.operatingScheduleDays) 
            ? storeDetails.operatingScheduleDays 
            : JSON.parse(storeDetails.operatingScheduleDays || '[]');
        
        // Clear all checkboxes first
        document.querySelectorAll('input[name="operating-days"]').forEach(cb => {
            cb.checked = false;
        });
        
        // Set checked days
        days.forEach(day => {
            const dayMap = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
            const checkbox = document.getElementById(`day-${dayMap[day]}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }
    
    // Load times
    if (storeDetails.operatingScheduleStartTime) {
        document.getElementById('operating-schedule-start-time').value = storeDetails.operatingScheduleStartTime;
    }
    if (storeDetails.operatingScheduleEndTime) {
        document.getElementById('operating-schedule-end-time').value = storeDetails.operatingScheduleEndTime;
    }
    
    // Load timezone
    if (storeDetails.operatingScheduleTimezone) {
        document.getElementById('operating-schedule-timezone').value = storeDetails.operatingScheduleTimezone;
    }
}

function handleOperatingScheduleToggle() {
    const toggle = document.getElementById('operating-schedule-toggle');
    const fields = document.getElementById('operating-schedule-fields');
    
    if (!toggle || !fields) return;
    
    if (toggle.checked) {
        fields.style.display = 'block';
    } else {
        fields.style.display = 'none';
        // Save disabled state
        saveOperatingSchedule(false);
    }
}

async function saveOperatingSchedule(enabled = null) {
    const toggle = document.getElementById('operating-schedule-toggle');
    const statusDiv = document.getElementById('operating-schedule-status');
    
    if (!toggle) return;
    
    // If enabled is null, use toggle state; otherwise use provided value
    const isEnabled = enabled !== null ? enabled : toggle.checked;
    
    if (!isEnabled) {
        // Just disable the schedule
        try {
            const response = await fetch(`${API_BASE}/payment`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    operatingScheduleEnabled: false
                })
            });
            
            if (response.ok) {
                if (statusDiv) {
                    statusDiv.innerHTML = '<div class="success">Operating schedule disabled</div>';
                    setTimeout(() => {
                        statusDiv.innerHTML = '';
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('Error disabling operating schedule:', error);
        }
        return;
    }
    
    // Get selected days
    const selectedDays = Array.from(document.querySelectorAll('input[name="operating-days"]:checked'))
        .map(cb => parseInt(cb.value));
    
    if (selectedDays.length === 0) {
        if (statusDiv) {
            statusDiv.innerHTML = '<div class="error">Please select at least one operating day</div>';
        }
        return;
    }
    
    // Get times
    const startTime = document.getElementById('operating-schedule-start-time').value;
    const endTime = document.getElementById('operating-schedule-end-time').value;
    
    if (!startTime || !endTime) {
        if (statusDiv) {
            statusDiv.innerHTML = '<div class="error">Please set both start and end times</div>';
        }
        return;
    }
    
    // Validate start time < end time
    if (startTime >= endTime) {
        if (statusDiv) {
            statusDiv.innerHTML = '<div class="error">Start time must be before end time</div>';
        }
        return;
    }
    
    // Get timezone
    const timezone = document.getElementById('operating-schedule-timezone').value || 'Asia/Kolkata';
    
    try {
        const response = await fetch(`${API_BASE}/payment`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                operatingScheduleEnabled: true,
                operatingScheduleDays: selectedDays,
                operatingScheduleStartTime: startTime,
                operatingScheduleEndTime: endTime,
                operatingScheduleTimezone: timezone
            })
        });
        
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        
        if (response.ok) {
            const result = await response.json();
            if (statusDiv) {
                statusDiv.innerHTML = '<div class="success">Operating schedule saved successfully!</div>';
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 3000);
            }
            // Reload settings to reflect changes
            await loadPaymentSettings();
        } else {
            const error = await response.json();
            if (statusDiv) {
                statusDiv.innerHTML = `<div class="error">Error: ${error.error || 'Failed to save operating schedule'}</div>`;
            }
        }
    } catch (error) {
        console.error('Error saving operating schedule:', error);
        if (statusDiv) {
            statusDiv.innerHTML = '<div class="error">Error saving operating schedule. Please try again.</div>';
        }
    }
}


