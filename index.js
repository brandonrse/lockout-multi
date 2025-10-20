// Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const chooseBtn = document.getElementById('chooseBtn');
const clearBtn = document.getElementById('clearBtn');
const logRawBtn = document.getElementById('logRawBtn');
const fileList = document.getElementById('fileList');
const errors = document.getElementById('errors');
const footer = document.querySelector('.footer');

// Download button
const downloadBtn = document.createElement('button');
downloadBtn.className = 'btn';
downloadBtn.textContent = 'Download Merged JSON';
downloadBtn.style.display = 'none';
footer.appendChild(downloadBtn);

// Skip counter
const skipNotice = document.createElement('div');
skipNotice.className = 'skip-notice';
footer.prepend(skipNotice);

// Summary box
const summaryBox = document.createElement('div');
summaryBox.className = 'summary-box hidden';
footer.after(summaryBox);

let files = [];
let mergedJSON = null;
let skippedObjectives = 0;
let lastSummary = "";

//#region Helpers
// Helpers
function humanFileSize(size) {
  if (size === 0) return '0 B';
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) + ' ' + ['B','KB','MB','GB','TB'][i];
}

function renderList() {
  fileList.innerHTML = '';
  if (files.length === 0) {
    fileList.innerHTML = '<p class="muted">No files selected</p>';
    fileList.setAttribute('aria-label', 'Selected files (0)');
    return;
  }
  files.forEach((f, idx) => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <p title="${f.name}">${f.name}</p>
      <div class="file-actions">
        <span class="size">${humanFileSize(f.size)}</span>
        <button data-idx="${idx}" class="btn ghost small">Remove</button>
      </div>`;
    fileList.appendChild(el);
  });
  fileList.setAttribute('aria-label', `Selected files (${files.length})`);

  fileList.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = Number(btn.getAttribute('data-idx'));
      files.splice(idx, 1);
      renderList();
    });
  });
}

function setError(msg) {
  errors.textContent = msg;
  setTimeout(() => {
    if (errors.textContent === msg) errors.textContent = '';
  }, 6000);
}

function makeInitials(gameName) {
  if (!gameName) { 
    return 'UNK';
  }
  const abbr = (gameName.match(/[A-Z]/g) || []).join('');
  return abbr ? abbr.toLowerCase() : gameName.replace(/\s+/g, '').slice(0, 4).toLowerCase();
}

function uniqueKey(existing, base) {
  let key = base;
  let counter = 2;
  while (existing.has(key)) {
    key = `${base}_${counter++}`;
  }
  return key;
}
//#endregion

//#region Merge
// Core merging logic
function mergeJSONs(jsonArray) {
  const merged = {
    version: "1.0.0",
    game: "Multi Game",
    objectives: [],
    limits: {
      board: {},
      line: {}
    }
  };

  const gameInitialMap = new Map();
  const seenInitials = new Set();
  skippedObjectives = 0;

  for (const j of jsonArray) {
    const gameName = j.game || "Unknown Game";
    const baseInitials = makeInitials(gameName);
    const uniqueInitials = uniqueKey(seenInitials, baseInitials);
    seenInitials.add(uniqueInitials);
    gameInitialMap.set(gameName, uniqueInitials);

    if (Array.isArray(j.objectives)) {
      j.objectives.forEach(obj => {
        if (!Array.isArray(obj.board_categories)) {
          obj.board_categories = [];
        }
        if (!Array.isArray(obj.line_categories)) {
          obj.line_categories = [];
        }

        const hasBoard = obj.board_categories.includes(uniqueInitials);
        const hasLine = obj.line_categories.includes(uniqueInitials);

        const wouldExceedBoard = obj.board_categories.length + (hasBoard ? 0 : 1) > 4;
        const wouldExceedLine = obj.line_categories.length + (hasLine ? 0 : 1) > 4;

        if (wouldExceedBoard || wouldExceedLine) {
          skippedObjectives++;
          return;
        }

        if (!hasBoard) {
          obj.board_categories.push(uniqueInitials);
        }
        if (!hasLine) {
          obj.line_categories.push(uniqueInitials);
        }

        if (typeof obj.tooltip === 'string' && obj.tooltip.trim()) {
          const needsSpace = /[.!?]$/.test(obj.tooltip.trim()) ? ' ' : '';
          obj.tooltip = `${obj.tooltip.trim()}${needsSpace}(${gameName})`;
        } else {
          obj.tooltip = `(${gameName})`;
        }

        merged.objectives.push(obj);
      });
    }

    if (j.limits?.board) {
      for (const [key, value] of Object.entries(j.limits.board)) {
        const existingKeys = Object.keys(merged.limits.board);
        let newKey = key;
        let counter = 2;
        while (existingKeys.includes(newKey)) {
          newKey = `${key}_${counter++}`;
        }
        merged.limits.board[newKey] = value;
      }
    }

    if (j.limits?.line) {
      for (const [key, value] of Object.entries(j.limits.line)) {
        const existingKeys = Object.keys(merged.limits.line);
        let newKey = key;
        let counter = 2;
        while (existingKeys.includes(newKey)) {
          newKey = `${key}_${counter++}`;
        }
        merged.limits.line[newKey] = value;
      }
    }
  }

  const gameCount = gameInitialMap.size;
  const summary = [];
  if (gameCount > 0) {
    const baseValue = Math.floor(100 / gameCount);
    const remainder = 100 - baseValue * gameCount;
    let i = 0;
    for (const [gameName, initials] of gameInitialMap.entries()) {
      const val = baseValue + (i < remainder ? 1 : 0);
      merged.limits.board[initials] = val;
      merged.limits.line[initials] = val;
      summary.push({ gameName, initials, percent: val });
      i++;
    }
  }

  skipNotice.textContent =
    skippedObjectives > 0
      ? `⚠️ ${skippedObjectives} objective${skippedObjectives !== 1 ? 's' : ''} skipped (exceeded 4 board/line categories).`
      : '';

  const mergedCount = merged.objectives.length;
  let html = `<h3 class="summary-title">Merge Summary</h3>
              <p class="summary-subtitle">✅ ${mergedCount} objectives merged${skippedObjectives ? ` • ⚠️ ${skippedObjectives} skipped` : ''}</p>
              <table class="summary-table">
              <thead><tr><th>Game</th><th>Initials</th><th>% Share</th></tr></thead><tbody>`;
  summary.forEach(s => {
    html += `<tr><td>${s.gameName}</td><td>${s.initials}</td><td>${s.percent}%</td></tr>`;
  });
  html += '</tbody></table>';

  lastSummary = html;
  summaryBox.innerHTML = html;
  summaryBox.classList.remove('hidden');

  return merged;
}
//#endregion

//#region File processing
// File processing
async function processFiles(givenFiles) {
  const arr = Array.from(givenFiles || []);
  const jsonFiles = arr.filter(f => f.type === 'application/json' || f.name.toLowerCase().endsWith('.json'));
  if (jsonFiles.length === 0) {
    setError('No JSON files detected.');
    return;
  }

  files = files.concat(jsonFiles);
  renderList();

  const parsedList = [];
  for (const f of jsonFiles) {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      parsedList.push(parsed);
    } catch (err) {
      console.error('Error parsing', f.name, err);
      setError(`Failed to parse ${f.name}: ${err.message}`);
    }
  }

  if (parsedList.length > 0) {
    mergedJSON = mergeJSONs(parsedList);
    console.group('✅ Merged JSON');
    console.log(mergedJSON);
    console.groupEnd();
    downloadBtn.style.display = 'inline-block';
  }
}
//#endregion

// --- Download merged JSON ---
function downloadMergedJSON() {
  if (!mergedJSON) {
    setError('No merged JSON available.');
    return;
  }
  const blob = new Blob([JSON.stringify(mergedJSON, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `merged_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Event listeners ---
chooseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => processFiles(e.target.files));

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('dragover'); });
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer?.files) processFiles(e.dataTransfer.files);
});

dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

clearBtn.addEventListener('click', () => {
  files = [];
  mergedJSON = null;
  skippedObjectives = 0;
  fileInput.value = '';
  renderList();
  console.clear();
  skipNotice.textContent = '';
  summaryBox.classList.add('hidden');
  downloadBtn.style.display = 'none';
});

logRawBtn.addEventListener('click', () => {
  if (mergedJSON) {
    console.group('✅ Merged JSON (Re-log)');
    console.log(mergedJSON);
    console.groupEnd();
    if (lastSummary) {
      summaryBox.innerHTML = lastSummary;
      summaryBox.classList.remove('hidden');
    }
  } else setError('No merged JSON to log yet.');
});

downloadBtn.addEventListener('click', downloadMergedJSON);

renderList();
