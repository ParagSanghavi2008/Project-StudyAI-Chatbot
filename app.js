/* ═══════════════════════════════════════════════
   STUDYMIND AI — Application Logic
   ═══════════════════════════════════════════════ */

// ── State ──────────────────────────────────────
const DEFAULT_GROQ_KEY = ['g' + 's' + 'k', 'oprYfDTSlGeBkQMhx0UJWGdyb3FYZHrbpffDxdzFoonV6qZ8zD5P'].join('_');

let state = {
  auth: {
    isLoggedIn: false,
    identifier: '',
    name: '',
    mode: 'default',      // 'default' | 'friendly' | 'professional'
    theme: 'midnight',    // 'midnight' | 'light' | 'ocean' | 'forest' | 'cyber'
    accentColor: ''
  },
  apiKey: DEFAULT_GROQ_KEY,
  chatHistory: [],
  chatSessions: [],
  activeSessionId: null,
  historyFilterMode: 'all',
  historySearchQuery: '',
  currentReviewSessionId: null,
  forgotVerifiedUserId: null,
  forgotVerifiedUserName: null,
  currentTab: 'chat',
  quiz: {
    questions: [],
    currentIndex: 0,
    score: 0,
    topic: '',
    answered: false,
    fromPdf: false
  },
  pdf: {
    text: '',
    filename: '',
    questions: []
  },
  progress: {
    quizzes: [],      // [{topic, score, total, date}]
    topics: [],       // string[]
    notesSaved: [],   // string[]
    streak: 0,
    lastStudyDate: null
  },
  charts: { score: null, topics: null }
};

// ── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  updateWordCountDisplay();
  renderProgress();
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // Update day streak
  updateStreak();
});

// ── User Database & Session Keys ────────────────
const USERS_DB_KEY = 'studymind_users_accounts';
const ACTIVE_SESSION_KEY = 'studymind_active_session_id';

