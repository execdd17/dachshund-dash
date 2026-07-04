// Cosmetics menu overlay (DOM): tabs per slot, item grid, live preview of
// the idle dog wearing the equipped items.

import { DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET, COSMETICS_PREVIEW_SCALE } from '../config.js';
import {
  COSMETIC_SLOTS, COSMETIC_DRAW_ORDER, COSMETIC_SLOT_LABELS, COSMETIC_DEFS,
  getItemAnchorOffset, getHeadAnchor,
} from './cosmetics.js';
import { drawSpriteFrameLayer, drawCosmeticOverlay } from '../render/actors.js';

export function createCosmeticsMenu(cosmetics, sprites, state) {
  let activeTab = COSMETIC_SLOTS[0];

  function renderTabs() {
    const tabsEl = document.getElementById('cosmeticsTabs');
    tabsEl.innerHTML = '';
    COSMETIC_SLOTS.forEach(slot => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'cosmetics-tab' + (slot === activeTab ? ' active' : '');
      tab.textContent = COSMETIC_SLOT_LABELS[slot];
      tab.dataset.slot = slot;
      tabsEl.appendChild(tab);
    });
  }

  function renderGrid() {
    const gridEl = document.getElementById('cosmeticsGrid');
    gridEl.innerHTML = '';

    const noneTile = document.createElement('div');
    noneTile.className = 'cosmetics-tile' + (cosmetics.equipped[activeTab] === null ? ' selected' : '');
    noneTile.dataset.itemId = '';
    noneTile.innerHTML = '<div class="cosmetics-tile-none">&empty;</div><div class="cosmetics-tile-label">None</div>';
    gridEl.appendChild(noneTile);

    COSMETIC_DEFS[activeTab].forEach(item => {
      const tile = document.createElement('div');
      tile.className = 'cosmetics-tile' + (cosmetics.equipped[activeTab] === item.id ? ' selected' : '');
      tile.dataset.itemId = item.id;
      tile.innerHTML = `<div class="cosmetics-tile-icon"><img src="${item.image}" alt="${item.name}"></div><div class="cosmetics-tile-label">${item.name}</div>`;
      gridEl.appendChild(tile);
    });
  }

  function renderPreview() {
    const canvas = document.getElementById('cosmeticsPreviewCanvas');
    const pctx = canvas.getContext('2d');
    pctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sprites.dogSpritesReady) return;
    // groundOffset is in destination pixels, so it scales with the preview size too
    const scale = DOG_SPRITE_SCALE * COSMETICS_PREVIEW_SCALE;
    const groundOffset = DOG_SPRITE_GROUND_OFFSET * COSMETICS_PREVIEW_SCALE;
    const anchorX = canvas.width / 2;
    // The sprite's pixels reach ~28px (at 1x) below the nominal ground line
    // GROUND_OFFSET was calibrated for, so raise groundY to keep the dog in frame.
    const groundY = canvas.height - 16 - 28 * COSMETICS_PREVIEW_SCALE;
    drawSpriteFrameLayer(pctx, sprites.dogSprites.idle[0], anchorX, groundY, scale, groundOffset);
    const anchor = getHeadAnchor('idle', 0);
    COSMETIC_DRAW_ORDER.forEach(slot => {
      const itemId = cosmetics.equipped[slot];
      if (!itemId) return;
      const img = cosmetics.imageById[slot][itemId];
      drawCosmeticOverlay(pctx, img, anchor, getItemAnchorOffset(slot, itemId), anchorX, groundY, scale, groundOffset);
    });
  }

  function open() {
    activeTab = COSMETIC_SLOTS[0];
    renderTabs();
    renderGrid();
    renderPreview();
    document.getElementById('cosmeticsMenu').classList.add('visible');
  }

  function close() {
    document.getElementById('cosmeticsMenu').classList.remove('visible');
  }

  function isOpen() {
    return document.getElementById('cosmeticsMenu').classList.contains('visible');
  }

  function updateCustomizeButtonVisibility() {
    document.getElementById('customizeBtn').classList.toggle('visible', state.gameState === 'idle');
  }

  function wireControls() {
    document.getElementById('customizeBtn').addEventListener('click', open);
    document.getElementById('cosmeticsDoneBtn').addEventListener('click', close);
    document.getElementById('cosmeticsTabs').addEventListener('click', e => {
      const tab = e.target.closest('.cosmetics-tab');
      if (!tab) return;
      activeTab = tab.dataset.slot;
      renderTabs();
      renderGrid();
    });
    document.getElementById('cosmeticsGrid').addEventListener('click', e => {
      const tile = e.target.closest('.cosmetics-tile');
      if (!tile) return;
      cosmetics.select(activeTab, tile.dataset.itemId);
      renderGrid();
      renderPreview();
    });
  }

  return { open, close, isOpen, updateCustomizeButtonVisibility, wireControls };
}
