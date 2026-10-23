// HTML global-leaderboard table: board tabs (each difficulty, and HYPER), search, pagination,
// rendering. Browser-only (touches the DOM); list slicing/filtering itself
// is the pure getFilteredScores() in global.js.

import { GLOBAL_PAGE_SIZE, HYPER_LEVEL } from '../config.js';
import { BOARD_LABELS, isBoardLabel } from '../core/difficulty.js';
import { getFilteredScores } from './global.js';

export function createLeaderboardUi(globalScores) {
  let page = 0;
  let searchTerm = '';
  let difficulty = null;

  function currentBoard() {
    return getFilteredScores(globalScores.scores, searchTerm);
  }

  function renderTabs() {
    const tabs = document.getElementById('lbDifficultyTabs');
    if (!tabs) return;
    for (const btn of tabs.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
    }
  }

  function render() {
    const body = document.getElementById('lbBody');
    const pageInfo = document.getElementById('lbPageInfo');
    const prevBtn = document.getElementById('lbPrev');
    const nextBtn = document.getElementById('lbNext');
    if (!body) return;
    renderTabs();

    // A single full-width message row in place of the table, paging disabled.
    const showMessage = (cls, text) => {
      body.innerHTML = `<tr><td colspan="3" class="${cls}">${text}</td></tr>`;
      pageInfo.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    };

    if (!difficulty) return showMessage('lb-status', 'Start the game to load the leaderboard');
    if (!globalScores.loaded && !globalScores.error) return showMessage('lb-status', 'Loading...');
    if (globalScores.error && globalScores.scores.length === 0) {
      return showMessage('lb-status', 'Leaderboard unavailable (offline)');
    }

    const filtered = currentBoard();
    const totalPages = Math.max(1, Math.ceil(filtered.length / GLOBAL_PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    const start = page * GLOBAL_PAGE_SIZE;
    const pageScores = filtered.slice(start, start + GLOBAL_PAGE_SIZE);

    if (pageScores.length === 0) {
      return showMessage('lb-empty', searchTerm ? 'No matching scores' : `No ${difficulty} scores yet — be the first!`);
    }

    body.innerHTML = pageScores.map(entry => {
      const name = entry.name.replace(/</g, '&lt;');
      const score = String(Math.floor(entry.score)).padStart(5, '0');
      return `<tr><td>${entry.rank}</td><td>${name}</td><td>${score}</td></tr>`;
    }).join('');

    pageInfo.textContent = `Page ${page + 1} of ${totalPages}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= totalPages - 1;
  }

  // Called when the player picks a difficulty on the start overlay — sets the
  // session board and the visible tab together.
  function setSessionDifficulty(label) {
    if (!isBoardLabel(label)) return;
    difficulty = label;
    page = 0;
    searchTerm = '';
    const searchInput = document.getElementById('lbSearch');
    if (searchInput) searchInput.value = '';
    globalScores.setSessionDifficulty(label);
  }

  // User clicked a different difficulty tab in the HTML leaderboard.
  function setDifficulty(label) {
    if (!isBoardLabel(label) || label === difficulty) return;
    difficulty = label;
    page = 0;
    globalScores.loadView(label);
  }

  function wireControls() {
    const tabs = document.getElementById('lbDifficultyTabs');
    for (const label of BOARD_LABELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.difficulty = label;
      btn.textContent = label;
      btn.classList.toggle('hyper', label === HYPER_LEVEL.label);
      btn.addEventListener('click', () => setDifficulty(label));
      tabs.appendChild(btn);
    }
    document.getElementById('lbSearch').addEventListener('input', e => {
      searchTerm = e.target.value.trim();
      page = 0;
      render();
    });
    document.getElementById('lbPrev').addEventListener('click', () => {
      if (page > 0) { page--; render(); }
    });
    document.getElementById('lbNext').addEventListener('click', () => {
      const totalPages = Math.ceil(currentBoard().length / GLOBAL_PAGE_SIZE);
      if (page < totalPages - 1) { page++; render(); }
    });
  }

  return { render, wireControls, setSessionDifficulty, setDifficulty };
}