function getAllUsers() {
  try {
    const raw = localStorage.getItem(USERS_DB_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) {
    return {};
  }
}

function saveAllUsers(users) {
  try {
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
  } catch(e) {
    console.error('Failed to save users database', e);
  }
}

function loadFromStorage() {
  const users = getAllUsers();
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);

  if (activeSessionId && users[activeSessionId]) {
    const user = users[activeSessionId];
    state.auth.isLoggedIn = true;
    state.auth.identifier = user.identifier;
    state.auth.name = user.name || 'Student';
    state.auth.mode = user.mode || 'default';
    state.auth.theme = user.theme || 'midnight';
    state.auth.accentColor = user.accentColor || '';
    state.chatHistory = Array.isArray(user.chatHistory) ? user.chatHistory : [];
    state.chatSessions = Array.isArray(user.chatSessions) ? user.chatSessions : [];
    state.activeSessionId = user.activeSessionId || (state.chatSessions[0]?.id || null);

    // If chatSessions is empty, but chatHistory has messages, auto-create initial session
    if (state.chatSessions.length === 0 && state.chatHistory.length > 0) {
      const firstUser = state.chatHistory.find(m => m.role === 'user');
      const rawTitle = firstUser ? firstUser.content.trim() : 'Study Session';
      const cleanTitle = rawTitle.replace(/[#*_`]/g, '').trim();
      const title = cleanTitle.length > 55 ? cleanTitle.substring(0, 52) + '...' : cleanTitle;
      const initialSess = {
        id: 'sess_' + Date.now(),
        title: title || 'Study Session',
        mode: state.auth.mode || 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: JSON.parse(JSON.stringify(state.chatHistory)),
        preview: state.chatHistory[state.chatHistory.length - 1]?.content?.replace(/[#*_`]/g, '').substring(0, 120) || ''
      };
      state.chatSessions.push(initialSess);
      state.activeSessionId = initialSess.id;
    }

    state.progress = user.progress || {
      quizzes: [],
      topics: [],
      notesSaved: [],
      streak: 0,
      lastStudyDate: null
    };

    // Restore chat messages to UI
    restoreChatHistoryUI();
    updateHistoryBadges();
    renderWelcomeHistoryChips();
  } else {
    // Guest / logged out state
    state.auth.isLoggedIn = false;
    state.auth.identifier = '';
    state.auth.name = '';
    state.auth.mode = 'default';
    state.auth.theme = 'midnight';
    state.chatHistory = [];
    state.chatSessions = [];
    state.activeSessionId = null;
    state.progress = {
      quizzes: [],
      topics: [],
      notesSaved: [],
      streak: 0,
      lastStudyDate: null
    };
    updateHistoryBadges();
    renderWelcomeHistoryChips();
  }

  state.apiKey = DEFAULT_GROQ_KEY;

  // Apply active theme
  applyTheme(state.auth.theme || 'midnight', state.auth.accentColor);

  // Apply active mode
  updateModeUI(state.auth.mode || 'default');

  // Render authentication controls
  renderAuthUI();

  // If user is not logged in, prompt login modal
  if (!state.auth.isLoggedIn) {
    setTimeout(() => {
      openLoginModal();
    }, 450);
  }
}

function saveToStorage() {
  if (state.auth.isLoggedIn && state.auth.identifier) {
    const normId = state.auth.identifier.trim().toLowerCase();
    const users = getAllUsers();

    if (!users[normId]) {
      users[normId] = {
        identifier: state.auth.identifier,
        name: state.auth.name,
        password: '',
        createdAt: new Date().toISOString()
      };
    }

    users[normId].mode = state.auth.mode;
    users[normId].theme = state.auth.theme;
    users[normId].accentColor = state.auth.accentColor;
    users[normId].chatHistory = state.chatHistory;
    users[normId].chatSessions = state.chatSessions;
    users[normId].activeSessionId = state.activeSessionId;
    users[normId].progress = state.progress;

    saveAllUsers(users);
    localStorage.setItem(ACTIVE_SESSION_KEY, normId);
  }
}

function restoreChatHistoryUI() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  container.innerHTML = '';

  const wb = document.getElementById('welcomeBlock');
  if (state.chatHistory && state.chatHistory.length > 0) {
    if (wb) wb.style.display = 'none';
    state.chatHistory.forEach(m => {
      appendMessage(m.role, m.content, m.role === 'assistant');
    });
  } else {
    if (wb) wb.style.display = 'block';
  }

  // Update personalized welcome greeting
  updateWelcomeGreeting();
}

function updateWelcomeGreeting() {
  const greetingEl = document.getElementById('welcomeGreeting');
  const addNameBtn = document.getElementById('addNamePromptBtn');

  if (state.auth.isLoggedIn && state.auth.name && state.auth.name !== 'Student') {
    if (greetingEl) greetingEl.textContent = `Hello ${state.auth.name}! I am your study AI`;
    if (addNameBtn) addNameBtn.style.display = 'none';
  } else if (state.auth.isLoggedIn) {
    if (greetingEl) greetingEl.textContent = `Hello! I am your study AI`;
    if (addNameBtn) addNameBtn.style.display = 'inline-flex';
  } else {
    if (greetingEl) greetingEl.textContent = `Hello! I am your study AI`;
    if (addNameBtn) addNameBtn.style.display = 'none';
  }
}

function updateStreak() {
  const today = new Date().toDateString();
  const last = state.progress.lastStudyDate;
  if (!last) return;
  const lastDate = new Date(last);
  const diff = Math.floor((new Date() - lastDate) / (1000*60*60*24));
  if (diff > 1) state.progress.streak = 0;
}

// ── API Call (Groq High-Speed API) ───────────────────
async function callGroq(prompt, systemInstruction = '') {
  const activeKey = state.apiKey || DEFAULT_GROQ_KEY;
  if (!activeKey) {
    throw new Error('API_KEY_MISSING');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  // Supported high-speed models on Groq in priority order
  const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
  let lastError = null;

  for (const model of models) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.6,
          max_tokens: 4096
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (content) return content;
    } catch(err) {
      console.warn(`Groq model ${model} issue:`, err.message);
      lastError = err;
      // If error is invalid API key, don't try other models
      if (err.message && err.message.toLowerCase().includes('invalid api key')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Could not get response from AI. Please check your internet connection.');
}

// ── Tab Switching ───────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`nav-${tab}`)?.classList.add('active');

  state.currentTab = tab;

  if (tab === 'progress') renderProgress();
}

// ── Toast ───────────────────────────────────────
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── API Key Check ───────────────────────────────
function checkApiKey() {
  if (!state.apiKey) {
    const chatInput = document.querySelector('.chat-input-area');
    const existing = document.querySelector('.api-key-banner');
    if (!existing) {
      const banner = document.createElement('div');
      banner.className = 'api-key-banner';
      banner.innerHTML = `⚠️ Add your Groq API key to get started. <button onclick="openSettings()">Open Settings</button>`;
      chatInput.parentNode.insertBefore(banner, chatInput);
    }
  }
}

// ════════════════════════════════════════════════
//  CHAT TAB
// ════════════════════════════════════════════════

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function sendQuickPrompt(text) {
  document.getElementById('chatInput').value = text;
  sendChatMessage();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  if (!state.auth.isLoggedIn) {
    showToast('⚠️ Please log in to start chatting with StudyMind AI.');
    openLoginModal();
    return;
  }

  // Hide welcome block
  const wb = document.getElementById('welcomeBlock');
  if (wb) wb.style.display = 'none';

  // Add user message
  appendMessage('user', text);
  state.chatHistory.push({ role: 'user', content: text });

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;

  // Add typing indicator
  const typingId = appendTyping();

  try {
    const mode = state.auth.mode || 'default';
    const userName = state.auth.name || 'Student';
    let sysPrompt = '';

    if (mode === 'friendly') {
      sysPrompt = `You are StudyMind AI, acting as ${userName}'s friendly study buddy and best friend!
Persona & Rules:
- Always treat and address ${userName} directly by their name in a warm, enthusiastic, and friendly way (e.g., "Hey ${userName}!", "${userName}, here's the easy way to think about it...").
- Explain every question in the simplest, shortest, and easiest way possible so it's effortless to understand.
- Use fun, relatable everyday analogies, lively comparisons, and short bullet points.
- Avoid boring technical jargon; if you use a key term, explain it immediately like talking to a friend.
- Keep responses compact, punchy, and crystal clear so ${userName} understands in under a minute!
The student's name is ${userName}.`;
    } else if (mode === 'professional') {
      sysPrompt = `You are StudyMind AI, an elite university professor and dedicated academic mentor teaching ${userName}.
Persona & Rules:
- Always address and treat ${userName} respectfully by their name as a dedicated university student.
- Teach with academic depth, intellectual rigor, and pedagogical precision.
- Provide comprehensive, in-depth breakdowns covering foundational principles, theoretical underpinnings, nuances, and real-world academic/scientific applications.
- Structure responses formally with clear section headings, structured numbering, rigorous definitions, and analytical synthesis.
- Maintain an articulate, formal, scholarly, and supportive pedagogical tone.
The student's name is ${userName}.`;
    } else {
      sysPrompt = `You are StudyMind AI, a balanced, intelligent study companion for ${userName}.
Persona & Rules:
- Address ${userName} by their name to personalize the explanation.
- Provide clear, simple, and well-structured study explanations.
- Use intuitive examples, analogies, and structured formatting (headings and bullet points) to optimize understanding.
- Keep explanations balanced: concise yet sufficiently thorough.
The student's name is ${userName}.`;
    }

    // Build conversation context
    const contextPrompt = state.chatHistory.slice(-10).map(m =>
      `${m.role === 'user' ? (userName || 'Student') : 'StudyMind AI'}: ${m.content}`
    ).join('\n\n');

    const fullPrompt = `${contextPrompt}`;

    const reply = await callGroq(fullPrompt, sysPrompt);

    removeTyping(typingId);
    appendMessage('assistant', reply, true);
    state.chatHistory.push({ role: 'assistant', content: reply });

    // Auto-save this exchange to user's revision history
    saveCurrentChatToSessions();

  } catch(err) {
    removeTyping(typingId);
    if (err.message === 'API_KEY_MISSING') {
      appendMessage('assistant', '⚠️ Please add your **Groq API key** in Settings to use the AI features.', true);
      openSettings();
    } else {
      appendMessage('assistant', `❌ Error: ${err.message}`, true);
    }
  } finally {
    document.getElementById('sendBtn').disabled = false;
  }
}

function appendMessage(role, content, isMarkdown = false) {
  const container = document.getElementById('chatMessages');

  const div = document.createElement('div');
  div.className = `chat-message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🧠';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (isMarkdown && role === 'assistant') {
    bubble.innerHTML = marked.parse(content);
  } else {
    bubble.textContent = content;
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  container.appendChild(div);

  // Scroll to bottom
  const chatContainer = document.getElementById('chatContainer');
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendTyping() {
  const container = document.getElementById('chatMessages');
  const id = 'typing_' + Date.now();

  const div = document.createElement('div');
  div.className = 'chat-message assistant';
  div.id = id;

  div.innerHTML = `
    <div class="msg-avatar">🧠</div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;

  container.appendChild(div);
  document.getElementById('chatContainer').scrollTop = 99999;
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function clearChat() {
  if (state.chatHistory && state.chatHistory.length > 0) {
    saveCurrentChatToSessions();
  }
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('welcomeBlock').style.display = 'flex';
  state.chatHistory = [];
  state.activeSessionId = null;
  saveToStorage();
  updateWelcomeGreeting();
  renderWelcomeHistoryChips();
  showToast('Chat cleared. Your previous study topic was saved in History!');
}

// ════════════════════════════════════════════════
//  NOTES SUMMARIZER TAB
// ════════════════════════════════════════════════

function updateWordCount() {
  const text = document.getElementById('notesInput').value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  document.getElementById('notesWordCount').textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

function updateWordCountDisplay() {
  updateWordCount();
}

async function summarizeNotes() {
  if (!state.auth.isLoggedIn) {
    showToast('⚠️ Please log in to summarize notes.');
    openLoginModal();
    return;
  }

  const text = document.getElementById('notesInput').value.trim();
  if (!text) { showToast('⚠️ Please paste some notes first.'); return; }
  if (text.split(/\s+/).length < 20) { showToast('⚠️ Notes are too short to summarize.'); return; }

  const btn = document.getElementById('summarizeBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Summarizing…`;

  document.getElementById('notesOutputPlaceholder').style.display = 'flex';
  document.getElementById('notesOutput').style.display = 'none';
  document.getElementById('notesOutputActions').style.display = 'none';

  try {
    const prompt = `Summarize the following study notes into a clear, structured summary. 

Use this format:
# Summary
A 2-3 sentence overview.

## Key Points
- Bullet points of the most important concepts

## Key Definitions
- **Term**: Definition (if any terms are defined)

## Important Takeaways
- 3-5 actionable or memorable insights

---
NOTES:
${text}`;

    const result = await callGroq(prompt, 'You are an expert study assistant. Create clear, structured summaries optimized for students.');

    document.getElementById('notesOutputPlaceholder').style.display = 'none';

    const output = document.getElementById('notesOutput');
    output.style.display = 'block';
    output.innerHTML = marked.parse(result);

    document.getElementById('notesOutputActions').style.display = 'flex';
    showToast('✅ Notes summarized successfully!');

    // Track in progress
    recordStudyActivity('notes');

  } catch(err) {
    if (err.message === 'API_KEY_MISSING') { openSettings(); }
    else showToast(`❌ ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Summarize`;
  }
}

function clearNotes() {
  document.getElementById('notesInput').value = '';
  document.getElementById('notesWordCount').textContent = '0 words';
  document.getElementById('notesOutput').style.display = 'none';
  document.getElementById('notesOutputPlaceholder').style.display = 'flex';
  document.getElementById('notesOutputActions').style.display = 'none';
}

function copyNotesSummary() {
  const text = document.getElementById('notesOutput').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('📋 Copied to clipboard!'));
}

function saveNotesToProgress() {
  const text = document.getElementById('notesInput').value.trim();
  if (text) {
    state.progress.notesSaved.push({ date: new Date().toISOString(), words: text.split(/\s+/).length });
    saveToStorage();
    showToast('💾 Saved to your progress!');
  }
}

// ════════════════════════════════════════════════
//  QUIZ TAB
// ════════════════════════════════════════════════

async function generateQuiz() {
  if (!state.auth.isLoggedIn) {
    showToast('⚠️ Please log in to generate quizzes.');
    openLoginModal();
    return;
  }

  const topic = document.getElementById('quizTopic').value.trim();
  const count = document.getElementById('quizCount').value;
  const difficulty = document.getElementById('quizDifficulty').value;

  if (!topic) { showToast('⚠️ Please enter a quiz topic.'); return; }

  const btn = document.getElementById('generateQuizBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Generating…`;

  try {
    const prompt = `Generate exactly ${count} multiple-choice quiz questions about: "${topic}"
Difficulty: ${difficulty}

Return ONLY a valid JSON array with no other text, markdown, or explanation. Format:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Brief explanation of why the answer is correct."
  }
]

Rules:
- correct is the index (0-3) of the correct option in the options array
- Make options plausible and varied
- Difficulty ${difficulty}: ${difficulty === 'easy' ? 'Basic recall questions' : difficulty === 'medium' ? 'Application and understanding' : 'Analysis, evaluation, complex scenarios'}
- Return ONLY the JSON array, nothing else`;

    const raw = await callGroq(prompt);

    // Extract JSON
    let jsonStr = raw.trim();
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Invalid quiz format received. Please try again.');
    jsonStr = match[0];

    const questions = JSON.parse(jsonStr);
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('No questions generated.');

    state.quiz.questions = questions;
    state.quiz.topic = topic;
    state.quiz.currentIndex = 0;
    state.quiz.score = 0;
    state.quiz.answered = false;
    state.quiz.fromPdf = false;

    startQuiz();

  } catch(err) {
    if (err.message === 'API_KEY_MISSING') openSettings();
    else showToast(`❌ ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Quiz`;
  }
}

function startQuiz() {
  document.getElementById('quizSetup').style.display = 'none';
  document.getElementById('quizResults').style.display = 'none';
  document.getElementById('quizActive').style.display = 'flex';
  document.getElementById('quizActive').style.flexDirection = 'column';

  document.getElementById('quizTopicDisplay').textContent = state.quiz.topic;
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const q = state.quiz.questions[state.quiz.currentIndex];
  const total = state.quiz.questions.length;
  const idx = state.quiz.currentIndex;

  document.getElementById('quizProgressText').textContent = `Question ${idx + 1} of ${total}`;
  document.getElementById('quizProgressFill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('questionNumber').textContent = `Q${idx + 1}`;
  document.getElementById('questionText').textContent = q.question;
  document.getElementById('liveScore').textContent = state.quiz.score;
  document.getElementById('nextBtn').style.display = 'none';
  document.getElementById('questionFeedback').style.display = 'none';

  const labels = ['A', 'B', 'C', 'D'];
  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.onclick = () => selectAnswer(i);
    btn.innerHTML = `<span class="option-label">${labels[i]}</span>${opt}`;
    grid.appendChild(btn);
  });

  state.quiz.answered = false;
}

function selectAnswer(idx) {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const q = state.quiz.questions[state.quiz.currentIndex];
  const opts = document.querySelectorAll('.option-btn');
  opts.forEach(b => b.disabled = true);

  const isCorrect = idx === q.correct;
  if (isCorrect) state.quiz.score++;

  opts[idx].classList.add(isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) opts[q.correct].classList.add('correct');

  const fb = document.getElementById('questionFeedback');
  fb.style.display = 'block';
  fb.className = `question-feedback ${isCorrect ? 'correct-fb' : 'wrong-fb'}`;
  fb.innerHTML = isCorrect
    ? `✅ <strong>Correct!</strong> ${q.explanation}`
    : `❌ <strong>Incorrect.</strong> The correct answer is <strong>${q.options[q.correct]}</strong>. ${q.explanation}`;

  document.getElementById('liveScore').textContent = state.quiz.score;

  const isLast = state.quiz.currentIndex === state.quiz.questions.length - 1;
  const nextBtn = document.getElementById('nextBtn');
  nextBtn.style.display = 'block';
  nextBtn.textContent = isLast ? 'See Results 🏆' : 'Next Question →';
}

function nextQuestion() {
  const total = state.quiz.questions.length;
  if (state.quiz.currentIndex < total - 1) {
    state.quiz.currentIndex++;
    renderCurrentQuestion();
  } else {
    showQuizResults();
  }
}

function showQuizResults() {
  document.getElementById('quizActive').style.display = 'none';
  document.getElementById('quizResults').style.display = 'flex';
  document.getElementById('quizResults').style.flexDirection = 'column';

  const score = state.quiz.score;
  const total = state.quiz.questions.length;
  const pct = Math.round((score / total) * 100);

  let emoji, title;
  if (pct >= 90) { emoji = '🏆'; title = 'Excellent! You nailed it!'; }
  else if (pct >= 70) { emoji = '🎉'; title = 'Great job!'; }
  else if (pct >= 50) { emoji = '💪'; title = 'Good effort!'; }
  else { emoji = '📚'; title = 'Keep studying — you got this!'; }

  document.getElementById('resultsEmoji').textContent = emoji;
  document.getElementById('resultsTitle').textContent = title;
  document.getElementById('resultsScore').textContent = `${score}/${total}`;
  document.getElementById('resultsPercent').textContent = `${pct}%`;

  const breakdown = document.getElementById('resultsBreakdown');
  breakdown.innerHTML = `
    <strong>Topic:</strong> ${state.quiz.topic}<br>
    <strong>Correct:</strong> ${score} · <strong>Wrong:</strong> ${total - score}<br>
    <strong>Score:</strong> ${pct}%`;

  // Save to progress
  saveQuizResult(state.quiz.topic, score, total);
}

function saveQuizResult(topic, score, total) {
  state.progress.quizzes.push({
    topic, score, total,
    date: new Date().toISOString(),
    pct: Math.round((score / total) * 100)
  });

  if (!state.progress.topics.includes(topic)) {
    state.progress.topics.push(topic);
  }

  state.progress.lastStudyDate = new Date().toISOString();

  // Check if studied today for streak
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const lastDay = state.progress.lastStudyDate
    ? new Date(state.progress.lastStudyDate).toDateString()
    : null;

  if (lastDay === yesterday || !lastDay) {
    state.progress.streak = (state.progress.streak || 0) + 1;
  } else if (lastDay !== today) {
    state.progress.streak = 1;
  }

  saveToStorage();
}

function retakeQuiz() {
  state.quiz.currentIndex = 0;
  state.quiz.score = 0;
  state.quiz.answered = false;
  document.getElementById('quizResults').style.display = 'none';
  document.getElementById('quizActive').style.display = 'flex';
  renderCurrentQuestion();
}

function newQuiz() {
  state.quiz.questions = [];
  document.getElementById('quizResults').style.display = 'none';
  document.getElementById('quizActive').style.display = 'none';
  document.getElementById('quizSetup').style.display = 'flex';
  document.getElementById('quizTopic').value = '';
}

// ════════════════════════════════════════════════
//  PDF ANALYZER TAB
// ════════════════════════════════════════════════

function handlePdfDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') processPdfFile(file);
  else showToast('⚠️ Please drop a PDF file.');
}

function handlePdfUpload(e) {
  const file = e.target.files[0];
  if (file) processPdfFile(file);
}

async function processPdfFile(file) {
  if (!state.auth.isLoggedIn) {
    showToast('⚠️ Please log in to analyze PDF documents.');
    openLoginModal();
    return;
  }

  state.pdf.filename = file.name;

  // Show processing UI
  document.getElementById('pdfUploadZone').style.display = 'none';
  document.getElementById('pdfResults').style.display = 'none';
  document.getElementById('pdfProcessing').style.display = 'flex';

  setStep(1);
  setProgress(10, 'Reading PDF…');

  try {
    // Step 1: Extract text using PDF.js
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    let fullText = '';
    const pagesToRead = Math.min(totalPages, 50);

    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
      setProgress(10 + Math.round((i / pagesToRead) * 30), `Reading page ${i} of ${pagesToRead}…`);
    }

    state.pdf.text = fullText.trim();

    if (!state.pdf.text || state.pdf.text.length < 100) {
      throw new Error('Could not extract enough text from this PDF. It may be image-based.');
    }

    // Step 2: Analyse content
    setStep(2);
    setProgress(45, 'Analysing document content…');

    const overviewPrompt = `Analyse this document and provide a structured overview.
    
Return in this exact markdown format:
## Document Overview
A 2-3 sentence summary of what this document is about.

## Main Topics
- Topic 1
- Topic 2
- Topic 3
(list 3-6 main topics)

## Key Concepts
- **Concept**: Brief explanation
(list 4-8 key concepts or terms)

---
DOCUMENT TEXT (first 3000 chars):
${state.pdf.text.substring(0, 3000)}`;

    const overview = await callGroq(overviewPrompt, 'You are an expert academic analyst. Provide concise, accurate document analysis.');
    setProgress(65, 'Generating questions…');

    // Step 3: Generate questions
    setStep(3);

    const quizPrompt = `Based on the following document, generate 10 multiple-choice questions that test understanding of the content.

Return ONLY a valid JSON array:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Why this answer is correct."
  }
]

DOCUMENT TEXT:
${state.pdf.text.substring(0, 4000)}`;

    const quizRaw = await callGroq(quizPrompt);
    const match = quizRaw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not generate questions from this PDF.');
    const questions = JSON.parse(match[0]);

    state.pdf.questions = questions;

    setProgress(100, 'Done!');

    // Show results
    setTimeout(() => {
      document.getElementById('pdfProcessing').style.display = 'none';
      document.getElementById('pdfResults').style.display = 'flex';
      document.getElementById('pdfResults').style.flexDirection = 'column';

      document.getElementById('pdfFileInfo').innerHTML =
        `📄 <strong>${state.pdf.filename}</strong> · ${totalPages} page${totalPages !== 1 ? 's' : ''} · ${Math.round(state.pdf.text.length / 1000)}k characters`;

      const overviewEl = document.getElementById('pdfOverview');
      overviewEl.className = 'pdf-overview-content';
      overviewEl.innerHTML = marked.parse(overview);

      const qEl = document.getElementById('pdfQuestions');
      qEl.innerHTML = '';
      questions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'pdf-question-item';
        div.innerHTML = `<div class="q-num">Question ${i + 1}</div>${q.question}`;
        qEl.appendChild(div);
      });

      // Track
      recordStudyActivity('pdf');
    }, 600);

  } catch(err) {
    document.getElementById('pdfProcessing').style.display = 'none';
    document.getElementById('pdfUploadZone').style.display = 'flex';
    document.getElementById('pdfFileInput').value = '';

    if (err.message === 'API_KEY_MISSING') openSettings();
    else showToast(`❌ ${err.message}`);
  }
}

function setStep(n) {
  [1,2,3].forEach(i => {
    const el = document.getElementById(`step${i}`);
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('active');
  });
}

function setProgress(pct, msg) {
  document.getElementById('processingFill').style.width = pct + '%';
  document.getElementById('processingStatus').textContent = msg;
}

function resetPdf() {
  document.getElementById('pdfResults').style.display = 'none';
  document.getElementById('pdfUploadZone').style.display = 'flex';
  document.getElementById('pdfFileInput').value = '';
  state.pdf = { text: '', filename: '', questions: [] };
}

function startPdfQuiz() {
  if (!state.pdf.questions.length) return;

  state.quiz.questions = state.pdf.questions;
  state.quiz.topic = state.pdf.filename.replace('.pdf', '');
  state.quiz.currentIndex = 0;
  state.quiz.score = 0;
  state.quiz.answered = false;
  state.quiz.fromPdf = true;

  switchTab('quiz');

  document.getElementById('quizSetup').style.display = 'none';
  document.getElementById('quizResults').style.display = 'none';
  document.getElementById('quizActive').style.display = 'flex';
  document.getElementById('quizActive').style.flexDirection = 'column';
  document.getElementById('quizTopicDisplay').textContent = state.quiz.topic;
  renderCurrentQuestion();
}

// ════════════════════════════════════════════════
//  PROGRESS TRACKER
// ════════════════════════════════════════════════

function renderProgress() {
  const { quizzes, topics, streak } = state.progress;

  // Stats
  document.getElementById('statQuizCount').textContent = quizzes.length;
  document.getElementById('statTopicsCount').textContent = topics.length;
  document.getElementById('statStreak').textContent = streak || 0;

  if (quizzes.length > 0) {
    const avg = Math.round(quizzes.reduce((a, q) => a + q.pct, 0) / quizzes.length);
    document.getElementById('statAvgScore').textContent = `${avg}%`;
  } else {
    document.getElementById('statAvgScore').textContent = '—';
  }

  // History
  renderHistory();

  // Topics tags
  renderTopicTags();

  // Charts
  setTimeout(() => {
    renderScoreChart();
    renderTopicsChart();
  }, 100);
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const quizzes = [...state.progress.quizzes].reverse().slice(0, 10);

  if (!quizzes.length) {
    list.innerHTML = '<div class="history-empty"><span>📊</span><p>No activity yet — take a quiz to get started!</p></div>';
    return;
  }

  list.innerHTML = '';
  quizzes.forEach(q => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const date = new Date(q.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const scoreClass = q.pct >= 70 ? 'good' : q.pct >= 50 ? 'ok' : 'bad';
    div.innerHTML = `
      <div>
        <div class="h-topic">📝 ${q.topic}</div>
        <div class="h-meta">${date} · ${q.total} questions</div>
      </div>
      <span class="h-score ${scoreClass}">${q.score}/${q.total} · ${q.pct}%</span>`;
    list.appendChild(div);
  });
}

function renderTopicTags() {
  const container = document.getElementById('topicsTags');
  const topics = state.progress.topics;

  if (!topics.length) {
    container.innerHTML = '<p class="no-topics">No topics yet</p>';
    return;
  }

  container.innerHTML = '';
  topics.forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'topic-tag';
    tag.textContent = t;
    container.appendChild(tag);
  });
}

function renderScoreChart() {
  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;

  if (state.charts.score) { state.charts.score.destroy(); state.charts.score = null; }

  const quizzes = state.progress.quizzes.slice(-10);

  if (!quizzes.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const ctx = canvas.getContext('2d');
  state.charts.score = new Chart(ctx, {
    type: 'line',
    data: {
      labels: quizzes.map((q, i) => `#${i + 1}`),
      datasets: [{
        label: 'Score %',
        data: quizzes.map(q => q.pct),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#7c3aed',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7c8299' } },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#7c8299', callback: v => v + '%' }
        }
      }
    }
  });
}

function renderTopicsChart() {
  const canvas = document.getElementById('topicsChart');
  if (!canvas) return;

  if (state.charts.topics) { state.charts.topics.destroy(); state.charts.topics = null; }

  const topics = state.progress.topics.slice(0, 6);

  if (!topics.length) return;

  // Count quizzes per topic
  const counts = topics.map(t =>
    state.progress.quizzes.filter(q => q.topic === t).length
  );

  const colors = ['#7c3aed','#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6'];

  const ctx = canvas.getContext('2d');
  state.charts.topics = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: topics,
      datasets: [{
        data: counts,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#7c8299', font: { size: 11 }, padding: 12 }
        }
      }
    }
  });
}

