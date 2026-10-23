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
// Fast-fall (Down pressed mid-air): any rise is cut to at least this downward
// speed, and gravity is multiplied until landing or release. From the apex
// it lands in ~92ms instead of ~175ms.
export const FAST_FALL_VY = 4;
export const FAST_FALL_GRAVITY_MULT = 2.5;
export const RESTART_LOCKOUT_MS = 1000;   // input ignored this long after death
export const DEATH_SHAKE_MS = 250;
export const DEATH_SHAKE_PX = 6;

// Dog hitbox, relative to dog.x / dog.y (ducking is a lower, flatter box).
export const DOG_HITBOX_STAND = { dx: 23, dy: -8, w: 50, h: 22 };
export const DOG_HITBOX_DUCK = { dx: 23, dy: 10, w: 50, h: 8 };
// Running on the ground, a dachshund's back half sits well below its head
// (measured from the run frames: back line ~y+3..+6, head ~y-1). The rear
// `w` of the standing box starts at dog.y + dy instead, so standing up under
// a bird that's already past the head doesn't count as a hit.
export const DOG_HITBOX_RUN_REAR = { w: 16, dy: 3 };
// Speed is what difficulty follows (core/speed.js): a run's speed is a fixed
// function of its score and mode. Normal climbs from INITIAL_SPEED by
// SPEED_INCREMENT a point; hyper starts higher and climbs twice as fast.
// Both stop at MAX_SPEED, which every jump, duck, and scene is tested up to.
export const INITIAL_SPEED = 3.0;
export const MAX_SPEED = 6.75;     // normal reaches it at 7500, so speed keeps climbing into the frenzy (FRENZY_SPEED)
export const SPEED_INCREMENT = 0.0005;
export const SPEED_PROFILES = {
  normal: { start: INITIAL_SPEED, perPoint: SPEED_INCREMENT },
  hyper: { start: 4.0, perPoint: SPEED_INCREMENT * 2 },  // below the second boss's speed, so it still comes
};
export const MIN_OBSTACLE_GAP = 300;
export const MAX_OBSTACLE_GAP = 500;

// --- Bird obstacles (1.5× frisbee-tier sizing) ---
export const BIRD_W = 66;
export const BIRD_H = 51;
export const BONE_W = 25;     // a bone (hitbox = drawing): the tunnel's and the flight's
export const BONE_H = 10;
export const GIANT_BONE_W = 33;  // giant mode's, sized for the giant dog (keep both about 2.5:1, or the knobs swallow the shaft)
export const GIANT_BONE_H = 13;
export const BONE_POINTS = 25;   // a bone outside giant mode (giant mode pays its streak instead)
export const BIRD_LOW_Y = GROUND_Y - 49;   // solo bird and every wall's bottom row: duck height
// Bird walls (systems/birdWalls.js), measured by sweeping jump and double-jump
// timings against speed — re-sweep if jump physics or the bird hitbox change.
// The stack is a column with no gap a jump fits through and too tall to
// double-jump: it must be ducked.
export const BIRD_STACK_HIGH_Y = 48;       // stack top
export const BIRD_STACK_MID_Y = 100;       // stack middle: evenly spaced, filling the jump lane

// Chase acorn footprint (drawObstacle renders bird/frisbee obstacles as acorns).
// Solo chase aerials pin to CHASE_ACORN_Y so one acorn forces a duck. Wall
// low-row birds use the same duck height in chase (draw + hitbox); higher
// rows keep their own y with acorn-sized hitboxes.
export const ACORN_W = 36;
export const ACORN_H = 22;
export const CHASE_ACORN_Y = GROUND_Y - 20;   // drawn y: hitbox clips a standing dog, duck clears it

