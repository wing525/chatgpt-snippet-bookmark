const STORAGE_KEY = 'snippetBookmarks';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-chatgpt-selection',
    title: 'Save selection to Snippet Bookmarks',
    contexts: ['selection'],
    documentUrlPatterns: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-chatgpt-selection' || !tab?.id) return;
  await saveFromTab(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  await saveFromTab(tab.id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'open-snippet') {
    handleOpenSnippet(msg.item, !!msg.debug)
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});

async function saveFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sel = window.getSelection();
        const text = sel?.toString()?.trim() || '';
        if (!text) return { text: '' };

        const normalizeSpace = (s) => (s || '').replace(/\s+/g, ' ').trim();

        const getAssistantTurns = () => {
          const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
          const turns = [];
          const seen = new Set();
          for (const n of roleNodes) {
            const t = n.closest('[data-message-id], [data-testid^="conversation-turn-"], article') || n;
            if (!t || seen.has(t)) continue;
            seen.add(t);
            turns.push(t);
          }
          return turns;
        };

        const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        const node = range?.commonAncestorContainer || sel.anchorNode;
        const anchorEl = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;

        const assistantTurns = getAssistantTurns();
        const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
        let turn = null;
        let roleNode = null;
        if (anchorEl) {
          roleNode = roleNodes.find((n) => n.contains(anchorEl) || anchorEl.contains(n)) || anchorEl.closest?.('[data-message-author-role="assistant"]') || null;
          turn = assistantTurns.find((t) => t.contains(anchorEl)) || (roleNode ? (roleNode.closest('[data-message-id], [data-testid^="conversation-turn-"], article') || roleNode) : null);
        }

        const role = turn ? 'assistant' : null;
        const messageId =
          turn?.getAttribute?.('data-message-id') ||
          turn?.id ||
          turn?.getAttribute?.('data-testid') ||
          null;

        const turnIndex = turn ? assistantTurns.indexOf(turn) : -1;
        const turnTextRaw = normalizeSpace(turn?.innerText || '');
        const turnText = turnTextRaw.slice(0, 4000);

        const selNorm = normalizeSpace(text);
        const pos = turnTextRaw.indexOf(selNorm);
        const prefix = pos >= 0 ? turnTextRaw.slice(Math.max(0, pos - 80), pos) : '';
        const suffix = pos >= 0 ? turnTextRaw.slice(pos + selNorm.length, pos + selNorm.length + 80) : '';

        const roleNodeIndex = roleNode ? roleNodes.indexOf(roleNode) : -1;

        return {
          text,
          url: location.href,
          title: document.title,
          role,
          messageId,
          turnIndex,
          roleNodeIndex,
          turnText,
          prefix,
          suffix
        };
      }
    });

    const payload = result?.result;
    if (!payload?.text) {
      await notify('No selected text found.');
      return;
    }

    if ((payload.role || '').toLowerCase() !== 'assistant') {
      await notify('Please select text from assistant message.');
      return;
    }

    const snippet = {
      id: crypto.randomUUID(),
      text: payload.text,
      url: payload.url,
      title: payload.title,
      role: payload.role,
      messageId: payload.messageId,
      turnIndex: Number.isInteger(payload.turnIndex) ? payload.turnIndex : -1,
      roleNodeIndex: Number.isInteger(payload.roleNodeIndex) ? payload.roleNodeIndex : -1,
      turnText: payload.turnText || '',
      prefix: payload.prefix || '',
      suffix: payload.suffix || '',
      tags: [],
      createdAt: new Date().toISOString()
    };

    const all = await getAll();
    all.unshift(snippet);
    await chrome.storage.local.set({ [STORAGE_KEY]: all.slice(0, 2000) });
    await notify('Snippet saved.');
  } catch (e) {
    await notify('Save failed.');
  }
}

