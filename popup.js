const STORAGE_KEY = 'snippetBookmarks';
const q = document.getElementById('q');
const list = document.getElementById('list');
const exportBtn = document.getElementById('export');

q.addEventListener('input', render);
exportBtn.addEventListener('click', exportMarkdown);
render();

async function getAll() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function setAll(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function matches(item, keyword) {
  if (!keyword) return true;
  const k = keyword.toLowerCase();
  return [item.text, item.title, (item.tags || []).join(' '), item.messageId || '']
    .join(' ')
    .toLowerCase()
    .includes(k);
}

async function openSnippet(item, debug = false) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'open-snippet', item, debug });
    if (!res?.ok) {
      alert('打开失败，请重试。');
      if (debug) console.error('openSnippet error', res?.error);
      return;
    }

    const result = res.diag;
    if (!result?.ok) {
      alert('还没定位到这条，可能是旧收藏缺少新定位信息。请重新保存该片段后再试。');
    }

    if (debug) {
      const msg = `Debug\n` +
        `ok: ${!!result?.ok}\n` +
        `stage: ${result?.stage || 'unknown'}\n` +
        `assistantBlocks: ${result?.blocks ?? '-'}\n` +
        `bestScore: ${result?.bestScore ?? '-'}\n`;
      alert(msg);
      console.log('Snippet debug', { item, result });
    }
  } catch (e) {
    alert('打开失败，请重试。');
    if (debug) console.error('openSnippet debug error', e);
  }
}

async function exportMarkdown() {
  const all = await getAll();
  if (!all.length) return;

  const lines = ['# ChatGPT Snippet Bookmarks', ''];
  for (const item of all) {
    lines.push(`## ${item.title || 'Untitled'}`);
    lines.push(`- 时间: ${fmtDate(item.createdAt)}`);
    lines.push(`- 标签: ${(item.tags || []).join(', ') || '无'}`);
    lines.push(`- 角色: ${item.role || 'assistant'}`);
    if (item.messageId) lines.push(`- 消息ID: ${item.messageId}`);
    lines.push(`- 链接: ${item.url || ''}`);
    lines.push('');
    lines.push('```text');
    lines.push(item.text || '');
    lines.push('```');
    lines.push('');
  }

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chatgpt-snippets-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function render() {
  const all = await getAll();
  const keyword = q.value.trim();
  const items = all.filter(x => matches(x, keyword));

  if (!items.length) {
    list.innerHTML = `<div class="empty">No snippets yet.</div>`;
    return;
  }

  list.innerHTML = '';
  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div class="text"></div>
      <div class="meta">
        <span>${escapeHtml(item.title || '')}</span>
        <span>${escapeHtml(fmtDate(item.createdAt))}</span>
      </div>
      <div class="meta"><span>${escapeHtml((item.tags || []).join(', ') || 'no tags')}</span></div>
      <div class="actions">
        <button data-act="open">Open</button>
        <button data-act="debug">Debug Open</button>
        <button data-act="tag">Tag</button>
        <button data-act="copy">Copy</button>
        <button data-act="del">Delete</button>
      </div>
    `;
    el.querySelector('.text').textContent = item.text;

    el.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;

      if (act === 'open') {
        await openSnippet(item, false);
      }
      if (act === 'debug') {
        await openSnippet(item, true);
      }
      if (act === 'copy') {
        await navigator.clipboard.writeText(item.text || '');
      }
      if (act === 'tag') {
        const next = prompt('Set tags (comma separated):', (item.tags || []).join(','));
        if (next === null) return;
        const tags = next.split(',').map(s => s.trim()).filter(Boolean);
        const allItems = await getAll();
        const idx = allItems.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          allItems[idx].tags = tags;
          await setAll(allItems);
          await render();
        }
      }
      if (act === 'del') {
        const allItems = await getAll();
        await setAll(allItems.filter(x => x.id !== item.id));
        await render();
      }
    });

    list.appendChild(el);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