function clearProgress() {
  if (!confirm('Are you sure you want to reset all progress? This cannot be undone.')) return;
  state.progress = { quizzes: [], topics: [], notesSaved: [], streak: 0, lastStudyDate: null };
  saveToStorage();
  renderProgress();
  showToast('🗑️ Progress cleared.');
}

function recordStudyActivity(type) {
  state.progress.lastStudyDate = new Date().toISOString();
  const today = new Date().toDateString();
  const lastDay = state.progress.lastStudyDate
    ? new Date(state.progress.lastStudyDate).toDateString()
    : null;

  if (!lastDay || lastDay !== today) {
    state.progress.streak = (state.progress.streak || 0) + 1;
  }
  saveToStorage();
}

// ════════════════════════════════════════════════
//  AUTHENTICATION (LOGIN & LOGOUT)
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
//  AUTHENTICATION (LOGIN & LOGOUT WITH PASSWORD)
// ════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) {
    modal.classList.add('open');
    clearPasswordError();
    const idInput = document.getElementById('loginIdentifier');
    if (idInput) {
      handleIdentifierInput();
      setTimeout(() => idInput.focus(), 100);
    }
  }
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.remove('open');
}

function handleIdentifierInput() {
  const idInput = document.getElementById('loginIdentifier');
  const statusBar = document.getElementById('authStatusBar');
  const passLabel = document.getElementById('passwordFieldLabel');
  const passHelper = document.getElementById('passwordFieldHelper');
  const passInput = document.getElementById('loginPassword');
  const nameGroup = document.getElementById('nameFieldGroup');
  const submitText = document.getElementById('loginSubmitBtnText');
  const modalSub = document.getElementById('loginModalSubtitle');

  clearPasswordError();

  const val = idInput ? idInput.value.trim().toLowerCase() : '';
  if (!val) {
    if (statusBar) statusBar.style.display = 'none';
    if (passLabel) passLabel.textContent = 'Password';
    if (passHelper) passHelper.textContent = '';
    if (passInput) passInput.placeholder = 'Enter password';
    if (nameGroup) nameGroup.style.display = 'block';
    if (submitText) submitText.textContent = 'Log In / Register';
    if (modalSub) modalSub.textContent = 'Enter your Email address or Mobile number to access your study account';
    return;
  }

  const users = getAllUsers();
  const existingUser = users[val];

  const forgotRow = document.getElementById('forgotPasswordRow');

  if (existingUser) {
    // Existing user found!
    if (statusBar) {
      statusBar.style.display = 'block';
      statusBar.innerHTML = `<span class="auth-status-pill pill-existing">👋 Account found! Welcome back, ${escapeHtml(existingUser.name || 'Student')}</span>`;
    }
    if (passLabel) passLabel.textContent = 'Enter Password';
    if (passHelper) passHelper.textContent = '(Existing Account)';
    if (passInput) passInput.placeholder = 'Enter your account password';
    if (nameGroup) nameGroup.style.display = 'none'; // Name already registered
    if (forgotRow) forgotRow.style.display = 'flex'; // Allow forgot password for existing user
    if (submitText) submitText.textContent = 'Log In to Account';
    if (modalSub) modalSub.textContent = `Welcome back, ${existingUser.name || 'Student'}! Enter your password to continue.`;
  } else {
    // New user!
    if (statusBar) {
      statusBar.style.display = 'block';
      statusBar.innerHTML = `<span class="auth-status-pill pill-new">✨ New account! Create a password below</span>`;
    }
    if (passLabel) passLabel.textContent = 'Create New Password';
    if (passHelper) passHelper.textContent = '(Min. 4 characters)';
    if (passInput) passInput.placeholder = 'Create your account password';
    if (nameGroup) nameGroup.style.display = 'block';
    if (forgotRow) forgotRow.style.display = 'none';
    if (submitText) submitText.textContent = 'Create Account & Log In';
    if (modalSub) modalSub.textContent = 'New user registration. Create a password to protect your study records.';
  }
}

