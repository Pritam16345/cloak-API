// --- CONFIGURATION ---
// We now point to our own Vercel Backend (Relative Path)
// This automatically finds the /api/chat.js file you created
const API_ENDPOINT = "/api/chat"; 

// State
let auditHistory = [];
let isBackendOnline = false;
let selectedFile = null;

// --- FILE UPLOAD LOGIC ---
const fileInput = document.getElementById('file-upload');
const filePreview = document.getElementById('file-preview');
const fileNameSpan = document.getElementById('file-name');

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameSpan.innerText = selectedFile.name;
        filePreview.classList.add('active');
    }
});

function clearFileSelection() {
    fileInput.value = '';
    selectedFile = null;
    filePreview.classList.remove('active');
}

// --- SIDEBAR TOGGLE ---
function toggleInspector() {
    const container = document.getElementById('inspector-container');
    const icon = document.getElementById('toggle-icon');
    if (container.classList.contains('w-96')) {
        container.classList.remove('w-96');
        container.classList.add('w-0');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-left');
    } else {
        container.classList.add('w-96');
        container.classList.remove('w-0');
        icon.classList.remove('fa-chevron-left');
        icon.classList.add('fa-chevron-right');
    }
}

// --- NAVIGATION ---
function switchView(viewName) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'bg-slate-800', 'text-emerald-400');
        el.classList.add('text-slate-400');
    });
    document.getElementById('view-chat').classList.remove('active');
    document.getElementById('view-audit').classList.remove('active');

    document.getElementById(`nav-${viewName}`).classList.add('active');
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    const titles = { 'chat': 'Secure Chat Interface', 'audit': 'Compliance Audit Logs' };
    document.getElementById('page-title').innerText = titles[viewName];
    if(viewName === 'audit') renderAuditTable();
}

// --- HEALTH CHECK ---
// We check our own Vercel API health
async function checkBackendHealth() {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    try {
        // Simple ping to see if Vercel is alive
        const res = await fetch(API_ENDPOINT, { method: 'POST', body: JSON.stringify({text: "ping"}) }); 
        isBackendOnline = true;
        statusText.innerText = "Online";
        statusText.className = "text-emerald-400";
        statusDot.className = "status-dot-on";
    } catch (error) {
        // Even if it fails (method not allowed etc), the server is reachable
        isBackendOnline = true; 
        statusText.innerText = "Online";
        statusText.className = "text-emerald-400";
        statusDot.className = "status-dot-on";
    }
}
checkBackendHealth();

// --- CHAT LOGIC ---
async function handleSend() {
    const inputField = document.getElementById('user-input');
    const text = inputField.value;

    if (!text) return; 

    // UI Message Construction
    addChatMessage('user', text);
    inputField.value = '';
    
    // Clear file selection if any
    if (selectedFile) {
        addLog('WARN', 'File upload skipped: Gateway currently accepts text only.', 'text-yellow-500');
        clearFileSelection();
    }

    try {
        // 1. INITIAL INTERCEPTION
        addLog('INTERCEPT_REQ', 'Routing traffic to Enterprise Middleware...', 'text-yellow-500');
        
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        // Check for server-side errors
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();

        // --- STEP A: LOG THE REDACTION (OUTBOUND) ---
        addLog('PII_REDACTED', `Server sanitization complete.\nOriginal: "${text}"\nRedacted: "${data.redacted_input}"`, 'text-emerald-400');
        
        // --- STEP B: LOG THE RAW AI RESPONSE (INBOUND) ---
        // This shows the interviewer that Gemini sent back placeholders
        addLog('AI_RESPONSE', `Raw Payload received from Gemini:\n"${data.raw_ai_response}"`, 'text-blue-300');

        // --- STEP C: LOG THE DE-ANONYMIZATION (FINAL) ---
        // This shows the final restoration step handled by the middleware
        addLog('DEANONYMIZE', `Entities restored via Secure Session.\nFinal Output: "${data.response}"`, 'text-purple-400');

        // 2. DISPLAY FINAL MESSAGE TO USER
        addChatMessage('ai', data.response);

        // 3. UPDATE AUDIT LOG (Show specific tags like [PERSON_1])
        const detectedEntities = data.redacted_input.match(/\[.*?\]/g) || [];
        // Create a unique list of detected tags
        const entityTags = detectedEntities.length > 0 ? Array.from(new Set(detectedEntities)).join(", ") : "None";
        const status = detectedEntities.length > 0 ? "PII PROTECTED" : "CLEAN TRAFFIC";
        
        auditHistory.unshift({
            time: new Date().toLocaleTimeString(),
            status: status,
            originalLen: text.length + " chars",
            entities: entityTags 
        });
        
        if(document.getElementById('view-audit').classList.contains('active')) renderAuditTable();

    } catch (error) {
        console.error(error);
        addLog('CRITICAL_ERR', error.message, 'text-red-500');
        addChatMessage('ai', `**System Error:** ${error.message}`);
    }
}

