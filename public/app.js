let API_KEY = localStorage.getItem('zk_api_key') || '';

document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login-overlay');
    
    // Check if we are logged in
    if (!API_KEY) {
        loginOverlay.classList.remove('hidden');
    } else {
        loginOverlay.classList.add('hidden');
        initDashboard();
    }

    // Login Form Submission
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        
        errorDiv.style.display = 'none'; // hide error initially

        try {
            const res = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const json = await res.json();
            
            if (json.success && json.data.apiKey) {
                API_KEY = json.data.apiKey;
                localStorage.setItem('zk_api_key', API_KEY);
                loginOverlay.classList.add('hidden');
                showToast('Login successful!');
                initDashboard();
            } else {
                errorDiv.textContent = json.message || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Error connecting to server';
            errorDiv.style.display = 'block';
        }
    });

    // Logout Button
    document.getElementById('btn-logout').addEventListener('click', () => {
        localStorage.removeItem('zk_api_key');
        window.location.reload();
    });

    // Modal logic
    const createUserModal = document.getElementById('create-user-modal');
    document.getElementById('btn-open-create-user').addEventListener('click', () => {
        createUserModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-create-user').addEventListener('click', () => {
        createUserModal.classList.add('hidden');
    });
    
    // Tab switching logic
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('page-title');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active from all tabs
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active to clicked tab
            item.classList.add('active');
            
            // Get target section id
            const targetId = item.getAttribute('href').replace('#', '');
            
            // Update page title
            pageTitle.textContent = item.textContent;

            // Hide all sections
            sections.forEach(section => section.style.display = 'none');
            
            // Show target section
            if (targetId === 'overview') {
                sections.forEach(section => section.style.display = 'block'); // Show all in overview
            } else {
                const targetSection = document.getElementById(`${targetId}-section`);
                if (targetSection) targetSection.style.display = 'block';
            }
        });
    });
});

function initDashboard() {
    fetchDevices();
    fetchAttendance();
    fetchUsers();
    fetchCommands();

    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchDevices();
        fetchAttendance();
        fetchUsers();
        fetchCommands();
        showToast('Data refreshed');
    });
}

// ─── API FETCH WRAPPER (Handles 401) ───
async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['x-api-key'] = API_KEY;

    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.removeItem('zk_api_key');
        window.location.reload();
    }
    return res;
}

