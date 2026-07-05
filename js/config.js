// All game tuning constants. Pure data — safe to import from any module,
// including Node-based tests.

// --- Logical canvas size (before 2x scale) ---
export const W = 800;
export const H = 250;

// --- Mobile input ---
export const DUCK_ZONE_RATIO = 0.4; // left 40% of screen = duck zone

// --- Core run ---
export const GROUND_Y = 200;
export const GRAVITY = 0.5;
export const JUMP_FORCE = -11;
export const DOUBLE_JUMP_FORCE = -7;
export const INITIAL_SPEED = 2.85;
export const MAX_SPEED = 20.25;
export const SPEED_INCREMENT = 0.001;
export const MIN_OBSTACLE_GAP = 300;
export const MAX_OBSTACLE_GAP = 500;

// The game was tuned at 120Hz-equivalent dt units; update() scales by dt/DT_BASELINE.
export const DT_BASELINE = 1000 / 120;

// --- Chase mode ---
export const CHASE_FIRST_AT = 200;
export const CHASE_COOLDOWN = 300;
export const CHASE_DURATION_FRAMES = 16 * 60;  // 16 seconds at 60fps
export const SQUIRREL_OFFSET = 580;

// --- Boss chase ---
export const BOSS_MILESTONE = 1000;
export const DOG_BASE_X = 60;                      // dog's normal resting x position
export const BOSS_MAX_DOG_SHIFT = 150;             // max rightward shift during boss (px)
export const BOSS_DOG_SHIFT_SPEED = 0.75;          // px/frame ramp-up when chasing (~3.3s to max)
export const BOSS_DOG_RETURN_SPEED = 1.5;          // px/frame ramp-down when losing (~1.7s to return)
export const BOSS_SQUIRREL_START_X = -20;
export const BOSS_SQUIRREL_LOSE_SPEED = 3.0;       // px/frame when losing (retreating left)
export const BOSS_CHASE_DURATION = 1600;           // frames total (~26.7s): fixed duration regardless of speed
export const BOSS_SPEED_MULTIPLIER = 1.25;         // max speed multiplier during boss
export const BOSS_OBSTACLE_GAP_MULTIPLIER = 1.5;   // fewer obstacles (larger gaps)

// --- Giant mode ---
export const GIANT_FIRST_AT = 500;                  // golden hot dog can't appear before this score
export const GIANT_COOLDOWN = 600;                  // minimum score between golden hot dog spawns
export const GIANT_SPAWN_CHANCE = 0.03;             // 3% chance per obstacle spawn cycle when eligible
export const GIANT_DURATION = 15000;                // ms (15 seconds — matches giant music track)
export const GIANT_WARN_AT = 2500;                  // ms remaining before flashing warning
export const GIANT_SCALE = 2.0;                     // visual scale multiplier for the dog
export const GIANT_SCALE_TRANSITION = 500;          // ms for grow/shrink animation
export const GIANT_SCORE_MULTIPLIER = 2;            // score multiplier while giant
export const GIANT_EAT_BONUS = 25;                  // bonus points per obstacle eaten
export const GIANT_BONK_BONUS = 15;                 // bonus points per frisbee bonked
export const GIANT_END_INVULN = 1500;               // ms of invulnerability after giant mode ends (matches HEART_HIT_INVULN)
export const BIRD_JUMP_BONUS = 50;                  // bonus points for jumping over a bird

// --- Hearts (extra lives) ---
// Difficulty is picked once on the start overlay (slider index into this
// list) and only changes how many hearts a run starts with. Locked for the
// session — reload the page to change it.
export const DIFFICULTY_LEVELS = [
  { label: 'VERY EASY', hearts: 6 },
  { label: 'EASY',      hearts: 4 },
  { label: 'NORMAL',    hearts: 3 },
  { label: 'HARD',      hearts: 2 },
  { label: 'VERY HARD', hearts: 1 },
];
export const DEFAULT_DIFFICULTY_INDEX = 2;          // NORMAL
export const HEART_HIT_INVULN = 1500;               // ms of invulnerability after losing a heart
export const HEART_LOSS_FLASH = 800;                // ms the just-lost heart blinks in the HUD

// --- Dog sprite animation (PNG from png/dachshund) ---
export const DOG_SPRITE_FPS = 12;   // 10-14 range: lower = choppier, higher = smoother
export const DOG_SPRITE_SCALE = 70 / 512;   // dachshund_run_* are 512x1024
export const DOG_SPRITE_ANCHOR = 0.5;       // bottom-center: 0.5 = center X
export const DOG_SPRITE_GROUND_OFFSET = 85; // sprite has padding below feet; shift down so feet land on ground
export const COSMETICS_PREVIEW_SCALE = 2;   // preview dog size vs in-game (2 = golden-hot-dog giant size)

// --- Squirrel sprite animation (PNG from png/squirrel) ---
export const SQUIRREL_SPRITE_FPS = 12;
export const SQUIRREL_SPRITE_SCALE = 50 / 512;   // squirrel_run_* are 512x1024
export const SQUIRREL_SPRITE_ANCHOR = 0.5;       // bottom-center
export const SQUIRREL_SPRITE_GROUND_OFFSET = 60; // sprite padding; lower = squirrel higher on ground

// --- High scores (localStorage) ---
export const HIGH_SCORES_KEY = 'dachshundDashHighScores';
export const MAX_HIGH_SCORES = 5;

// --- Equipped cosmetics (localStorage) ---
export const EQUIPPED_COSMETICS_KEY = 'dachshundDashEquippedCosmetics';

// --- Global high scores (Firebase) ---
export const GLOBAL_MAX_SCORES = 100;
export const GLOBAL_PAGE_SIZE = 10;
export const GLOBAL_FETCH_INTERVAL = 30000;