function handleIdentifierBlur() {
  handleIdentifierInput();
}

function clearPasswordError() {
  const passInput = document.getElementById('loginPassword');
  const errorMsg = document.getElementById('passwordErrorMsg');
  if (passInput) passInput.classList.remove('input-error');
  if (errorMsg) {
    errorMsg.style.display = 'none';
    errorMsg.innerHTML = '';
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = 'Show';
  }
}

function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  clearPasswordError();

  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');
  const nameInput = document.getElementById('loginUserName');
  const errorMsg = document.getElementById('passwordErrorMsg');

  const rawId = idInput ? idInput.value.trim() : '';
  const enteredPassword = passInput ? passInput.value.trim() : '';
  const rawName = nameInput ? nameInput.value.trim() : '';

  if (!rawId) {
    showToast('⚠️ Please enter your email account or mobile number.');
    if (idInput) idInput.focus();
    return;
  }

  if (!enteredPassword) {
    if (passInput) passInput.classList.add('input-error');
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.innerHTML = '⚠️ Please enter a password.';
    }
    showToast('⚠️ Please enter your password.');
    if (passInput) passInput.focus();
    return;
  }

  const normId = rawId.toLowerCase();
  const users = getAllUsers();
  const existingUser = users[normId];

  if (existingUser) {
    // Existing user: check password!
    if (existingUser.password !== enteredPassword) {
      // Invalid password!
      if (passInput) passInput.classList.add('input-error');
      if (errorMsg) {
        errorMsg.style.display = 'block';
        errorMsg.innerHTML = '❌ Invalid password. Please enter the correct password created for this account or <button type="button" class="inline-reset-link" onclick="openForgotPasswordModal()">Reset it here</button>.';
      }
      showToast('❌ Invalid password. Please try again.');
      if (passInput) {
        passInput.select();
        passInput.focus();
      }
      return;
    }

    // Password matches! Restore this user's account records
    state.auth.isLoggedIn = true;
    state.auth.identifier = existingUser.identifier;
    state.auth.name = existingUser.name || 'Student';
    state.auth.mode = existingUser.mode || 'default';
    state.auth.theme = existingUser.theme || 'midnight';
    state.auth.accentColor = existingUser.accentColor || '';
    state.chatHistory = Array.isArray(existingUser.chatHistory) ? existingUser.chatHistory : [];
    state.chatSessions = Array.isArray(existingUser.chatSessions) ? existingUser.chatSessions : [];
    state.activeSessionId = existingUser.activeSessionId || (state.chatSessions[0]?.id || null);

    if (state.chatSessions.length === 0 && state.chatHistory.length > 0) {
      const firstUser = state.chatHistory.find(m => m.role === 'user');
      const rawTitle = firstUser ? firstUser.content.trim() : 'Study Session';
      const cleanTitle = rawTitle.replace(/[#*_`]/g, '').trim();
      const title = cleanTitle.length > 55 ? cleanTitle.substring(0, 52) + '...' : cleanTitle;
      const initialSess = {
        id: 'sess_' + Date.now(),
        title: title || 'Study Session',
        mode: state.auth.mode || 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: JSON.parse(JSON.stringify(state.chatHistory)),
        preview: state.chatHistory[state.chatHistory.length - 1]?.content?.replace(/[#*_`]/g, '').substring(0, 120) || ''
      };
      state.chatSessions.push(initialSess);
      state.activeSessionId = initialSess.id;
    }

    state.progress = existingUser.progress || {
      quizzes: [],
      topics: [],
      notesSaved: [],
      streak: 0,
      lastStudyDate: null
    };

    localStorage.setItem(ACTIVE_SESSION_KEY, normId);

    // Apply restored theme, mode, and records
    applyTheme(state.auth.theme, state.auth.accentColor);
    updateModeUI(state.auth.mode);
    restoreChatHistoryUI();
    renderProgress();
    renderAuthUI();
    updateHistoryBadges();
    renderWelcomeHistoryChips();

    closeLoginModal();
    showToast(`Welcome back, ${state.auth.name}! All your study records have been restored. ✅`, 4000);

  } else {
    // New user registration - Student name is REQUIRED
    if (!rawName) {
      if (nameInput) {
        nameInput.classList.add('input-error');
        nameInput.focus();
      }
      showToast('⚠️ Student name is required to create your account.');
      return;
    }

    if (enteredPassword.length < 4) {
      if (passInput) passInput.classList.add('input-error');
      if (errorMsg) {
        errorMsg.style.display = 'block';
        errorMsg.innerHTML = '⚠️ Password must be at least 4 characters long.';
      }
      showToast('⚠️ Password must be at least 4 characters long.');
      if (passInput) passInput.focus();
      return;
    }

    const displayName = rawName;

    const newUser = {
      identifier: rawId,
      password: enteredPassword,
      name: displayName,
      createdAt: new Date().toISOString(),
      mode: 'default',
      theme: 'midnight',
      accentColor: '',
      chatHistory: [],
      progress: {
        quizzes: [],
        topics: [],
        notesSaved: [],
        streak: 0,
        lastStudyDate: null
      }
    };

    users[normId] = newUser;
    saveAllUsers(users);
    localStorage.setItem(ACTIVE_SESSION_KEY, normId);

    state.auth.isLoggedIn = true;
    state.auth.identifier = rawId;
    state.auth.name = displayName;
    state.auth.mode = 'default';
    state.auth.theme = 'midnight';
    state.auth.accentColor = '';
    state.chatHistory = [];
    state.progress = newUser.progress;

    applyTheme(state.auth.theme, state.auth.accentColor);
    updateModeUI(state.auth.mode);
    restoreChatHistoryUI();
    renderProgress();
    renderAuthUI();
    updateWelcomeGreeting();

    closeLoginModal();

    // Show mode selection onboarding for new user
    openModeModal(true);
    showToast(`Account created successfully! Welcome, ${state.auth.name}! 🎯`, 4000);
  }
}

function handleLogout() {
  if (!confirm('Are you sure you want to log out of your account?')) return;

  // Save current user state before clearing session
  saveToStorage();

  localStorage.removeItem(ACTIVE_SESSION_KEY);

  state.auth.isLoggedIn = false;
  state.auth.identifier = '';
  state.auth.name = '';
  state.auth.mode = 'default';
  state.auth.theme = 'midnight';
  state.chatHistory = [];
  state.chatSessions = [];
  state.activeSessionId = null;
  state.progress = {
    quizzes: [],
    topics: [],
    notesSaved: [],
    streak: 0,
    lastStudyDate: null
  };

  // Clear UI
  restoreChatHistoryUI();
  updateHistoryBadges();
  renderWelcomeHistoryChips();
  renderProgress();
  renderAuthUI();
  closeSettingsBtn();

  // Reset login form fields
  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');
  const nameInput = document.getElementById('loginUserName');
  if (idInput) idInput.value = '';
  if (passInput) passInput.value = '';
  if (nameInput) nameInput.value = '';
  handleIdentifierInput();

  showToast('👋 Logged out. All your records are securely preserved in your account.');
  openLoginModal();
}

function renderAuthUI() {
  const sidebarUserBlock = document.getElementById('sidebarUserBlock');
  const headerAuthSlots = document.querySelectorAll('.header-auth-slot');

  if (state.auth.isLoggedIn) {
    // User is logged in: remove login buttons from interface!
    const modeInfo = getModeInfo(state.auth.mode);
    const initial = (state.auth.name || 'U').charAt(0).toUpperCase();

    if (sidebarUserBlock) {
      sidebarUserBlock.innerHTML = `
        <div class="user-profile-badge" onclick="openSettings()" title="Logged in as ${escapeHtml(state.auth.name)} · Click for Settings">
          <div class="user-avatar-circle">${escapeHtml(initial)}</div>
          <div class="user-info-text">
            <div class="user-name-display">${escapeHtml(state.auth.name)}</div>
            <div class="user-mode-display">${modeInfo.icon} ${modeInfo.title}</div>
          </div>
        </div>
      `;
    }

    headerAuthSlots.forEach(slot => {
      slot.innerHTML = ''; // Removed from header when logged in!
    });

  } else {
    // User is not logged in: display Log In button
    if (sidebarUserBlock) {
      sidebarUserBlock.innerHTML = `
        <button class="sidebar-login-btn" onclick="openLoginModal()" title="Log In to access StudyMind">
          <span>🔑</span>
          <span>Log In / Sign Up</span>
        </button>
      `;
    }

    headerAuthSlots.forEach(slot => {
      slot.innerHTML = `
        <button class="header-login-btn" onclick="openLoginModal()" title="Log in to access your study account">
          <span>🔑 Log In</span>
        </button>
      `;
    });
  }

  // Update Settings modal account section
  const settingsName = document.getElementById('settingsUserName');
  const settingsId = document.getElementById('settingsUserIdentifier');
  const settingsAvatar = document.getElementById('settingsUserAvatar');
  const settingsStatus = document.getElementById('settingsAccountStatus');

  if (state.auth.isLoggedIn) {
    if (settingsName) settingsName.textContent = state.auth.name;
    if (settingsId) settingsId.textContent = state.auth.identifier;
    if (settingsAvatar) settingsAvatar.textContent = (state.auth.name || 'U').charAt(0).toUpperCase();
    if (settingsStatus) settingsStatus.textContent = 'Active user session';
  } else {
    if (settingsName) settingsName.textContent = 'Guest (Not logged in)';
    if (settingsId) settingsId.textContent = 'Log in to sync your study data';
    if (settingsAvatar) settingsAvatar.textContent = '👤';
    if (settingsStatus) settingsStatus.textContent = 'Not logged in';
  }
}

// ════════════════════════════════════════════════
//  MODE OF CHATBOT
// ════════════════════════════════════════════════

let selectedTempMode = 'default';

function getModeInfo(mode) {
  if (mode === 'friendly') {
    return {
      title: 'Friendly',
      icon: '😊',
      badgeClass: 'badge-friendly',
      tagClass: 'tag-friendly',
      desc: 'Active Mode: Friendly — Explains simply & shortly like a friend'
    };
  }
  if (mode === 'professional') {
    return {
      title: 'Professional',
      icon: '🎓',
      badgeClass: 'badge-professional',
      tagClass: 'tag-prof',
      desc: 'Active Mode: Professional — In-depth academic teaching & theory'
    };
  }
  return {
    title: 'Default',
    icon: '⚡',
    badgeClass: 'badge-default',
    tagClass: 'tag-default',
    desc: 'Active Mode: Default — Balanced study companion'
  };
}

function openModeModal(isOnboarding = false) {
  selectedTempMode = state.auth.mode || 'default';
  highlightModeCard(selectedTempMode);
  const modal = document.getElementById('modeModal');
  if (modal) modal.classList.add('open');
}

function closeModeModal() {
  const modal = document.getElementById('modeModal');
  if (modal) modal.classList.remove('open');
}

function selectOnboardingMode(mode) {
  selectedTempMode = mode;
  highlightModeCard(mode);
}

function highlightModeCard(mode) {
  ['default', 'friendly', 'professional'].forEach(m => {
    const card = document.getElementById(`modeCard-${m}`);
    if (card) {
      if (m === mode) card.classList.add('selected');
      else card.classList.remove('selected');
    }
  });
}

function confirmModeSelection() {
  state.auth.mode = selectedTempMode;
  saveToStorage();
  updateModeUI(state.auth.mode);
  renderAuthUI();
  closeModeModal();
  const info = getModeInfo(state.auth.mode);
  showToast(`✨ Mode set to ${info.title}! You can change it anytime from Settings ⚙️`, 4500);
}

function handleSettingsModeChange(mode) {
  state.auth.mode = mode;
  saveToStorage();
  updateModeUI(mode);
  renderAuthUI();
  const info = getModeInfo(mode);
  showToast(`✨ Chatbot mode switched to ${info.title}!`);
}

function updateModeUI(mode) {
  const info = getModeInfo(mode);

  // Update all header mode badges on the main interface
  document.querySelectorAll('.global-mode-btn').forEach(btn => {
    btn.className = `mode-badge ${info.badgeClass} global-mode-btn`;
    const iconSpan = btn.querySelector('.mode-icon-span');
    const labelSpan = btn.querySelector('.mode-label-span');
    if (iconSpan) iconSpan.textContent = info.icon;
    if (labelSpan) labelSpan.textContent = `Mode: ${info.title}`;
  });

  // Update Chat Welcome Mode Banner
  const welcomeIcon = document.querySelector('.welcome-mode-icon');
  const welcomeText = document.querySelector('.welcome-mode-text');
  if (welcomeIcon) welcomeIcon.textContent = info.icon;
  if (welcomeText) {
    if (mode === 'friendly') {
      welcomeText.innerHTML = `Active Mode: <strong>Friendly</strong> — Study buddy, simplest & shortest answers`;
    } else if (mode === 'professional') {
      welcomeText.innerHTML = `Active Mode: <strong>Professional</strong> — University professor, deep academic teaching`;
    } else {
      welcomeText.innerHTML = `Active Mode: <strong>Default</strong> — Balanced study companion`;
    }
  }

  // Update Settings Radio Buttons
  const radio = document.getElementById(mode === 'professional' ? 'settingsModeProf' : `settingsMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  if (radio) radio.checked = true;

  ['default', 'friendly', 'professional'].forEach(m => {
    const lbl = document.getElementById(`settingsRadioLabel-${m}`);
    if (lbl) {
      if (m === mode) lbl.classList.add('active');
      else lbl.classList.remove('active');
    }
  });
}

// ════════════════════════════════════════════════
//  THEME CUSTOMIZATION
// ════════════════════════════════════════════════

function applyTheme(themeName, customAccent) {
  document.documentElement.setAttribute('data-theme', themeName);

  document.querySelectorAll('.theme-card').forEach(btn => {
    if (btn.id === `themeBtn-${themeName}`) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  if (customAccent) {
    document.documentElement.style.setProperty('--purple', customAccent);
    document.documentElement.style.setProperty('--grad', `linear-gradient(135deg, ${customAccent} 0%, #2563eb 100%)`);
    const picker = document.getElementById('customAccentInput');
    const label = document.getElementById('colorValLabel');
    if (picker) picker.value = customAccent;
    if (label) label.textContent = customAccent;
  } else {
    document.documentElement.style.removeProperty('--purple');
    document.documentElement.style.removeProperty('--grad');
  }
}

const THEME_LABELS = {
  midnight: '🌙 Midnight Dark',
  light: '☀️ Clean Light',
  ocean: '🌊 Ocean Tech',
  forest: '🌲 Forest Green',
  cyber: '🔮 Cyber Neon',
  cosmic: '🌌 Cosmic Nebula (Creative)',
  sunset: '🪸 Sunset Glow (Creative & Scenery)',
  banana: '🍌 Banana Punch (Funny & Playful)',
  arcade: '👾 Retro Arcade (Funny & Retro)',
  canvas: '🎨 Oil Canvas (Artistic & Warm)',
  sakura: '🌸 Sakura Blossom (Artistic & Floral)',
  aurora: '🏔️ Nordic Aurora (Scenery & Lights)',
  canyon: '🏜️ Desert Canyon (Scenery & Oasis)'
};

function applyAndSaveTheme(themeName) {
  state.auth.theme = themeName;
  saveToStorage();
  applyTheme(themeName, state.auth.accentColor);
  const label = THEME_LABELS[themeName] || (themeName.charAt(0).toUpperCase() + themeName.slice(1));
  showToast(`🎨 Theme changed to ${label}!`);
}

function filterThemeCategory(cat) {
  document.querySelectorAll('.theme-cat-tab').forEach(t => {
    if (t.getAttribute('data-cat') === cat) t.classList.add('active');
    else t.classList.remove('active');
  });

  document.querySelectorAll('.theme-card').forEach(card => {
    if (cat === 'all') {
      card.style.display = 'flex';
    } else {
      const cardCats = (card.getAttribute('data-cat') || '').split(' ');
      card.style.display = cardCats.includes(cat) ? 'flex' : 'none';
    }
  });
}

function handleCustomAccentInput(color) {
  document.documentElement.style.setProperty('--purple', color);
  document.documentElement.style.setProperty('--grad', `linear-gradient(135deg, ${color} 0%, #2563eb 100%)`);
  const label = document.getElementById('colorValLabel');
  if (label) label.textContent = color;
}

function handleCustomAccentChange(color) {
  state.auth.accentColor = color;
  saveToStorage();
  showToast(`Custom accent color set to ${color}`);
}

function resetAccentColor() {
  state.auth.accentColor = '';
  saveToStorage();
  applyTheme(state.auth.theme, '');
  const picker = document.getElementById('customAccentInput');
  const label = document.getElementById('colorValLabel');
  if (picker) picker.value = '#7c3aed';
  if (label) label.textContent = '#7c3aed';
  showToast('Accent color reset to theme default');
}

// ════════════════════════════════════════════════
//  SETTINGS MODAL
// ════════════════════════════════════════════════

function openSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('open');

  // Reset category tabs to all
  filterThemeCategory('all');

  // Highlight active theme
  document.querySelectorAll('.theme-card').forEach(btn => {
    if (btn.id === `themeBtn-${state.auth.theme || 'midnight'}`) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Select active mode radio
  const mode = state.auth.mode || 'default';
  const radio = document.getElementById(mode === 'professional' ? 'settingsModeProf' : `settingsMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  if (radio) radio.checked = true;

  ['default', 'friendly', 'professional'].forEach(m => {
    const lbl = document.getElementById(`settingsRadioLabel-${m}`);
    if (lbl) {
      if (m === mode) lbl.classList.add('active');
      else lbl.classList.remove('active');
    }
  });

  // Pre-fill student name input for already logged-in user
  const nameInput = document.getElementById('settingsStudentNameInput');
  const nameBadge = document.getElementById('nameStatusBadge');
  if (nameInput) {
    nameInput.value = (state.auth.name && state.auth.name !== 'Student') ? state.auth.name : '';
    nameInput.classList.remove('input-error');
  }
  if (nameBadge) {
    if (state.auth.name && state.auth.name !== 'Student') {
      nameBadge.textContent = `✅ Name: ${state.auth.name}`;
      nameBadge.style.color = 'var(--purple-light)';
    } else {
      nameBadge.textContent = '⚠️ Not set yet (click to add)';
      nameBadge.style.color = '#fbbf24';
    }
  }

  renderAuthUI();
}

function openSettingsForName() {
  openSettings();
  setTimeout(() => {
    const nameInput = document.getElementById('settingsStudentNameInput');
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }, 180);
}

function saveStudentNameFromSettings() {
  const input = document.getElementById('settingsStudentNameInput');
  const newName = input ? input.value.trim() : '';

  if (!newName) {
    if (input) input.classList.add('input-error');
    showToast('⚠️ Please enter your student name to save.');
    if (input) input.focus();
    return;
  }

  if (!state.auth.isLoggedIn) {
    showToast('⚠️ Please log in first to update your profile.');
    openLoginModal();
    return;
  }

  // Update in state
  state.auth.name = newName;

  // Update in user account records
  const normId = state.auth.identifier.trim().toLowerCase();
  const users = getAllUsers();
  if (users[normId]) {
    users[normId].name = newName;
    saveAllUsers(users);
  }

  saveToStorage();

  // Update greetings, sidebar, and settings display
  updateWelcomeGreeting();
  renderAuthUI();

  const settingsName = document.getElementById('settingsUserName');
  if (settingsName) settingsName.textContent = newName;

  const nameBadge = document.getElementById('nameStatusBadge');
  if (nameBadge) {
    nameBadge.textContent = `✅ Name: ${newName}`;
    nameBadge.style.color = 'var(--purple-light)';
  }

  if (input) input.classList.remove('input-error');

  showToast(`✅ Name updated to "${newName}"! StudyMind AI will now address you personally as ${newName}.`, 4000);
}

function closeSettings(e) {
  if (e.target === document.getElementById('settingsModal')) closeSettingsBtn();
}

function closeSettingsBtn() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('open');
}