async function fetchDevices() {
    try {
        const response = await fetchWithAuth('/api/v1/devices');
        const json = await response.json();
        const tbody = document.getElementById('devices-tbody');
        
        if (json.success && json.data.length > 0) {
            tbody.innerHTML = '';
            
            // Populate Device SN Dropdown in "Create User" modal
            const deviceSelect = document.getElementById('user-device-sn');
            if (deviceSelect) {
                deviceSelect.innerHTML = '';
            }

            json.data.forEach(device => {
                if (deviceSelect) {
                    const opt = document.createElement('option');
                    opt.value = device.serialNumber;
                    opt.textContent = `${device.serialNumber} ${device.isOnline ? '(Online)' : '(Offline)'}`;
                    deviceSelect.appendChild(opt);
                }

                const lastActivityDate = new Date(device.lastActivity);
                const msSinceLastActivity = Date.now() - lastActivityDate.getTime();
                const isActuallyOnline = msSinceLastActivity < 90000; // ADMS pushes ping every 10-60s
                
                const statusBadge = `<span class="badge ${isActuallyOnline ? 'badge-online' : 'badge-offline'}">${isActuallyOnline ? '🟢 Online' : '🔴 Offline'}</span>`;
                const lastActivity = new Date(device.lastActivity).toLocaleString();
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${statusBadge}</td>
                    <td><strong>${device.serialNumber}</strong></td>
                    <td>${device.ipAddress || 'Dynamic'}</td>
                    <td>${lastActivity}</td>
                    <td>
                        <div class="action-group">
                            <button class="btn btn-secondary action-cmd" data-sn="${device.serialNumber}" data-cmd="unlock">Unlock Door</button>
                            <button class="btn btn-danger action-cmd" data-sn="${device.serialNumber}" data-cmd="reboot">Reboot</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Attach event listeners to command buttons
            document.querySelectorAll('.action-cmd').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const sn = e.target.getAttribute('data-sn');
                    const cmd = e.target.getAttribute('data-cmd');
                    sendCommand(sn, cmd);
                });
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No devices found. Connect a device via ADMS.</td></tr>';
            const deviceSelect = document.getElementById('user-device-sn');
            if (deviceSelect) {
                deviceSelect.innerHTML = '<option value="">No devices found</option>';
            }
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to load devices');
    }
}

async function fetchAttendance() {
    try {
        const response = await fetchWithAuth('/api/v1/attendance?limit=5000');
        const json = await response.json();
        const tbody = document.getElementById('attendance-tbody');
        
        if (json.success && json.data.length > 0) {
            tbody.innerHTML = '';
            json.data.forEach(log => {
                const time = new Date(log.punchTime).toLocaleString();
                const verifyType = getVerifyType(log.verifyType);
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${time}</td>
                    <td><strong>UID: ${log.uid}</strong></td>
                    <td>${log.deviceSn}</td>
                    <td>${verifyType}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No recent attendance records.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to load attendance');
    }
}

async function sendCommand(sn, command) {
    if (!confirm(`Are you sure you want to ${command} device ${sn}?`)) return;
    
    try {
        const response = await fetchWithAuth(`/api/v1/commands/${command}/${sn}`, { 
            method: 'POST'
        });
        const json = await response.json();
        
        if (json.success) {
            showToast(`✅ Command sent: ${command.toUpperCase()}`);
        } else {
            showToast(`❌ Failed: ${json.message}`);
        }
    } catch (e) {
        console.error(e);
        showToast('Error sending command');
    }
}

function getVerifyType(typeCode) {
    const types = {
        1: 'Fingerprint',
        3: 'Password',
        4: 'RFID Card',
        15: 'Face'
    };
    return types[typeCode] || `Unknown (${typeCode})`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-msg');
    
    msg.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// User Management
async function fetchUsers() {
    try {
        const response = await fetchWithAuth('/api/v1/users');
        const json = await response.json();
        const tbody = document.getElementById('users-tbody');
        
        if (json.success && json.data.length > 0) {
            tbody.innerHTML = '';
            json.data.forEach(user => {
                const privilegeStr = user.privilege === 14 ? 'SuperAdmin' : 'Normal User';
                
                let statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.1)">Unknown</span>`;
                if (user.status === 'active') statusBadge = `<span class="badge badge-online">🟢 Active</span>`;
                if (user.status === 'pending_add') statusBadge = `<span class="badge" style="background: rgba(234,179,8,0.2); color: #eab308; border: 1px solid rgba(234,179,8,0.3)">🟡 Pending Add</span>`;
                if (user.status === 'pending_delete') statusBadge = `<span class="badge" style="background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid rgba(239,68,68,0.3)">🔴 Pending Delete</span>`;
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${user.uid}</strong></td>
                    <td>${user.name}</td>
                    <td>${privilegeStr}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-danger action-delete-user" data-uid="${user.uid}" ${user.status === 'pending_delete' ? 'disabled' : ''}>Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Attach event listeners to delete buttons
            document.querySelectorAll('.action-delete-user').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const uid = parseInt(e.target.getAttribute('data-uid'), 10);
                    deleteUser(uid);
                });
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No users found. Create one above!</td></tr>';
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to load users');
    }
}

document.getElementById('create-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('user-uid').value;
    const name = document.getElementById('user-name').value;
    const privilege = document.getElementById('user-priv').value;
    const deviceSn = document.getElementById('user-device-sn').value;

    try {
        const response = await fetchWithAuth('/api/v1/users', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uid, name, privilege, deviceSn })
        });
        const json = await response.json();
        
        if (json.success) {
            showToast('User created and sync queued!');
            document.getElementById('create-user-modal').classList.add('hidden');
            document.getElementById('create-user-form').reset();
            fetchUsers();
        } else {
            showToast(`Error: ${json.message}`);
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to create user');
    }
});

async function deleteUser(uid) {
    const deviceSn = prompt("Enter the Device SN to remove this user from:");
    if (!deviceSn) return;
    
    if (!confirm(`Delete user ${uid} from server and device ${deviceSn}?`)) return;

    try {
        const response = await fetchWithAuth(`/api/v1/users/${uid}?deviceSn=${deviceSn}`, { 
            method: 'DELETE'
        });
        const json = await response.json();
        
        if (json.success) {
            showToast('User deleted and sync queued!');
            fetchUsers();
        } else {
            showToast(`Error: ${json.message}`);
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to delete user');
    }
}

// Command Sync Logs
async function fetchCommands() {
    try {
        const response = await fetchWithAuth('/api/v1/commands');
        const json = await response.json();
        const tbody = document.getElementById('synclogs-tbody');
        
        if (json.success && json.data.length > 0) {
            tbody.innerHTML = '';
            json.data.forEach(cmd => {
                let badgeClass = 'badge-secondary';
                let statusIcon = '🟡';
                if (cmd.status === 'sent') { badgeClass = 'badge-primary'; statusIcon = '🔵'; }
                if (cmd.status === 'completed') { badgeClass = 'badge-online'; statusIcon = '🟢'; }
                if (cmd.status === 'failed') { badgeClass = 'badge-offline'; statusIcon = '🔴'; }

                const statusBadge = `<span class="badge ${badgeClass}">${statusIcon} ${cmd.status.toUpperCase()}</span>`;
                const createdTime = new Date(cmd.createdAt).toLocaleString();
                const completedTime = cmd.completedAt ? new Date(cmd.completedAt).toLocaleString() : '-';
                
                // Truncate long command data for cleaner display
                const cmdData = cmd.commandData.length > 60 ? cmd.commandData.substring(0, 60) + '...' : cmd.commandData;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>#${cmd.id}</strong></td>
                    <td>${cmd.deviceSn}</td>
                    <td style="font-family: monospace; font-size: 0.9em; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cmd.commandData}">${cmdData}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 0.85em; color: #666;">${createdTime}</td>
                    <td style="font-size: 0.85em; color: #666;">${completedTime}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No commands in queue.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to load sync logs');
    }
}