async function handleOpenSnippet(item, debug = false) {
  const tab = await chrome.tabs.create({ url: item.url, active: !debug });
  await waitTabComplete(tab.id, 12000);

  let diag = null;
  for (let i = 0; i < 4; i++) {
    const [ret] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [item.text || '', item.turnText || '', item.prefix || '', item.suffix || '', Number.isInteger(item.turnIndex) ? item.turnIndex : -1, Number.isInteger(item.roleNodeIndex) ? item.roleNodeIndex : -1],
      func: async (snippetText, savedTurnText, prefix, suffix, savedTurnIndex, savedRoleNodeIndex) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const diag = { ok: false, stage: 'init', blocks: 0, bestScore: 0 };

        const normalize = (s) =>
          (s || '')
            .replace(/[•·▪▫◦‣⁃●]/g, ' ')
            .replace(/^[\s>*\-\d\.)]+/gm, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const getRoleNodes = () => Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
        const getBlocks = () => {
          const roleNodes = getRoleNodes();
          const out = [];
          const seen = new Set();
          for (const n of roleNodes) {
            const t = n.closest('[data-message-id], [data-testid^="conversation-turn-"], article') || n;
            if (!t || seen.has(t)) continue;
            seen.add(t);
            out.push(t);
          }
          return out;
        };

        const focus = (el) => {
          if (!el) return false;
          const prev = el.style.outline;
          el.style.outline = '2px solid #22c55e';
          let j = 0;
          const tick = () => {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            j += 1;
            if (j < 18) setTimeout(tick, 250);
            else setTimeout(() => { el.style.outline = prev; }, 600);
          };
          tick();
          return true;
        };

        let last = -1, stable = 0;
        for (let i = 0; i < 28; i++) {
          const c = getBlocks().length;
          if (c > 0 && c === last) stable++; else stable = 0;
          last = c;
          if (stable >= 3) break;
          await sleep(250);
        }

        const blocks = getBlocks();
        diag.blocks = blocks.length;
        if (!blocks.length) { diag.stage = 'no-blocks'; return diag; }

        const qTurn = normalize(savedTurnText).slice(0, 280);
        const qSel = normalize(snippetText).slice(0, 180);
        const qPrefix = normalize(prefix).slice(-80);
        const qSuffix = normalize(suffix).slice(0, 80);

        if (savedRoleNodeIndex >= 0) {
          const roleNodes = getRoleNodes();
          const n = roleNodes[savedRoleNodeIndex];
          const t = n?.closest('[data-message-id], [data-testid^="conversation-turn-"], article') || n;
          const sig = normalize(savedTurnText).slice(0, 80);
          const txt = normalize(t?.innerText || '');
          if (t && (!sig || txt.includes(sig))) {
            diag.stage = 'roleNodeIndex';
            diag.ok = focus(t);
            return diag;
          }
        }

        if (savedTurnIndex >= 0 && savedTurnIndex < blocks.length) {
          const byIdx = blocks[savedTurnIndex];
          const sig = normalize(savedTurnText).slice(0, 80);
          const txt = normalize(byIdx.innerText || '');
          if (!sig || txt.includes(sig)) {
            diag.stage = 'turnIndex';
            diag.ok = focus(byIdx);
            return diag;
          }
        }

        for (const el of blocks) {
          const t = normalize(el.innerText || '');
          if (!t) continue;
          if (qSel && t.includes(qSel)) {
            const preOk = qPrefix ? t.includes(qPrefix) : true;
            const sufOk = qSuffix ? t.includes(qSuffix) : true;
            if (preOk || sufOk) {
              diag.stage = 'strict-sel+ctx';
              diag.ok = focus(el);
              return diag;
            }
          }
        }

        if (qTurn) {
          for (const el of blocks) {
            const t = normalize(el.innerText || '');
            if (t.includes(qTurn)) {
              diag.stage = 'turn-exact';
              diag.ok = focus(el);
              return diag;
            }
          }
        }

        const tokenBase = (qTurn || qSel).split(' ').filter(Boolean).slice(0, 50);
        let best = null, bestScore = 0;
        for (const el of blocks) {
          const t = normalize(el.innerText || '');
          if (!t) continue;
          let hit = 0;
          for (const tk of tokenBase) if (tk.length >= 2 && t.includes(tk)) hit++;
          let score = tokenBase.length ? hit / tokenBase.length : 0;
          if (qPrefix && t.includes(qPrefix)) score += 0.25;
          if (qSuffix && t.includes(qSuffix)) score += 0.25;
          if (score > bestScore) { bestScore = score; best = el; }
        }
        diag.bestScore = bestScore;
        if (best && bestScore >= 0.62) {
          diag.stage = 'score-match';
          diag.ok = focus(best);
          return diag;
        }

        diag.stage = 'not-found';
        return diag;
      }
    });

    diag = ret?.result || null;
    if (diag?.ok) break;
    await delay(500);
  }

  if (debug) await chrome.tabs.update(tab.id, { active: true });
  return { tabId: tab.id, diag };
}

async function waitTabComplete(tabId, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, timeoutMs);

    const listener = (id, info) => {
      if (id !== tabId || info.status !== 'complete' || done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAll() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function notify(message) {
  await chrome.action.setBadgeText({ text: '✓' });
  await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 1200);
  console.log(message);
}
