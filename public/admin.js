const API_BASE = window.location.origin + '/api';

let inventory = [];
let orders = [];
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
        document.getElementById('gstin').value = storeDetails.gstin || '';
        document.getElementById('upi-id').value = storeDetails.upiId || '';
        document.getElementById('payment-instructions').value = storeDetails.instructions || '';
        
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
    } catch (error) {
        console.error('Error loading store details:', error);
    }
}

async function savePaymentSettings(event) {
    event.preventDefault();
    
    const storeName = document.getElementById('store-name').value.trim();
    const contactNumber1 = document.getElementById('contact-number-1').value.trim();
    const contactNumber2 = document.getElementById('contact-number-2').value.trim();
    const email = document.getElementById('store-email').value.trim();
    const address = document.getElementById('address').value.trim();
    const gstin = document.getElementById('gstin').value.trim();
    const upiId = document.getElementById('upi-id').value.trim();
    const instructions = document.getElementById('payment-instructions').value.trim();
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
                gstin, 
                upiId, 
                instructions 
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