// Tower: a pile of bars too tall for one jump, so it takes a double jump.
// It grows with speed (measured by sweeping press timings): below
// TOWER_TALL_FROM_SPEED, 5 bars forgives an early or late second press
// (110-250ms windows) while a single jump only flukes it (16-42ms); 6 bars
// there demands a second press near the apex. From that speed on, 6 bars has
// the tolerance and a single jump can't clear it (17ms at a top speed of
// 6.5; raising it to 6.75 widened a single jump's window about 5%).
export const TOWER_BARS = { short: 5, tall: 6 };
export const TOWER_TALL_FROM_SPEED = 4.0;   // score ~2000

// --- Spawn patterns (close-gap sequences that punish jump-only play) ---
// The ease-in's scores (here, BIRD_WALL_FIRST_AT, SPAWN_MIX `after`, a
// pattern's minScore) are normal-run points at a speed (paceOf,
// core/speed.js): hyper, starting faster, starts past all of them.
export const PATTERN_FIRST_AT = 300;         // score before patterns can arm
// Per spawn cycle when eligible: ramps linearly from `start` at
// PATTERN_FIRST_AT to `full` at score `fullAt`, so the early game eases in.
export const PATTERN_CHANCE = { start: 0.05, full: 0.22, fullAt: 1500 };
export const PATTERN_CLOSE_GAP = 185;        // px between beats (~0.6s at mid speed)
export const BIRD_WALL_FIRST_AT = 180;     // score before bird stack solo spawns

// Solo spawn mix. One roll r is checked against each band in order (each
// gated by score); an aerial or frisbee pick then rolls again for its variant.
export const SPAWN_MIX = {
  tower: { after: 400, below: 0.15 },
  aerial: { below: 0.48 },                                     // from BIRD_WALL_FIRST_AT
  aerialSplit: { birdStack: 0.34, bird: 0.82 },  // rest: frisbee pair
  frisbee: { after: 80, below: 0.40 },
  frisbeeAsBird: 0.5,      // outside chase, a frisbee pick becomes a lone bird this often
  typeChangeGapMult: 1.5,  // extra breathing room when the obstacle type changes
};

// The game was tuned at 120Hz-equivalent dt units; update() scales by dt/DT_BASELINE.
export const DT_BASELINE = 1000 / 120;

// --- Scenes (chase, boss, trampoline) ---
// Minimum real time of normal gameplay between scenes, measured from one
// scene fully ending (last transition phase done) to the next one arming.
// Applies across scene types — each one's own score cooldown gates repeats
// of the same scene, this gates back-to-back scenes of any kind.
export const SCENE_MIN_GAP = 15000;  // ms

// --- Controls tutorial (systems/tutorial.js) ---
// Shown at the start of a run on a device's first visit, TUTORIAL_REFRESH_MS
// after it was last seen, or once TUTORIAL_VERSION is bumped (do that when
// the controls or the tutorial change — not on every deploy).
export const TUTORIAL_VERSION = 1;
export const TUTORIAL_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
export const TUTORIAL_SLOW_SCALE = 0.15;  // game speed while a prompt waits for the player
// Per step, the gap between dog and obstacle hitboxes (px) where its prompt
// appears and time slows, at the tutorial's run speed. Each window closes
// where the action stops clearing the obstacle, so a late press still fails.
export const TUTORIAL_GAPS = {
  jump: { prompt: 60 },   // a single jump clears the bar from 4..68 (~1s of slow-mo)
  // Then a second jump from the rise's last moments (vy >= TUTORIAL_AGAIN_VY),
  // but only if the tower is within `apex` by then: a first jump too early
  // can't make it, so it gets no prompt.
  tower: { prompt: 72, apex: 30 },   // first jump clears from 32..78 with the second
  duck: { prompt: 90 },   // ducking clears the bird wall from anywhere under 200
};
export const TUTORIAL_AGAIN_VY = -2;
export const TUTORIAL_PRAISE_MS = 900;    // "NICE!" between steps
export const TUTORIAL_RETRY_MS = 1100;    // "TRY AGAIN!" before a missed step repeats

