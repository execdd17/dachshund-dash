// HTML global-leaderboard table: search, pagination, rendering.
// Browser-only (touches the DOM); list filtering itself is the pure
// getFilteredScores() in global.js.

import { GLOBAL_PAGE_SIZE } from '../config.js';
import { getFilteredScores } from './global.js';

export function createLeaderboardUi(globalScores) {
  let page = 0;
  let searchTerm = '';

  function render() {
    const body = document.getElementById('lbBody');
    const pageInfo = document.getElementById('lbPageInfo');
    const prevBtn = document.getElementById('lbPrev');
    const nextBtn = document.getElementById('lbNext');
    if (!body) return;

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

    const filtered = getFilteredScores(globalScores.scores, searchTerm);
    const totalPages = Math.max(1, Math.ceil(filtered.length / GLOBAL_PAGE_SIZE));
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    const start = page * GLOBAL_PAGE_SIZE;
    const pageScores = filtered.slice(start, start + GLOBAL_PAGE_SIZE);

    if (filtered.length === 0) {
      body.innerHTML = searchTerm
        ? '<tr><td colspan="3" class="lb-empty">No matching scores</td></tr>'
        : '<tr><td colspan="3" class="lb-empty">No scores yet — be the first!</td></tr>';
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

  function wireControls() {
    document.getElementById('lbSearch').addEventListener('input', e => {
      searchTerm = e.target.value.trim();
      page = 0;
      render();
    });
    document.getElementById('lbPrev').addEventListener('click', () => {
      if (page > 0) { page--; render(); }
    });
    document.getElementById('lbNext').addEventListener('click', () => {
      const filtered = getFilteredScores(globalScores.scores, searchTerm);
      const totalPages = Math.ceil(filtered.length / GLOBAL_PAGE_SIZE);
      if (page < totalPages - 1) { page++; render(); }
    });
  }

  return { render, wireControls };
}
