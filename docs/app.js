(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  let faqData = [];
  let activeCategory = null;

  // DOM refs
  const searchInput     = document.getElementById('search-input');
  const searchResults   = document.getElementById('search-input-results');
  const clearBtn        = document.getElementById('clear-btn');
  const hero            = document.getElementById('hero');
  const resultsSection  = document.getElementById('results-section');
  const aiResponseEl    = document.getElementById('ai-response');
  const aiAnswerEl      = document.getElementById('ai-answer');
  const relatedLinks    = document.getElementById('related-links');
  const confidenceBadge = document.getElementById('confidence-badge');
  const faqHeading      = document.getElementById('faq-heading');
  const faqCategories   = document.getElementById('faq-categories');
  const faqList         = document.getElementById('faq-list');
  const noResults       = document.getElementById('no-results');

  // -----------------------------------------------------------------------
  // Synonym expansion dictionary
  // -----------------------------------------------------------------------
  const SYNONYMS = {
    nda:           ['nda', 'non-disclosure', 'non disclosure', 'confidentiality', 'confidential'],
    dpa:           ['dpa', 'data protection', 'data processing', 'gdpr', 'privacy', 'personal data'],
    contract:      ['contract', 'agreement', 'terms', 'gca', 'customer agreement', 'legal terms'],
    negotiate:     ['negotiate', 'redline', 'redlines', 'amend', 'change', 'modify', 'amendment'],
    copilot:       ['copilot', 'co-pilot', 'ai', 'code completion', 'genai', 'generative'],
    indemnity:     ['indemnity', 'indemnification', 'indemnify', 'liability', 'ip protection'],
    sign:          ['sign', 'execute', 'signature', 'countersign', 'wet signature'],
    customer:      ['customer', 'client', 'buyer', 'enterprise', 'prospect', 'account'],
    microsoft:     ['microsoft', 'msft', 'ms', 'co-sell', 'cosell'],
    threshold:     ['threshold', 'minimum', 'arr', 'revenue', 'deal size', '$100k', '$500k'],
    preview:       ['preview', 'beta', 'pre-release', 'prerelease', 'experimental'],
    questionnaire: ['questionnaire', 'security questionnaire', 'vendor questionnaire', 'assessment'],
    insurance:     ['insurance', 'coverage', 'policy', 'certificate'],
    governing:     ['governing law', 'jurisdiction', 'venue', 'applicable law'],
    supplier:      ['supplier', 'vendor', 'code of conduct', 'coc', 'supplier code'],
    dora:          ['dora', 'digital operational resilience', 'eu regulation'],
    training:      ['training', 'model training', 'data usage', 'third party model', '3p model'],
    azure:         ['azure', 'metered', 'billing', 'consumption'],
  };

  // Build reverse lookup: word -> [expanded terms]
  const EXPANSION_MAP = {};
  for (const terms of Object.values(SYNONYMS)) {
    for (const term of terms) {
      if (!EXPANSION_MAP[term]) EXPANSION_MAP[term] = [];
      for (const other of terms) {
        if (other !== term && !EXPANSION_MAP[term].includes(other)) {
          EXPANSION_MAP[term].push(other);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // TF-IDF search engine
  // -----------------------------------------------------------------------
  let docFreq = {};
  let faqTokens = [];

  function tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9$\-/]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  function buildIndex() {
    docFreq = {};
    faqTokens = [];

    for (const item of faqData) {
      const text = item.question + ' ' + item.answer + ' ' + item.category;
      const tokens = tokenize(text);
      const uniqueTokens = [...new Set(tokens)];
      faqTokens.push({ tokens, uniqueTokens });

      for (const t of uniqueTokens) {
        docFreq[t] = (docFreq[t] || 0) + 1;
      }
    }
  }

  function expandQuery(queryTerms) {
    const expanded = new Set(queryTerms);
    for (const term of queryTerms) {
      if (EXPANSION_MAP[term]) {
        for (const syn of EXPANSION_MAP[term]) expanded.add(syn);
      }
      for (const terms of Object.values(SYNONYMS)) {
        for (const synTerm of terms) {
          if (synTerm.includes(term) && synTerm !== term) {
            for (const other of terms) expanded.add(other);
          }
        }
      }
    }
    // Check bigrams
    for (let i = 0; i < queryTerms.length - 1; i++) {
      const bigram = queryTerms[i] + ' ' + queryTerms[i + 1];
      if (EXPANSION_MAP[bigram]) {
        for (const syn of EXPANSION_MAP[bigram]) expanded.add(syn);
      }
    }
    return [...expanded];
  }

  function scoreEntry(entryIndex, queryTerms) {
    const { tokens, uniqueTokens } = faqTokens[entryIndex];
    const item = faqData[entryIndex];
    const N = faqData.length;
    const fullText = (item.question + ' ' + item.answer).toLowerCase();

    let score = 0;
    let matchedTerms = 0;

    for (const qt of queryTerms) {
      if (item.question.toLowerCase().includes(qt)) {
        score += 10;
        matchedTerms++;
      } else if (fullText.includes(qt)) {
        score += 3;
        matchedTerms++;
      }

      if (uniqueTokens.includes(qt)) {
        const tf = tokens.filter(t => t === qt).length / tokens.length;
        const idf = Math.log(N / (1 + (docFreq[qt] || 0)));
        score += tf * idf * 5;
      }
    }

    // Reward covering more of the query
    const coverage = queryTerms.length > 0 ? matchedTerms / queryTerms.length : 0;
    score *= (0.5 + coverage);

    return score;
  }

  function search(query) {
    const rawTerms = tokenize(query);
    if (rawTerms.length === 0) return [];

    const queryLower = query.toLowerCase().trim();
    const expandedTerms = expandQuery(rawTerms);

    const scored = faqData.map((item, i) => {
      let score = scoreEntry(i, expandedTerms);
      // Big bonus for near-exact question match
      if (item.question.toLowerCase().includes(queryLower)) score += 50;
      return { ...item, score, index: i };
    });

    return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  }

  // -----------------------------------------------------------------------
  // Answer generation
  // -----------------------------------------------------------------------
  function generateAnswer(query, results) {
    if (results.length === 0) {
      return {
        answer: "I couldn't find a matching FAQ for that question. This might be a deal-specific or complex question that needs attorney review.",
        action: 'Please <a href="https://github.com/github/commlegal/issues/new/choose" target="_blank">file a CommLegal issue</a> or reach out to your assigned attorney in <strong>#legal</strong>.',
        confidence: 'none',
      };
    }

    const best = results[0];
    const secondBest = results[1];

    if (best.score > 15 && (!secondBest || best.score > secondBest.score * 1.5)) {
      return {
        answer: formatAnswerHTML(best.answer),
        source: best.question,
        category: best.category,
        confidence: 'high',
        related: results.slice(1, 4),
      };
    }

    if (best.score > 5) {
      return {
        answer: formatAnswerHTML(best.answer),
        source: best.question,
        category: best.category,
        confidence: 'medium',
        related: results.slice(1, 4),
        note: 'This is a likely match, but you may also want to check the related questions below.',
      };
    }

    return {
      answer: formatAnswerHTML(best.answer),
      source: best.question,
      category: best.category,
      confidence: 'low',
      related: results.slice(1, 4),
      note: "This is the closest match I found, but it may not fully answer your question. Consider filing a CommLegal issue for a more specific answer.",
    };
  }

  function formatAnswerHTML(text) {
    let html = escapeHTML(text);
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    html = html.replace(/(https?:\/\/[^\s<,.)]+)/g, function (match) {
      return '<a href="' + match + '" target="_blank">' + match + '</a>';
    });
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return '<p>' + html + '</p>';
  }

  function escapeHTML(str) {
    const el = document.createElement('div');
    el.textContent = str;
    return el.innerHTML;
  }

  // -----------------------------------------------------------------------
  // FAQ rendering
  // -----------------------------------------------------------------------
  async function loadFAQ() {
    const resp = await fetch('faq.json');
    faqData = await resp.json();
    buildIndex();
  }

  function renderCategories() {
    const cats = [...new Set(faqData.map(e => e.category))];
    faqCategories.innerHTML =
      '<button class="category-chip active" data-cat="">All</button>' +
      cats.map(c => '<button class="category-chip" data-cat="' + escapeHTML(c) + '">' + escapeHTML(c) + '</button>').join('');

    faqCategories.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.cat || null;
        faqCategories.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterAndRender();
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
    faqList.innerHTML = items.map(item =>
      '<div class="faq-item" data-id="' + item.id + '">' +
        '<div class="faq-question">' +
          '<span>' + escapeHTML(item.question) + '</span>' +
          '<span class="category-tag">' + escapeHTML(item.category) + '</span>' +
          '<span class="chevron">&#9656;</span>' +
        '</div>' +
        '<div class="faq-answer">' + formatAnswerHTML(item.answer) + '</div>' +
      '</div>'
    ).join('');

    faqList.querySelectorAll('.faq-question').forEach(q => {
      q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
    });
  }

  // -----------------------------------------------------------------------
  // View switching: hero <-> results
  // -----------------------------------------------------------------------
  function showResults(query) {
    hero.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    searchResults.value = query;
    renderCategories();
    filterAndRender(query);
  }

  function showHero() {
    hero.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    aiResponseEl.classList.add('hidden');
    searchInput.value = '';
    searchResults.value = '';
    activeCategory = null;
    searchInput.focus();
  }

  // -----------------------------------------------------------------------
  // Main search + display
  // -----------------------------------------------------------------------
  function filterAndRender(queryOverride) {
    const query = (queryOverride !== undefined ? queryOverride : searchResults.value).trim();

    if (!query) {
      showHero();
      return;
    }

    var results = search(query);
    if (activeCategory) results = results.filter(e => e.category === activeCategory);

    showAnswer(query, results);

    faqHeading.textContent = results.length > 0
      ? results.length + ' matching FAQ' + (results.length !== 1 ? 's' : '')
      : 'No matches';
    renderFAQ(results);
  }

  function showAnswer(query, results) {
    var result = generateAnswer(query, results);
    aiResponseEl.classList.remove('hidden');

    var badges = {
      high:   { text: 'High confidence', cls: 'badge-high' },
      medium: { text: 'Partial match',   cls: 'badge-medium' },
      low:    { text: 'Low confidence',   cls: 'badge-low' },
      none:   { text: 'No match found',   cls: 'badge-none' },
    };
    var badge = badges[result.confidence];
    confidenceBadge.textContent = badge.text;
    confidenceBadge.className = 'confidence-badge ' + badge.cls;

    var html = '';
    if (result.source) {
      html += '<div class="answer-source"><strong>FAQ:</strong> ' + escapeHTML(result.source) + '</div>';
    }
    html += '<div class="answer-body">' + result.answer + '</div>';
    if (result.note) {
      html += '<div class="answer-note">' + escapeHTML(result.note) + '</div>';
    }
    if (result.action) {
      html += '<div class="answer-action">' + result.action + '</div>';
    }
    aiAnswerEl.innerHTML = html;

    if (result.related && result.related.length > 0) {
      relatedLinks.innerHTML =
        '<div class="related-heading">Related questions:</div>' +
        result.related.map(r =>
          '<button class="related-link" data-query="' + escapeHTML(r.question) + '">' +
            escapeHTML(r.question) +
            '<span class="related-cat">' + escapeHTML(r.category) + '</span>' +
          '</button>'
        ).join('');

      relatedLinks.querySelectorAll('.related-link').forEach(btn => {
        btn.addEventListener('click', () => {
          searchInput.value = btn.dataset.query;
          filterAndRender();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    } else {
      relatedLinks.innerHTML = '';
    }
  }

  // -----------------------------------------------------------------------
  // Event listeners
  // -----------------------------------------------------------------------

  // Hero search input
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) {
      e.preventDefault();
      showResults(searchInput.value.trim());
    }
  });

  // Results search input
  var debounceTimer;
  searchResults.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => filterAndRender(), 200);
  });
  searchResults.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      filterAndRender();
    }
  });

  // Clear button
  clearBtn.addEventListener('click', showHero);

  // Quick topic chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      showResults(chip.dataset.q);
    });
  });

  searchInput.focus();
  loadFAQ();

})();