// --- Chase mode ---
export const CHASE_FIRST_AT = 200;
export const CHASE_COOLDOWN = 700;
export const CHASE_DURATION_FRAMES = 16 * 60;  // 16 seconds at 60fps
export const SQUIRREL_OFFSET = 580;
export const SQUIRREL_RUN_SPEED = 1.5;       // px/frame when entering/escaping, accelerating…
export const SQUIRREL_RUN_ACCEL = 0.004;     // …by this per frame…
export const SQUIRREL_MAX_RUN_SPEED = 3.5;   // …up to this
export const SQUIRREL_OFFSCREEN_PAD = 80;    // enter from / escape to this far past the right edge

// --- Boss chase ---
export const BOSS_SPEEDS = [3.5, 4.5];  // the speeds that bring a boss (normal: 1000, 3000); the frenzy's comes at FRENZY_SPEED
export const DOG_BASE_X = 60;                      // dog's normal resting x position
export const BOSS_MAX_DOG_SHIFT = 150;             // max rightward shift during boss (px)
export const BOSS_DOG_SHIFT_SPEED = 0.75;          // px/frame ramp-up when chasing (~3.3s to max)
export const BOSS_DOG_RETURN_SPEED = 1.5;          // px/frame ramp-down when losing (~1.7s to return)
export const BOSS_SQUIRREL_START_X = -20;
export const BOSS_SQUIRREL_LOSE_SPEED = 3.0;       // px/frame when losing (retreating left)
export const BOSS_CHASE_DURATION = 1600;           // frames total (~26.7s): fixed duration regardless of speed
export const BOSS_SPEED_MULTIPLIER = 1.25;         // max speed multiplier during boss
export const BOSS_OBSTACLE_GAP_MULTIPLIER = 1.5;   // fewer obstacles (larger gaps)
export const BOSS_APPROACH_FRAC = 0.15;            // share of the chase spent closing in (speed ramps up over it too)
export const BOSS_RETREAT_FRAC = 0.10;             // share spent falling back at the end
export const BOSS_TAIL_GAP = 70;                   // px between squirrel and dog at peak approach
export const BOSS_EXIT_PAD = 60;                   // px past its start x before the retreating squirrel is gone
export const BOSS_SQUIRREL_SCALE = 2.5;            // drawn size vs the chase squirrel

// --- Giant mode ---
export const GIANT_FIRST_AT = 500;                  // golden hot dog can't appear before this score
export const GIANT_COOLDOWN = 300;                  // score from a golden's spawn, or its giant mode's end, to the next
export const GIANT_SPAWN_CHANCE = 0.02;             // chance per obstacle spawn cycle when eligible (at most one per gap between scenes;
                                                    // 2% gives about as many giant modes per run as each scene gets)
export const GIANT_DURATION = 15000;                // ms (15 seconds — matches giant music track)
export const GIANT_WARN_AT = 2500;                  // ms remaining before flashing warning
export const GIANT_SCALE = 2.0;                     // visual scale multiplier for the dog
export const GIANT_PIVOT_Y = GROUND_Y + 24;         // the giant dog grows about this height (its feet), drawn and hitbox alike
export const GIANT_SCALE_TRANSITION = 500;          // ms for grow/shrink animation
export const GIANT_SCORE_MULTIPLIER = 2;            // score multiplier while giant
export const GIANT_EAT_BONUS = 25;                  // bonus points per obstacle eaten (hot dogs, towers)
export const GIANT_BONE_POINTS = 10;                // a bone, times the streak level
export const GIANT_STREAK_MAX = 3;                  // the streak level caps here: bones in a row pay 10, 20, 30, 30…
export const GIANT_FEAST_MS = 2200;                 // the end-of-giant-mode tally

// The bone round (systems/giantBones.js): while the dog is giant, normal
// spawning stops and random bone patterns come one after another, a hot dog
// in each gap between them.
export const GIANT_ROUND = { arc: 3, run: 2, bobber: 2 };  // the patterns in one round, shuffled (never one twice running):
                                                    // a fixed mix keeps every round's bones (23) and pace the same
