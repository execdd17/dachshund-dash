// HTML global-leaderboard table: difficulty tabs, search, pagination,
// rendering. Browser-only (touches the DOM); list slicing/filtering itself
// is the pure getScoresForDifficulty()/getFilteredScores() in global.js.

import { GLOBAL_PAGE_SIZE, DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY_INDEX } from '../config.js';
import { getFilteredScores, getScoresForDifficulty } from './global.js';

export function createLeaderboardUi(globalScores) {
  let page = 0;
  let searchTerm = '';
  let difficulty = DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX].label;

  function currentBoard() {
    return getFilteredScores(getScoresForDifficulty(globalScores.scores, difficulty), searchTerm);
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

    if (!globalScores.loaded && !globalScores.error) {
      body.innerHTML = '<tr><td colspan="3" class="lb-status">Loading...</td></tr>';
      pageInfo.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    if (globalScores.error && globalScores.scores.length === 0) {
      body.innerHTML = '<tr><td colspan="3" class="lb-status">Leaderboard unavailable (offline)</td></tr>';
      pageInfo.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const filtered = currentBoard();
    const totalPages = Math.max(1, Math.ceil(filtered.length / GLOBAL_PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    const start = page * GLOBAL_PAGE_SIZE;
    const pageScores = filtered.slice(start, start + GLOBAL_PAGE_SIZE);

    if (filtered.length === 0) {
      body.innerHTML = searchTerm
        ? '<tr><td colspan="3" class="lb-empty">No matching scores</td></tr>'
        : `<tr><td colspan="3" class="lb-empty">No ${difficulty} scores yet — be the first!</td></tr>`;
      pageInfo.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
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

  // Switch the visible board (also called when the player picks a difficulty
  // on the start overlay, so they land on their own board).
  function setDifficulty(label) {
    if (!DIFFICULTY_LEVELS.some(l => l.label === label) || label === difficulty) return;
    difficulty = label;
    page = 0;
    render();
  }

  function wireControls() {
    const tabs = document.getElementById('lbDifficultyTabs');
    for (const level of DIFFICULTY_LEVELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.difficulty = level.label;
      btn.textContent = level.label;
      btn.addEventListener('click', () => setDifficulty(level.label));
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

  return { render, wireControls, setDifficulty };
}
