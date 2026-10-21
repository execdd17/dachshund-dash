// Controls tutorial: three practice obstacles that teach jump, double jump,
// and duck, at the start of a run while state.tutorialPending. As each gets
// close the game slows and a prompt flashes until the player acts. Practice
// obstacles are harmless — a hit (too early, too late) knocks one away and
// the step repeats. The score stays at zero throughout.
//   pending → teach → praise → teach … → done   (a miss: teach → retry → teach)

import {
  W, MIN_OBSTACLE_GAP,
  TUTORIAL_VERSION, TUTORIAL_REFRESH_MS, TUTORIAL_SLOW_SCALE, TUTORIAL_GAPS, TUTORIAL_AGAIN_VY,
  TUTORIAL_PRAISE_MS, TUTORIAL_RETRY_MS,
} from '../config.js';
import { getDogHitbox } from './collision.js';
import { makeObstacle, getObstacleHitbox, towerSizeFor } from './obstacleTypes.js';
import { birdStack } from './birdWalls.js';

const STORAGE_KEY = 'dachshundDashTutorial';
const PRACTICE = { practice: true };

// Due on a device's first visit, TUTORIAL_REFRESH_MS after it was last seen,
// or when TUTORIAL_VERSION has moved past the version seen.
export function isTutorialDue(storage, now) {
  try {
    const seen = JSON.parse(storage.getItem(STORAGE_KEY));
    return !seen || seen.version < TUTORIAL_VERSION || now - seen.seenAt > TUTORIAL_REFRESH_MS;
  } catch {
    return true;
  }
}

export function markTutorialSeen(storage, now) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: TUTORIAL_VERSION, seenAt: now }));
}

// Space between the dog and the nearest target, hitbox to hitbox.
function gapAhead(state, targets) {
  const dog = getDogHitbox(state.dog, false);
  return Math.min(...targets.map(o => getObstacleHitbox(o).x)) - (dog.x + dog.w);
}

// Each step: its practice obstacles, and the actions it prompts for in
// order. An action prompts while ready() and is complete once done() while
// prompted. A jump prompts only with the dog on the ground, so a jump made
// before the prompt (including the one that starts the run) never counts.
const STEPS = [
  {
    spawn: x => [makeObstacle('hotdog', x, PRACTICE)],
    actions: [{ prompt: 'jump', ready: (gap, dog) => gap <= TUTORIAL_GAPS.jump.prompt && !dog.jumping, done: dog => dog.jumping }],
  },
  {
    spawn: (x, speed) => [makeObstacle('tower', x, { ...towerSizeFor(speed), ...PRACTICE })],
    actions: [
      { prompt: 'jump', ready: (gap, dog) => gap <= TUTORIAL_GAPS.tower.prompt && !dog.jumping, done: dog => dog.jumping },
      {
        prompt: 'jumpAgain',
        ready: (gap, dog) => dog.jumping && !dog.doubleJumped && dog.vy >= TUTORIAL_AGAIN_VY && gap <= TUTORIAL_GAPS.tower.apex,
        done: dog => dog.doubleJumped,
      },
    ],
  },
  {
    // The bird stack: no way over or through, so it has to be ducked.
    spawn: x => birdStack(x, PRACTICE),
    actions: [{ prompt: 'duck', ready: gap => gap <= TUTORIAL_GAPS.duck.prompt, done: dog => dog.ducking || dog.fastFalling }],
  },
];
export const TUTORIAL_STEP_COUNT = STEPS.length;

function beginStep(state, scene) {
  scene.action = 0;
  scene.prompt = null;
  scene.targets = STEPS[scene.step].spawn(W + 10, state.speed);
  state.obstacles.push(...scene.targets);
}

export const tutorialScene = {
  id: 'tutorial',
  quietPhases: ['teach', 'praise', 'retry'],  // the scene spawns its own field
  scoreless: true,
  // scene.prompt: the action being waited on ('jump' | 'jumpAgain' | 'duck'), or null
  initialData: () => ({ step: 0, action: 0, prompt: null, targets: [], until: 0 }),
  wantsTurn: state => state.tutorialPending,
  timeScale: scene => (scene.prompt ? TUTORIAL_SLOW_SCALE : 1),

  start(state, scene) {
    scene.phase = 'teach';
    scene.step = 0;
    state.score = 0;  // the run's first frames, before the scene took the slot
    beginStep(state, scene);
  },

  phases: {
    teach(state, scene, { now }) {
      const { dog } = state;
      const action = STEPS[scene.step].actions[scene.action];
      if (scene.prompt && action.done(dog)) {  // only an answer to the prompt counts
        scene.action++;
        scene.prompt = null;
      } else if (action) {
        scene.prompt = action.ready(gapAhead(state, scene.targets), dog) ? action.prompt : null;
      }

      if (scene.targets.some(o => o.hit)) {
        state.obstacles = state.obstacles.filter(o => !scene.targets.includes(o));
        scene.prompt = null;
        scene.until = now + TUTORIAL_RETRY_MS;
        return 'retry';
      }
      const dogBox = getDogHitbox(dog, false);
      if (scene.targets.every(o => { const box = getObstacleHitbox(o); return box.x + box.w < dogBox.x; })) {
        scene.until = now + TUTORIAL_PRAISE_MS;
        return 'praise';
      }
      return undefined;
    },

    praise(state, scene, { now, services }) {
      if (now < scene.until) return undefined;
      scene.step++;
      if (scene.step >= STEPS.length) {
        state.tutorialPending = false;
        services.tutorialSeen();
        state.nextObstacleIn = MIN_OBSTACLE_GAP;
        return 'done';
      }
      beginStep(state, scene);
      return 'teach';
    },

    retry(state, scene, { now }) {
      if (now < scene.until) return undefined;
      beginStep(state, scene);
      return 'teach';
    },
  },
};