export const GIANT_PATTERN_GAP_FRAMES = 180;        // baseline frames from one pattern's end to the next one's start (~1.5s to land and get ready)
export const GIANT_PATTERNS_STOP_MS = 3000;         // no new pattern this close to the end: the field clears before the shrink
export const GIANT_ARC_BONES = 5;                   // bones along a jump's path; one jump timed right takes them all
export const GIANT_RUN_BONES = 3;                   // bones in a line at running height
export const GIANT_RUN_BONE_FRAMES = 22;            // baseline frames between them
export const GIANT_BOB = { amp: 40, period: 110 };  // the bobbing bone: px up and down, baseline frames per cycle
export const GIANT_END_INVULN = 1500;               // ms of invulnerability after giant mode ends
export const BIRD_JUMP_BONUS = 50;                  // bonus points for jumping over a bird
// Hyper only: a chocolate bar or lone bird cleared with a single jump (systems/cleanJump.js),
// from hyper's starting speed down to MAX_SPEED, times the streak level
// (clean jumps in a row: 25, 50, 75… at the start, capped at CLEAN_STREAK_MAX).
export const CLEAN_JUMP_POINTS = { atStart: 25, atTop: 5 };
export const CLEAN_STREAK_MAX = 5;

// --- Effect lifetimes (ms) ---
export const CHOMP_EFFECT_MS = 500;
export const BITE_ANIM_MS = 250;        // dog bite pose after a chomp
export const BONK_EFFECT_MS = 1500;     // knocked-away obstacle tumbling off
export const BONK_TEXT_MS = 600;        // BONK! label (first part of the tumble)
export const SCORE_POPUP_MS = 800;      // bird-jump / trampoline bonus text

// --- Trampoline scene ---
// First scene at 800 → speed 3.4, inside the s >= 3.35 band where the layout
// invariant guarantees the bounce alone clears the exit thorns (see the
// leading-edge assertion in tests/trampoline.test.js). Don't lower it below
// (3.35 - INITIAL_SPEED) / SPEED_INCREMENT without re-checking that band.
export const TRAMP_FIRST_AT = 800;        // score before the first scene can arm
export const TRAMP_COOLDOWN = 600;        // score between scenes (from lastTrampEndScore)
export const TRAMP_BOUNCES = 3;           // reps per scene
export const TRAMP_BOUNCE_VY = -14;       // super-bounce launch velocity (see physics table)
export const TRAMP_BOUNCE_BONUS = 50;     // points per clean bounce
export const TRAMP_BREATHER = 120;        // baseline frames of empty field between reps (~1s)
export const TRAMP_TILE_W = 32;           // thorn tile width
export const TRAMP_HITBOX_PAD = 12;       // horizontal forgiveness on the trampoline surface (both sides)
export const TRAMP_SQUASH_MS = 250;       // trampoline squash animation after a bounce
// exitFactor 26 keeps the exit (ceil'd to whole 32px tiles) narrow enough for
// the bounce alone to clear; the double-jump reset is only a correction for
// mistimed landings, never a requirement.
//
// A rep with `heart` floats a heart pickup leadFactor * speed past the
// island's left edge (a fixed time after the bounce), at height y: just above
// the bounce's apex, so only a second jump pressed near that apex reaches it.
// Measured by sweeping landing spots and press timings at 60/120/144Hz: from
// every landing spot the press window is ~100ms at worst, ~150ms typically.
// Re-sweep if jump physics, TRAMP_BOUNCE_VY, or the hitboxes change.
export const TRAMP_REPS = [
  { islandOffsetFactor: 22, trampWidth: 84, exitFactor: 26 },  // rep 0: close, wide
  { islandOffsetFactor: 26, trampWidth: 78, exitFactor: 26 },  // rep 1
  { islandOffsetFactor: 30, trampWidth: 72, exitFactor: 26, heart: { leadFactor: 48, y: -37 } },  // rep 2: deep, still landable
];

