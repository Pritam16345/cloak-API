// --- CONFIGURATION ---
// We now point to our own Vercel Backend (Relative Path)
// This automatically finds the /api/chat.js file you created
const API_ENDPOINT = "/api/chat"; 

// State
let auditHistory = [];
let chatHistory = []; // Stores anonymized conversation history
let activeSessionId = null; // Stores active multi-turn session ID
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

function suggestPrompt(text) {
    const inputField = document.getElementById('user-input');
    inputField.value = text;
    inputField.focus();
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
    
    // Set to connecting state first
    statusText.innerText = "Connecting...";
    statusText.className = "text-amber-500";
    statusDot.className = "status-dot-connecting";
    
    try {
        // Ping the dedicated health proxy endpoint (verifies HF Space)
        const res = await fetch("/api/health"); 
        
        if (res.ok) {
            isBackendOnline = true;
            statusText.innerText = "Online";
            statusText.className = "text-emerald-400";
            statusDot.className = "status-dot-on";
        } else {
            isBackendOnline = false;
            statusText.innerText = "Offline";
            statusText.className = "text-red-400";
            statusDot.className = "status-dot-off";
        }
    } catch (error) {
        isBackendOnline = false; 
        statusText.innerText = "Offline";
        statusText.className = "text-red-400";
        statusDot.className = "status-dot-off";
    }
}
checkBackendHealth();
setInterval(checkBackendHealth, 15000);

// --- CHAT LOGIC ---
async function handleSend() {
    const inputField = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const text = inputField.value;
    const fileToUpload = selectedFile; // Capture file locally

    if ((!text && !fileToUpload) || inputField.disabled) return; 

    // UI Message Construction
    let userMsg = text;
    if (fileToUpload && !text) {
        userMsg = `Uploaded document: **${fileToUpload.name}**`;
    } else if (fileToUpload && text) {
        userMsg = `${text}\n\n*(Attached file: ${fileToUpload.name})*`;
    }
    addChatMessage('user', userMsg);
    
    // Clear prompt input and file selection visually & natively immediately
    inputField.value = '';
    clearFileSelection();
    
    // Disable inputs to prevent spam during processing and typing
    inputField.disabled = true;
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    inputField.classList.add('opacity-50', 'cursor-not-allowed');
    
    try {
        // 1. INITIAL INTERCEPTION
        addLog('INTERCEPT_REQ', 'Routing traffic to Enterprise Middleware...', 'text-yellow-500');
        
        const formData = new FormData();
        formData.append("prompt", text);
        formData.append("history", JSON.stringify(chatHistory));
        if (activeSessionId) {
            formData.append("session_id", activeSessionId);
        }
        if (fileToUpload) {
            formData.append("file", fileToUpload);
            addLog('FILE_UPLOAD', `Attaching file: ${fileToUpload.name} (${(fileToUpload.size / 1024).toFixed(1)} KB)`, 'text-indigo-400');
        }
        
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: formData
        });

        // Check for server-side errors
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        
        // Save state updates for session and chat history
        activeSessionId = data.session_id;
        chatHistory.push({ role: "user", content: data.redacted_input });
        chatHistory.push({ role: "assistant", content: data.raw_ai_response });

        // --- STEP A: LOG THE REDACTION (OUTBOUND) ---
        const originalLogText = text || (fileToUpload ? `[Uploaded File: ${fileToUpload.name}]` : "");
        addLog('PII_REDACTED', `Server sanitization complete.\nOriginal: "${originalLogText}"\nRedacted: "${data.redacted_input}"`, 'text-emerald-400');
        
        // --- STEP B: LOG THE RAW AI RESPONSE (INBOUND) ---
        // This shows the interviewer that Groq/Llama sent back placeholders
        addLog('AI_RESPONSE', `Raw Payload received from Groq:\n"${data.raw_ai_response}"`, 'text-blue-300');

        // --- STEP C: LOG THE DE-ANONYMIZATION (FINAL) ---
        // This shows the final restoration step handled by the middleware
        addLog('DEANONYMIZE', `Entities restored via Secure Session.\nFinal Output: "${data.response}"`, 'text-purple-400');

        // --- STEP D: LOG THE LATENCY BENCHMARK ---
        if (data.latency) {
            const lat = data.latency;
            const latencyLog = `Telemetry Overview:\n• Sanitization: ${lat.sanitize_ms}ms\n• LLM Inference (Groq): ${lat.llm_ms}ms\n• Deanonymization: ${lat.deanonymize_ms}ms\n• Total Roundtrip: ${lat.total_ms}ms\n• Security Overhead: ${lat.overhead_ms}ms (${lat.overhead_percent}%)`;
            addLog('LATENCY_BENCHMARK', latencyLog, 'text-cyan-400');
        }

        // 2. DISPLAY FINAL MESSAGE TO USER (Wait for typing)
        await addChatMessage('ai', data.response);

        // 3. UPDATE AUDIT LOG (Show specific tags like [PERSON_1])
        const detectedEntities = data.redacted_input.match(/\[.*?\]/g) || [];
        // Create a unique list of detected tags
        const entityTags = detectedEntities.length > 0 ? Array.from(new Set(detectedEntities)).join(", ") : "None";
        const status = detectedEntities.length > 0 ? "PII PROTECTED" : "CLEAN TRAFFIC";
        
        const originalLenDisplay = text ? (text.length + " chars") : (fileToUpload ? `${(fileToUpload.size / 1024).toFixed(1)} KB` : "0 chars");
        
        auditHistory.unshift({
            time: new Date().toLocaleTimeString(),
            status: status,
            originalLen: originalLenDisplay,
            entities: entityTags 
        });
        
        if(document.getElementById('view-audit').classList.contains('active')) renderAuditTable();

    } catch (error) {
        console.error(error);
        addLog('CRITICAL_ERR', error.message, 'text-red-500');
        await addChatMessage('ai', `**System Error:** ${error.message}`);
    } finally {
        // Re-enable inputs and clear selection focus
        inputField.disabled = false;
        sendBtn.disabled = false;
        sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        inputField.classList.remove('opacity-50', 'cursor-not-allowed');
        inputField.focus();
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
        chatHistory = [];
        activeSessionId = null;
        renderAuditTable();
    }
}

