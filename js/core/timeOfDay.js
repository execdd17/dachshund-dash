// Time-of-day cycle, driven purely by score (repeats every 700 pts).
// Day 0-250, sunset 250-350 (100 pts: day→night), night 350-600 (250 pts),
// dawn 600-700 (100 pts: night→day), then repeat.

export function getTimeOfDay(score) {
  const CYCLE = 700;
  const s = score % CYCLE;
  const DAY_END = 250;
  const SUNSET_END = 350;   // 100 pts: day→night
  const NIGHT_END = 600;    // 250 pts of night
  const DAWN_END = 700;     // 100 pts: night→day
  let phase, stage, t;
  if (s < DAY_END) {
    stage = 'day';
    phase = 0;
    t = s / DAY_END;
  } else if (s < SUNSET_END) {
    stage = 'sunset';
    phase = (s - DAY_END) / (SUNSET_END - DAY_END) * 0.5;  // 0→0.5 = full night
    t = (s - DAY_END) / (SUNSET_END - DAY_END);
  } else if (s < NIGHT_END) {
    stage = 'night';
    phase = 0.5;
    t = (s - SUNSET_END) / (NIGHT_END - SUNSET_END);
  } else {
    stage = 'dawn';
    phase = 0.5 + (s - NIGHT_END) / (DAWN_END - NIGHT_END) * 0.5;  // 0.5→1 = day
    t = (s - NIGHT_END) / (DAWN_END - NIGHT_END);
  }
  return { phase, stage, t };
}