// --- Tunnel scene ---
// A tunnel under the path with a hole every TUNNEL_BEAT_FRAMES * speed px,
// so holes come a fixed time apart at any speed (90 frames was too quick for
// kids). Each layout is a sequence of stretches, one per gap between holes
// (TUNNEL_STRETCHES in systems/tunnel.js says what fills each one); a scene
// plays one layout, never the same as the scene before.
export const TUNNEL_FIRST_AT = 500;      // score before the first scene can arm
export const TUNNEL_COOLDOWN = 700;      // score between scenes (from its lastEndScore)
export const TUNNEL_BEAT_FRAMES = 130;   // baseline frames between holes (~1.1s)
export const TUNNEL_HOLE_W = 56;
export const TUNNEL_HOLE_SLACK = 10;     // px of forgiveness either side of a hole
export const TUNNEL_DEPTH = 25;          // how far below the path the dog crawls (inside the drawn bore)
export const TUNNEL_POP_VY = -6;         // the hop out of a hole when duck is let go
export const TUNNEL_DIVE_MS = 140;       // the dog sliding into / out of a hole (drawing only)
export const TUNNEL_CAMERA_DROP = 20;    // the camera dips this far while the tunnel's ahead, lifting it clear of phone toolbars and home bars
export const TUNNEL_CAMERA_SPEED = 0.35; // camera dip per frame, down and back
export const TUNNEL_LAYOUTS = [
  ['hedge', 'boneBar', 'rock', 'hedge', 'bird', 'rockThenBar'],
  ['hedge', 'hedge', 'rock', 'boneBar', 'hedge', 'rock'],
  ['hedge', 'bird', 'hedge', 'rock', 'rock', 'boneBar', 'hedge', 'rockThenBar'],
];

// --- Flight scene ---
// A Hero Cape floats in at running height; grabbing it flies the dog up to
// the middle of FLIGHT_LANES while the camera pans up, and a row of bird
// gates comes through, one every FLIGHT_GATE_BEAT_FRAMES at any speed. Each
// gate leaves at least one lane open. A missed cape tries again after half
// the cooldown.
export const FLIGHT_FIRST_AT = 600;        // score before the first scene can arm
export const FLIGHT_COOLDOWN = 800;        // score between scenes (from its lastEndScore)
export const FLIGHT_LANES = [-105, -40, 25];  // dog.y of each lane, top to bottom
export const FLIGHT_HUD_BAND = 70;         // screen top the HUD covers; the camera centers the lanes below it
export const FLIGHT_RISE_FRAMES = 120;     // the climb (and camera pan) up to the middle lane
export const FLIGHT_LAND_FRAMES = 120;     // the glide back down to the path
export const FLIGHT_GLIDE_PER_FRAME = 6;   // lane change speed
export const FLIGHT_GATES = 14;
export const FLIGHT_GATE_BEAT_FRAMES = 95; // baseline frames between gates (~0.8s)
export const FLIGHT_EASY_GATES = 3;        // the first gates block one lane, the rest two
export const FLIGHT_BONE_CHANCE = 0.5;     // a bone in a gate's open lane
export const FLIGHT_CALL_MS = 1200;        // "SUPER DOG!" on grabbing the cape
export const CAPE_AWAY_MS = 1100;          // the cape flying off after the landing

// --- Weather ---
export const RAIN_CHANCE = 0.25;   // rolled at each dawn→day and sunset→night change
export const RAIN_DROPS = 120;

// --- Music (systems/soundtrack.js) ---
export const MUSIC_FADE_MS = 1200;   // a track fades out over this, then the next fades in over it (giant mode cuts in at once)
export const TAPE_STOP_MS = 650;     // into the frenzy, the old track winds down over this...
export const DROP_SILENCE_MS = 900;  // ...then this silence (the drop's boom rings through it)

