(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  let faqData       = [];
  let activeCategory = null;
  let githubToken    = sessionStorage.getItem('gh_models_token') || '';

  // DOM refs
  const searchInput   = document.getElementById('search-input');
  const askBtn        = document.getElementById('ask-btn');
  const askText       = document.getElementById('ask-text');
  const askSpinner    = document.getElementById('ask-spinner');
  const aiResponseEl  = document.getElementById('ai-response');
  const aiAnswerEl    = document.getElementById('ai-answer');
  const faqHeading    = document.getElementById('faq-heading');
  const faqCategories = document.getElementById('faq-categories');
  const faqList       = document.getElementById('faq-list');
  const noResults     = document.getElementById('no-results');
  const modeLabel     = document.getElementById('mode-label');
  const tokenBtn      = document.getElementById('token-btn');
  const tokenModal    = document.getElementById('token-modal');
  const tokenInput    = document.getElementById('token-input');
  const tokenSave     = document.getElementById('token-save');
  const tokenClear    = document.getElementById('token-clear');
  const tokenClose    = document.getElementById('token-close');
  const tokenStatus   = document.getElementById('token-status');

  // -----------------------------------------------------------------------
  // GitHub Models API
  // -----------------------------------------------------------------------
  const MODELS_URL = 'https://models.github.ai/inference/chat/completions';
  const MODEL_NAME = 'openai/gpt-4.1';

  const SYSTEM_PROMPT = `You are LegalBot, an AI assistant for GitHub's Commercial Legal team. You help GitHub employees (account executives, sales engineers, customer success managers) get quick answers to common commercial legal questions.

RULES:
1. Answer ONLY based on the FAQ content provided in the user's message. Do not invent legal positions.
2. If the FAQ does not cover the question, say so clearly and direct them to file a CommLegal issue at https://github.com/github/commlegal/issues/new/choose
3. You are NOT a lawyer. This is NOT legal advice. You surface existing FAQ answers.
4. Be concise and practical. Use bullet points. Include relevant links from the FAQ.
5. If a question is about a specific customer deal or requires legal judgment, direct them to file a CommLegal issue.
6. When quoting ARR thresholds or policies, be precise.
7. Format responses in Markdown. Use **bold** for emphasis, bullet lists, and include hyperlinks.
8. If the message is just a greeting or clearly not a legal question, respond briefly and friendly.`;

  // -----------------------------------------------------------------------
  // Token management
  // -----------------------------------------------------------------------
  function updateTokenUI() {
    if (githubToken) {
      tokenStatus.className = 'token-dot connected';
      modeLabel.textContent = 'AI-powered answers enabled. Type a question and press "Ask LegalBot".';
    } else {
      tokenStatus.className = 'token-dot disconnected';
      modeLabel.innerHTML = 'FAQ search active. <strong>Add a GitHub token</strong> (top right) to enable AI-powered answers.';
    }
  }

  tokenBtn.addEventListener('click', () => {
    tokenInput.value = githubToken;
    tokenModal.classList.remove('hidden');
    tokenInput.focus();
  });

  tokenSave.addEventListener('click', () => {
    githubToken = tokenInput.value.trim();
    if (githubToken) {
      sessionStorage.setItem('gh_models_token', githubToken);
    }
    tokenModal.classList.add('hidden');
    updateTokenUI();
  });

  tokenClear.addEventListener('click', () => {
    githubToken = '';
    sessionStorage.removeItem('gh_models_token');
    tokenInput.value = '';
    tokenModal.classList.add('hidden');
    updateTokenUI();
  });

  tokenClose.addEventListener('click', () => tokenModal.classList.add('hidden'));

  tokenModal.addEventListener('click', (e) => {
    if (e.target === tokenModal) tokenModal.classList.add('hidden');
  });

  // -----------------------------------------------------------------------
  // FAQ loading and rendering
  // -----------------------------------------------------------------------
  async function loadFAQ() {
    const resp = await fetch('faq.json');
    faqData = await resp.json();
    renderCategories();
    renderFAQ(faqData);
  }

  function renderCategories() {
    const cats = [...new Set(faqData.map(e => e.category))];
    faqCategories.innerHTML = `
      <button class="category-chip active" data-cat="">All</button>
      ${cats.map(c => `<button class="category-chip" data-cat="${c}">${c}</button>`).join('')}
    `;
    faqCategories.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.cat || null;
        faqCategories.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterFAQ();
      });
    });
  }

  function renderFAQ(items) {
    if (items.length === 0) {
      faqList.innerHTML = '';
      noResults.classList.remove('hidden');
      return;
    }
    noResults.classList.add('hidden');
    faqList.innerHTML = items.map(item => `
      <div class="faq-item" data-id="${item.id}">
        <div class="faq-question">
          <span>${escapeHTML(item.question)}</span>
          <span class="category-tag">${escapeHTML(item.category)}</span>
          <span class="chevron">&#9656;</span>
        </div>
        <div class="faq-answer">${formatAnswer(item.answer)}</div>
      </div>
    `).join('');

    faqList.querySelectorAll('.faq-question').forEach(q => {
      q.addEventListener('click', () => {
        q.parentElement.classList.toggle('open');
      });
    });
  }

  function formatAnswer(text) {
    // Convert markdown links to HTML
    let html = escapeHTML(text);
    // Restore links: [text](url) -> <a>
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Bare URLs
    html = html.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
      if (match.includes('</a>') || match.includes('href=')) return match;
      return `<a href="${match}" target="_blank">${match}</a>`;
    });
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // -----------------------------------------------------------------------
  // Search / filter
  // -----------------------------------------------------------------------
  function filterFAQ() {
    const query = searchInput.value.toLowerCase().trim();
    let results = faqData;

    if (activeCategory) {
      results = results.filter(e => e.category === activeCategory);
    }

    if (query) {
      const terms = query.split(/\s+/);
      results = results.filter(item => {
        const haystack = (item.question + ' ' + item.answer + ' ' + item.category).toLowerCase();
        return terms.every(t => haystack.includes(t));
      });
      faqHeading.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;
    } else {
      faqHeading.textContent = 'Browse FAQs';
    }

    renderFAQ(results);
  }

  // Debounced search
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterFAQ();
      askBtn.disabled = !searchInput.value.trim();
    }, 200);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) {
      e.preventDefault();
      handleAsk();
    }
  });

  askBtn.addEventListener('click', handleAsk);

  // -----------------------------------------------------------------------
  // AI Ask
  // -----------------------------------------------------------------------
  async function handleAsk() {
    const question = searchInput.value.trim();
    if (!question) return;

    if (!githubToken) {
      // No token - just do keyword search and show a hint
      filterFAQ();
      aiResponseEl.classList.remove('hidden');
      aiAnswerEl.innerHTML = '<p>To get an AI-powered answer, click <strong>"AI Settings"</strong> in the top right and add your GitHub Personal Access Token.</p><p>In the meantime, I\'ve filtered the FAQ below to match your query.</p>';
      return;
    }

    // Show loading state
    askBtn.disabled = true;
    askText.textContent = 'Thinking...';
    askSpinner.classList.remove('hidden');
    aiResponseEl.classList.remove('hidden');
    aiAnswerEl.innerHTML = '<p style="color: var(--text-muted);">Searching CommLegal resources...</p>';

    try {
      // Build context from matching FAQ entries
      const faqContext = buildFAQContext(question);
      const userMessage = `Question: ${question}\n\nRelevant FAQ content:\n${faqContext}`;

      const response = await fetch(MODELS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${githubToken}`,
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error (${response.status}): ${err}`);
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || 'No response generated.';
      aiAnswerEl.innerHTML = renderMarkdown(answer);

    } catch (error) {
      console.error('LegalBot error:', error);
      let errorMsg = 'Sorry, something went wrong generating a response.';
      if (error.message.includes('401') || error.message.includes('403')) {
        errorMsg = 'Your GitHub token appears to be invalid or missing the <code>models:read</code> scope. Please update it in AI Settings.';
      }
      aiAnswerEl.innerHTML = `<p style="color: var(--red);">${errorMsg}</p>`;
    } finally {
      askBtn.disabled = false;
      askText.textContent = 'Ask LegalBot';
      askSpinner.classList.add('hidden');
    }
  }

  function buildFAQContext(question) {
    // Score each FAQ entry by keyword relevance
    const terms = question.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored = faqData.map(item => {
      const haystack = (item.question + ' ' + item.answer).toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score++;
      }
      return { ...item, score };
    });

    // Take top matches (at least 3, up to 8)
    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.filter(s => s.score > 0).slice(0, 8);

    // If very few matches, include all FAQ content
    if (topMatches.length < 3) {
      return faqData.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n---\n\n');
    }

    return topMatches.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n---\n\n');
  }

  // Simple markdown to HTML renderer
  function renderMarkdown(md) {
    let html = escapeHTML(md);

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* (but not inside links)
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Bare URLs
    html = html.replace(/(https?:\/\/[^\s<)]+)/g, (match) => {
      if (html.indexOf(`href="${match}"`) !== -1) return match;
      return `<a href="${match}" target="_blank">${match}</a>`;
    });

    // Bullet lists: lines starting with - or *
    html = html.replace(/^(\s*[-*])\s+/gm, '&bull; ');

    // Numbered lists: lines starting with 1. 2. etc.
    html = html.replace(/^(\d+)\.\s+/gm, '$1. ');

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';

    return html;
  }

  // -----------------------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------------------
  updateTokenUI();
  askBtn.disabled = true;
  loadFAQ();

})();
