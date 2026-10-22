// Tunnel scene: a tunnel under the path, entered and left through a row of
// holes (systems/burrow.js moves the dog). Each stretch between two holes
// either needs one layer — a hedge too tall to jump blocks the surface, a
// rock blocks the tunnel — or leaves the choice open: the tunnel is safe and
// empty, the surface pays bones or a bird bonus for a jump.
//   pending → active

import {
  W, MIN_OBSTACLE_GAP, BIRD_LOW_Y,
  TUNNEL_FIRST_AT, TUNNEL_COOLDOWN, TUNNEL_BEAT_FRAMES, TUNNEL_HOLE_W, TUNNEL_LAYOUTS,
  TUNNEL_CAMERA_DROP, TUNNEL_CAMERA_SPEED,
} from '../config.js';
import { makeObstacle } from './obstacleTypes.js';
import { stepBurrow } from './burrow.js';
import { sceneMemory, scoreCooldownTrigger } from './encounters.js';

// What fills each stretch, placed by how far across it is (0 = the hole
// before, 1 = the hole after). `needs` is the layer that gets through it, or
// null when either does.
export const TUNNEL_STRETCHES = {
  hedge: { needs: 'underground', obstacles: [[0.5, 'hedge']] },
  rock: { needs: 'surface', obstacles: [[0.5, 'rock'], [0.5, 'rockSign']] },
  rockThenBar: { needs: 'surface', obstacles: [[0.5, 'rock'], [0.5, 'rockSign'], [0.85, 'hotdog']] },
  boneBar: { needs: null, obstacles: [[0.35, 'bone'], [0.5, 'hotdog'], [0.65, 'bone']] },
  bird: { needs: null, obstacles: [[0.5, 'bird', { y: BIRD_LOW_Y }]] },
};

// The camera dips while any of the tunnel is still ahead of the dog, so the
// bore sits clear of the screen's bottom edge, and comes back up once it's past.
function stepCamera(state, scene, scale) {
  const ahead = state.obstacles.some(o => o.type === 'tunnel' && o.x + o.width > state.dog.x);
  const target = ahead ? -TUNNEL_CAMERA_DROP : 0;
  const step = TUNNEL_CAMERA_SPEED * scale;
  scene.lift += Math.max(-step, Math.min(step, target - scene.lift));
}

// Any layout but the one the last scene played.
function pickLayout(memory, rng) {
  const choices = TUNNEL_LAYOUTS.map((_, i) => i).filter(i => i !== memory.lastLayout);
  memory.lastLayout = choices[Math.floor(rng() * choices.length)];
  return TUNNEL_LAYOUTS[memory.lastLayout];
}

// The tunnel, a hole at both ends of every stretch, and each stretch's
// obstacles, centered on their spots. The tunnel goes first so it draws under the rest.
export function spawnTunnel(state, layout) {
  const beat = TUNNEL_BEAT_FRAMES * state.speed;
  const holeCenterX = at => W + 10 + TUNNEL_HOLE_W / 2 + at * beat;
  const centeredAt = (obs, x) => Object.assign(obs, { x: x - obs.width / 2 });

  state.obstacles.push(makeObstacle('tunnel', W + 10, { width: layout.length * beat + TUNNEL_HOLE_W }));
  for (let i = 0; i <= layout.length; i++) {
    state.obstacles.push(centeredAt(makeObstacle('tunnelHole', 0, { holeIndex: i, used: false }), holeCenterX(i)));
  }
  layout.forEach((stretch, i) => {
    for (const [at, type, overrides] of TUNNEL_STRETCHES[stretch].obstacles) {
      state.obstacles.push(centeredAt(makeObstacle(type, 0, overrides), holeCenterX(i + at)));
    }
  });
}

export const tunnelScene = {
  id: 'tunnel',
  skipsFrenzy: true,  // ducking into a tunnel doesn't fit the frenzy
  quietPhases: ['active'],  // the scene spawns its own field
  initialData: () => ({ lift: 0 }),
  wantsTurn: (state, memory) => scoreCooldownTrigger(state, memory, TUNNEL_FIRST_AT, TUNNEL_COOLDOWN),

  start(state, scene, { rng }) {
    scene.phase = 'active';
    spawnTunnel(state, pickLayout(sceneMemory(state, 'tunnel'), rng));
  },

  phases: {
    // Runs until every piece of the tunnel has scrolled off and the camera is back.
    active(state, scene, { scale, services, now }) {
      stepBurrow(state, services, now);
      if (state.dog.underground) state.tunnelHintPending = false;
      stepCamera(state, scene, scale);
      if (state.obstacles.length > 0 || scene.lift !== 0) return undefined;
      sceneMemory(state, 'tunnel').lastEndScore = state.score;
      state.nextObstacleIn = MIN_OBSTACLE_GAP;
      return 'done';
    },
  },
};
