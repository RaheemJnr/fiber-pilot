const state = {
  sessionId: null,
  isStreaming: false,
};

const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const statusDot = document.getElementById("status-dot");
const nodeInfoEl = document.getElementById("node-info");

// Initialize session on load
async function init() {
  try {
    const res = await fetch("/api/session", { method: "POST" });
    const data = await res.json();
    state.sessionId = data.sessionId;
  } catch {
    console.error("Failed to create session");
  }
  fetchNodeStatus();
  setInterval(fetchNodeStatus, 30000);
}

async function fetchNodeStatus() {
  try {
    const res = await fetch("/api/node-status");
    const data = await res.json();
    if (data.connected) {
      statusDot.className = "status-dot connected";
      const pk = data.publicKey
        ? data.publicKey.slice(0, 8) + "..." + data.publicKey.slice(-6)
        : "unknown";
      nodeInfoEl.textContent = `${pk} | ${data.channelCount} ch | ${data.peerCount} peers | v${data.version}`;
    } else {
      statusDot.className = "status-dot disconnected";
      nodeInfoEl.textContent = "Node disconnected";
    }
  } catch {
    statusDot.className = "status-dot disconnected";
    nodeInfoEl.textContent = "Node disconnected";
  }
}

function handleSubmit(e) {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || state.isStreaming) return;
  chatInput.value = "";
  sendMessage(text);
}

function sendSuggestion(btn) {
  if (state.isStreaming) return;
  sendMessage(btn.textContent);
}

async function sendMessage(text) {
  if (state.isStreaming || !state.sessionId) return;
  state.isStreaming = true;
  sendBtn.disabled = true;

  // Remove welcome message
  const welcome = chatMessages.querySelector(".welcome-message");
  if (welcome) welcome.remove();

  // Add user bubble
  appendMessage("user", text);

  // Create assistant bubble
  const bubble = appendMessage("assistant", "");
  const content = bubble.querySelector(".message-content");

  // Add thinking indicator
  const thinking = document.createElement("div");
  thinking.className = "thinking";
  thinking.innerHTML = "<span></span><span></span><span></span>";
  content.appendChild(thinking);

  let currentTextEl = null;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, message: text }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let eventType = null;
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7);
        } else if (line.startsWith("data: ") && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            // Remove thinking indicator on first content
            if (thinking.parentNode) thinking.remove();

            switch (eventType) {
              case "text_delta":
                if (!currentTextEl) {
                  currentTextEl = document.createElement("span");
                  content.appendChild(currentTextEl);
                }
                currentTextEl.textContent += data.text;
                scrollToBottom();
                break;

              case "tool_call_start": {
                // Start a new text span after tool card
                currentTextEl = null;
                const card = createToolCard(data.name, data.id);
                content.appendChild(card);
                scrollToBottom();
                break;
              }

              case "tool_call_result": {
                updateToolCard(data.id, data.name, data.result, data.duration_ms);
                currentTextEl = null;
                scrollToBottom();
                break;
              }

              case "approval_required": {
                const dialog = createApprovalDialog(data);
                content.appendChild(dialog);
                scrollToBottom();
                break;
              }

              case "error":
                if (thinking.parentNode) thinking.remove();
                const errEl = document.createElement("span");
                errEl.style.color = "var(--accent-red)";
                errEl.textContent = `Error: ${data.message}`;
                content.appendChild(errEl);
                break;

              case "done":
                break;
            }
          } catch {
            // ignore parse errors
          }
          eventType = null;
        }
      }
    }
  } catch (err) {
    if (thinking.parentNode) thinking.remove();
    const errEl = document.createElement("span");
    errEl.style.color = "var(--accent-red)";
    errEl.textContent = `Connection error: ${err.message}`;
    content.appendChild(errEl);
  }

  // Remove thinking if still there
  if (thinking.parentNode) thinking.remove();

  state.isStreaming = false;
  sendBtn.disabled = false;
  chatInput.focus();
  scrollToBottom();
}

function appendMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "fiber-pilot";

  const content = document.createElement("div");
  content.className = "message-content";
  if (text) {
    const span = document.createElement("span");
    span.textContent = text;
    content.appendChild(span);
  }

  msg.appendChild(label);
  msg.appendChild(content);
  chatMessages.appendChild(msg);
  scrollToBottom();
  return msg;
}

function createToolCard(toolName, toolId) {
  const card = document.createElement("div");
  card.className = "tool-card";
  card.id = `tool-${toolId}`;

  const displayName = toolName.replace("fp_", "").replace(/_/g, " ");

  card.innerHTML = `
    <div class="tool-header" onclick="toggleToolDetails('${toolId}')">
      <span class="tool-icon">&#x2699;</span>
      <span class="tool-name">${displayName}</span>
      <span class="tool-status running">running...</span>
      <span class="tool-chevron" id="chevron-${toolId}">&#x25BC;</span>
    </div>
    <div class="tool-details" id="details-${toolId}" style="display:none;">
      <pre class="tool-result" id="result-${toolId}">Executing...</pre>
    </div>
  `;
  return card;
}

function updateToolCard(toolId, toolName, result, durationMs) {
  const card = document.getElementById(`tool-${toolId}`);
  if (!card) return;

  const status = card.querySelector(".tool-status");
  if (result && result.error) {
    status.textContent = `error`;
    status.className = "tool-status error";
  } else {
    status.textContent = `${durationMs}ms`;
    status.className = "tool-status completed";
  }

  const resultEl = document.getElementById(`result-${toolId}`);
  if (resultEl) {
    resultEl.textContent = JSON.stringify(result, null, 2);
  }
}

function toggleToolDetails(toolId) {
  const details = document.getElementById(`details-${toolId}`);
  const chevron = document.getElementById(`chevron-${toolId}`);
  if (!details) return;

  if (details.style.display === "none") {
    details.style.display = "block";
    if (chevron) chevron.classList.add("open");
  } else {
    details.style.display = "none";
    if (chevron) chevron.classList.remove("open");
  }
}

function createApprovalDialog(data) {
  const dialog = document.createElement("div");
  dialog.className = "approval-card";
  const amount = data.amount_ckb || data.amount || "unknown";

  dialog.innerHTML = `
    <div class="approval-header">&#x26A0; Approval Required</div>
    <div class="approval-body">
      <p><strong>Action:</strong> ${data.action || data.tool}</p>
      <p><strong>Amount:</strong> ${amount} CKB</p>
      <p><strong>Reason:</strong> ${data.reason}</p>
    </div>
    <div class="approval-actions">
      <button class="btn-approve" onclick="handleApproval(this, true, '${data.action || data.tool}', '${amount}')">Approve</button>
      <button class="btn-deny" onclick="handleApproval(this, false, '${data.action || data.tool}', '${amount}')">Deny</button>
    </div>
  `;
  return dialog;
}

function handleApproval(btn, approved, action, amount) {
  // Disable buttons
  const card = btn.closest(".approval-card");
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));

  const msg = approved
    ? `I approve the action: ${action} for ${amount} CKB`
    : `I deny the action: ${action}`;

  // Send as new chat message
  sendMessage(msg);
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function toggleDocs() {
  const overlay = document.getElementById("docs-overlay");
  overlay.classList.toggle("open");
}

function closeDocs(e) {
  if (e.target === e.currentTarget) toggleDocs();
}

// Enter key to send
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit(e);
  }
});

init();