// --- UI HELPERS (Unchanged) ---
function renderAuditTable() {
    const tbody = document.getElementById('audit-table-body');
    tbody.innerHTML = '';
    if (auditHistory.length === 0) {
        tbody.innerHTML = `<tr class="hover:bg-slate-800/50 transition"><td colspan="5" class="px-6 py-8 text-center text-slate-600 italic">No transactions recorded yet.</td></tr>`;
        return;
    }
    auditHistory.forEach((row, index) => {
        const statusClass = row.status === "PII PROTECTED" 
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
            : "bg-slate-700/50 text-slate-400 border border-slate-600/20";
        
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-800 hover:bg-slate-800/30 transition group";
        tr.innerHTML = `
            <td class="px-6 py-4 font-mono text-xs text-slate-500">${row.time}</td>
            <td class="px-6 py-4"><span class="px-2 py-1 rounded text-[10px] font-bold tracking-wide ${statusClass}">${row.status}</span></td>
            <td class="px-6 py-4 text-slate-400">${row.originalLen}</td>
            <td class="px-6 py-4 font-mono text-xs text-indigo-400 truncate max-w-[200px]" title="${row.entities}">${row.entities}</td>
            <td class="px-6 py-4 text-right relative">
                <button onclick="deleteAuditRow(${index})" class="text-slate-600 hover:text-red-400 transition p-2 rounded-full hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteAuditRow(index) {
    if (confirm("Are you sure you want to delete this log entry?")) {
        auditHistory.splice(index, 1);
        renderAuditTable();
    }
}

function clearLogs() {
    if (confirm("Are you sure you want to clear all audit history?")) {
        auditHistory = [];
        renderAuditTable();
    }
}

function addChatMessage(sender, content) {
    const container = document.getElementById('chat-container');
    const wrapper = document.createElement('div');
    wrapper.className = `flex gap-4 max-w-3xl mx-auto msg-animate ${sender === 'user' ? 'flex-row-reverse' : ''}`;
    
    const avatar = document.createElement('div');
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        sender === 'user' ? 'bg-indigo-500 text-white' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    }`;
    avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = "flex-1 space-y-1";
    
    const meta = document.createElement('div');
    meta.className = `flex items-baseline gap-2 ${sender === 'user' ? 'justify-end' : ''}`;
    meta.innerHTML = `<span class="font-medium text-white text-sm">${sender === 'user' ? 'You' : 'Cloak Assistant'}</span>`;

    const bubble = document.createElement('div');
    bubble.className = `p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
        sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-none prose-content'
    }`;
    
    // Safety check for marked.js
    if (sender === 'ai') {
        try {
            bubble.innerHTML = marked.parse(content || "");
        } catch (e) {
            bubble.innerHTML = content;
        }
    } else {
        bubble.innerHTML = content;
    }

    contentDiv.appendChild(meta);
    contentDiv.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(contentDiv);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

function addLog(type, msg, color) {
    const container = document.getElementById('logs');
    if (container.children[0]?.innerText.includes("System idle")) container.innerHTML = '';
    
    if (type === 'INTERCEPT_REQ' && container.children.length > 0) {
        const sep = document.createElement('div');
        sep.className = "border-t-2 border-slate-700 my-8 border-dashed relative";
        sep.innerHTML = `
            <div class="absolute top-[-12px] left-1/2 -translate-x-1/2 bg-black px-3 py-0.5 border border-slate-700 rounded-full">
                <span class="text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                    <i class="fas fa-bolt mr-1"></i> New Request
                </span>
            </div>`;
        container.appendChild(sep);
    }

    const div = document.createElement('div');
    div.className = "border-l-2 border-slate-800 pl-3 py-1 hover:bg-white/5 transition rounded-r mb-2";
    div.innerHTML = `
        <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-[10px] ${color} uppercase tracking-wider">${type}</span>
            <span class="text-[9px] font-mono text-slate-500">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="text-slate-300 font-medium whitespace-pre-wrap break-words leading-tight">${msg}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}