function exportAuditCSV() {
    if (auditHistory.length === 0) {
        alert("No audit records to export.");
        return;
    }
    const headers = ["Timestamp", "Compliance Status", "Payload Size", "Detected Entities"];
    const rows = auditHistory.map(r => [
        `"${r.time}"`,
        `"${r.status}"`,
        `"${r.originalLen}"`,
        `"${(r.entities || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `cloakent_compliance_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function addChatMessage(sender, content) {
    return new Promise((resolve) => {
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
            sender === 'user' 
                ? 'bg-gradient-to-tr from-indigo-600 to-violet-500 text-white rounded-tr-none shadow-md shadow-indigo-500/10' 
                : 'bg-slate-900/60 backdrop-blur border border-slate-800/80 text-slate-300 rounded-tl-none prose-content shadow-sm'
        }`;
        
        contentDiv.appendChild(meta);
        contentDiv.appendChild(bubble);
        wrapper.appendChild(avatar);
        wrapper.appendChild(contentDiv);
        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;

        if (sender === 'ai') {
            let index = 0;
            bubble.innerHTML = "";
            
            const cursor = document.createElement('span');
            cursor.className = 'inline-block w-1.5 h-4 bg-emerald-400 ml-1 animate-pulse';
            bubble.appendChild(cursor);
            
            function next() {
                if (index < content.length) {
                    index++;
                    const partialText = content.substring(0, index);
                    try {
                        bubble.innerHTML = marked.parse(partialText);
                    } catch (e) {
                        bubble.innerHTML = partialText;
                    }
                    bubble.appendChild(cursor);
                    container.scrollTop = container.scrollHeight;
                    setTimeout(next, 10);
                } else {
                    cursor.remove();
                    try {
                        bubble.innerHTML = marked.parse(content);
                    } catch (e) {
                        bubble.innerHTML = content;
                    }
                    container.scrollTop = container.scrollHeight;
                    resolve();
                }
            }
            next();
        } else {
            bubble.innerHTML = content;
            resolve();
        }
    });
}

function highlightPlaceholders(text) {
    if (!text) return "";
    return text.replace(/(\[([A-Z_]+)(?:_\d+)?\])/g, (match) => {
        return `<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold font-mono inline-block">${match}</span>`;
    });
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
        <div class="text-slate-300 font-medium whitespace-pre-wrap break-words leading-tight">${highlightPlaceholders(msg)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}