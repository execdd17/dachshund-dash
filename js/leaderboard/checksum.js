// Simple non-cryptographic checksum (DJB2-style hash, salted) attached to
// global score submissions as a basic tamper deterrent. This is not real
// security, just friction against casual score-editing.

export function computeScoreChecksum(name, scoreVal, timestamp, difficulty = '') {
  const salt = 'dachshund-dash-2024-pepper';
  const raw = salt + '|' + name + '|' + scoreVal + '|' + timestamp + '|' + difficulty;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return hash.toString(36);
}
