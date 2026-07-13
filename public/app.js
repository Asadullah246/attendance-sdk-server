document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
    fetchAttendance();
    fetchUsers();

    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchDevices();
        fetchAttendance();
        fetchUsers();
        showToast('Data refreshed');
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

async function fetchDevices() {
    try {
        const response = await fetch('/api/v1/devices');
        const json = await response.json();
        const tbody = document.getElementById('devices-tbody');
        
        if (json.success && json.data.length > 0) {
            tbody.innerHTML = '';
            json.data.forEach(device => {
                const isOnline = device.isOnline;
                const statusBadge = `<span class="badge ${isOnline ? 'badge-online' : 'badge-offline'}">${isOnline ? 'Online' : 'Offline'}</span>`;
                const lastActivity = new Date(device.lastActivity).toLocaleString();
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${statusBadge}</td>
                    <td><strong>${device.serialNumber}</strong></td>
                    <td>${device.ipAddress || 'Dynamic'}</td>
                    <td>${lastActivity}</td>
                    <td>
                        <div class="action-group">
                            <button class="btn btn-secondary" onclick="sendCommand('${device.serialNumber}', 'unlock')">Unlock Door</button>
                            <button class="btn btn-danger" onclick="sendCommand('${device.serialNumber}', 'reboot')">Reboot</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No devices found. Connect a device via ADMS.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to load devices');
    }
}

async function fetchAttendance() {
    try {
        const response = await fetch('/api/v1/attendance?limit=10');
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
        const response = await fetch(`/api/v1/commands/${command}/${sn}`, { method: 'POST' });
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
        const response = await fetch('/api/v1/users');
        const json = await response.json();
        const tbody = document.getElementById('users-tbody');
        
        if (json.success && json.data.length > 0) {
            tbody.innerHTML = '';
            json.data.forEach(user => {
                const privilegeStr = user.privilege === 14 ? 'SuperAdmin' : 'Normal User';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${user.uid}</strong></td>
                    <td>${user.name}</td>
                    <td>${privilegeStr}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteUser(${user.uid})">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
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
        const response = await fetch('/api/v1/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const response = await fetch(`/api/v1/users/${uid}?deviceSn=${deviceSn}`, { method: 'DELETE' });
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