// --- Frenzy (systems/frenzy.js) ---
export const FRENZY_SPEED = 5.5;       // the speed from which the frenzy starts (normal: 5000), and with it its music and the score's fire
export const FRENZY_DROP_MS = 2200;    // the drop's banner; its flash, shockwave, and shake are shorter
export const FRENZY_SHAKE_MS = 600;
export const FRENZY_SHAKE_PX = 5;
export const FRENZY_DROP_CALM = 400;   // px of travel before the next spawn after the drop clears the field
export const HYPER_UNLOCKED_MS = 3200;   // the HYPER MODE UNLOCKED! popup (systems/hyper.js)
export const BURST_MS = 750;         // a hazard's rainbow burst

// --- Biomes (render/biomes.js; cosmetic) ---
export const BIOME_CYCLES = 2;  // day cycles (700 pts each) per biome; the next takes over during the last night

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
// Hyper mode's board and hearts: played with VERY EASY's hearts (fewer is
// brutal at its speed), on a board of its own. Its label goes in a score's
// `difficulty` field like any difficulty's (firestore.rules allows it).
export const HYPER_LEVEL = { label: 'HYPER', hearts: DIFFICULTY_LEVELS[0].hearts };
export const DEFAULT_DIFFICULTY_INDEX = 0;          // VERY EASY (the slider's start; keep index.html's initial text in sync)
export const HEART_HIT_INVULN = 1500;               // ms of invulnerability after losing a heart
export const HEART_FLASH_MS = 800;                  // ms a just-lost or just-regained heart blinks in the HUD
export const HEART_FULL_BONUS = 100;                // points for a heart pickup with every heart already full

// --- Dog sprite animation (PNG from png/dachshund) ---
export const DOG_SPRITE_FPS = 12;   // 10-14 range: lower = choppier, higher = smoother
export const DOG_SPRITE_SCALE = 70 / 512;   // dachshund_run_* are 512x1024
export const DOG_SPRITE_ANCHOR = 0.5;       // bottom-center: 0.5 = center X
export const DOG_SPRITE_GROUND_OFFSET = 85; // sprite has padding below feet; shift down so feet land on ground
export const COSMETICS_PREVIEW_SCALE = 2;   // preview dog size vs in-game (2 = golden-hot-dog giant size)

// --- Bird sprite animation (PNG from png/bird, via tools/gen-bird-frames.sh) ---
export const BIRD_SPRITE_FPS = 12;
export const BIRD_SPRITE_W = 60;           // drawn width in logical px
export const BIRD_SPRITE_FEET_FRAC = 0.738; // feet baseline as a fraction of frame height (from the generator crop)

// --- Squirrel sprite animation (PNG from png/squirrel) ---
export const SQUIRREL_SPRITE_FPS = 12;
export const SQUIRREL_SPRITE_SCALE = 50 / 512;   // squirrel_run_* are 512x1024
export const SQUIRREL_SPRITE_ANCHOR = 0.5;       // bottom-center
export const SQUIRREL_SPRITE_GROUND_OFFSET = 60; // sprite padding; lower = squirrel higher on ground

// --- High scores (localStorage) ---
export const HIGH_SCORES_KEY = 'dachshundDashHighScores';
export const MAX_HIGH_SCORES = 5;
export const HYPER_MODE_KEY = 'dachshundDashHyper';  // the start overlay's HYPER switch, remembered on the device
export const PLAYER_NAME_KEY = 'dachshundDashPlayerName';  // the last name saved with a global score (prefills the prompt)

// --- Equipped cosmetics (localStorage) ---
export const EQUIPPED_COSMETICS_KEY = 'dachshundDashEquippedCosmetics';

// --- Global high scores (Firebase) ---
// Firestore's free tier bills every document read and write, so the board is
// kept small and touched rarely: a board fetch reads at most GLOBAL_MAX_SCORES
// docs, a saved score is one write that updates the cached board in place,
// and the session board is refetched only when a run ends and it's older
// than GLOBAL_REFRESH_MS (never while the game sits idle).
export const GLOBAL_MAX_SCORES = 25;              // per difficulty
export const GLOBAL_PAGE_SIZE = 10;
export const GLOBAL_REFRESH_MS = 10 * 60 * 1000;
