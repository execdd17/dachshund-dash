// Encounter exclusion and the generic scene runner. Encounters (giant mode
// and the scenes: tutorial, chase, boss, trampoline, tunnel, flight) never overlap,
// including their transition phases. Scenes share one slot, state.scene =
// { id, phase, …data }, so "is any scene busy" is just whether the slot is taken.
//
// A scene is a definition object (see tutorial.js, chase.js, boss.js, trampoline.js, tunnel.js, flight.js):
//   id                         — 'tutorial' | 'chase' | 'boss' | 'tramp' | 'tunnel' | 'flight'
//   initialData()              — fresh per-run data merged into state.scene
//   wantsTurn(state, memory)   — trigger (usually score); memory (state.sceneMemory[id])
//                                outlives each run of the scene
//   start(state, scene, ctx)   — the field is clear: set the first real phase + data
//   phases[phase](state, scene, ctx) — one frame of that phase; returns the
//                                next phase name, 'done', or nothing to stay
//   quietPhases                — phases (besides 'pending') with no normal spawning
//   jumpsQueue(memory)         — optional: true when this turn joins the front of the scene queue
//   timeScale(scene)           — optional: multiplier on game time (scenes.js)
//   scoreless                  — optional: no distance points while it runs
//   skipsFrenzy                — optional: never asks for a turn once the frenzy starts (frenzy.js)
// ctx is { scale, services, now, rng } for the frame.

import { SCENE_MIN_GAP } from '../config.js';

export function giantBusy(state) {
  return state.giantPhase !== 'off';
}

export function anySceneBusy(state) {
  return state.scene !== null;
}

// True while scene `id` runs (in `phase`, when given).
export function inScene(state, id, phase) {
  return state.scene?.id === id && (phase === undefined || state.scene.phase === phase);
}

// Giant mode: 'off' | 'growing' | 'active' | 'shrinking' (see giant.js).
export function getGiantPhase(state) {
  return state.giantPhase;
}

export function setGiantPhase(state, phase) {
  state.giantPhase = phase;
}

// A golden pickup on the field means giant mode is imminent — score-armed
// encounters must not arm behind it, or they'd activate mid-giant once the
// field clears.
export function goldenOnField(state) {
  return state.obstacles.some(o => o.type === 'golden');
}

// Scenes additionally guarantee SCENE_MIN_GAP ms of normal gameplay between
// one another, measured from the end of one scene's last phase. Per-scene
// score cooldowns still apply on top. Giant mode is a reward power-up, not a
// scene, so it doesn't count.
export function sceneGapElapsed(state, now) {
  return now - state.lastSceneEndAt >= SCENE_MIN_GAP;
}

export function markSceneEnd(state, now) {
  state.lastSceneEndAt = now;
  state.goldenSinceScene = false;  // the next gap may get its golden
}

// --- Scene queue (fairness between scenes) ---
// A scene *requests* a turn once its own score condition is met (at most one
// outstanding request per scene); turns are granted strictly in request order
// once the shared field rules allow a scene to start. Without the queue,
// the fixed update order breaks ties, and chase's short cooldown lets it win
// nearly every one — starving the trampoline scene.

export function requestScene(state, id) {
  if (!state.sceneQueue.includes(id)) state.sceneQueue.push(id);
}

// A pending scene that stood down (giant mode won the race) goes back to the
// head of the queue: it keeps its turn for after the giant ends instead of
// rejoining behind everyone else. A `jumpsQueue` scene's turn starts there too.
export function requeueSceneFront(state, id) {
  if (!state.sceneQueue.includes(id)) state.sceneQueue.unshift(id);
}

// True — consuming the queued turn — only when this scene is at the head of
// the queue and the field allows any scene to start right now.
export function tryStartScene(state, id, now) {
  if (state.sceneQueue[0] !== id) return false;
  if (giantBusy(state) || anySceneBusy(state) || goldenOnField(state)) return false;
  if (!sceneGapElapsed(state, now)) return false;
  state.sceneQueue.shift();
  return true;
}

export function sceneMemory(state, id) {
  state.sceneMemory[id] ??= {};
  return state.sceneMemory[id];
}

// The common trigger: first at `firstAt`, then `cooldown` points after the
// scene last ended (memory.lastEndScore, which the scene sets as it winds down).
export function scoreCooldownTrigger(state, memory, firstAt, cooldown) {
  const last = memory.lastEndScore ?? 0;
  return last === 0 ? state.score >= firstAt : state.score >= last + cooldown;
}

// No normal obstacle spawns while a scene waits for a clear field or is in
// one of its quiet phases.
export function sceneBlocksSpawning(state, def) {
  return state.scene?.id === def.id
    && (state.scene.phase === 'pending' || def.quietPhases.includes(state.scene.phase));
}

// One frame of one scene: run its current phase if it's the scene in the
// slot; otherwise check its trigger and whether its queued turn can start.
export function stepScene(state, def, ctx) {
  const scene = state.scene;
  if (scene?.id === def.id) {
    if (scene.phase === 'pending') {
      // Giant mode won the race (a golden eaten after we armed): stand down
      // so giant mode keeps its normal edible field, keeping the queued turn.
      if (giantBusy(state)) {
        state.scene = null;
        requeueSceneFront(state, def.id);
      } else if (state.obstacles.length === 0) {
        def.start(state, scene, ctx);
      }
      return;
    }
    const next = def.phases[scene.phase](state, scene, ctx);
    if (next === 'done') {
      state.scene = null;
      markSceneEnd(state, ctx.now);
    } else if (next) {
      scene.phase = next;
    }
    return;
  }
  const memory = sceneMemory(state, def.id);
  if (!(def.skipsFrenzy && state.frenzyAt > 0) && def.wantsTurn(state, memory)) {
    (def.jumpsQueue?.(memory) ? requeueSceneFront : requestScene)(state, def.id);
  }
  if (tryStartScene(state, def.id, ctx.now)) {
    state.scene = { id: def.id, phase: 'pending', ...def.initialData() };
  }
}
