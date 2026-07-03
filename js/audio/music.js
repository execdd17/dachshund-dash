// Music playback: a normal soundtrack plus a separate EDM track during giant
// mode. Browser-only module (uses HTMLAudioElement); gameplay systems depend
// on the returned interface only — tests pass createSilentMusic().

export function createMusic() {
  let musicOn = true;
  let musicStarted = false;
  let giantMusicActive = false;

  const musicNormal = new Audio('sound/who_let_the_dogs_out_soul_version.wav');
  musicNormal.loop = true;
  musicNormal.volume = 0.30;
  const musicGiant = new Audio('sound/who_let_the_dogs_out_edm_short.mp3');
  musicGiant.loop = true;
  musicGiant.volume = 0.25;

  function getActiveMusic() {
    return giantMusicActive ? musicGiant : musicNormal;
  }

  // Browsers block autoplay — start music on first user interaction
  function startOnInteraction() {
    if (musicStarted) return;
    musicStarted = true;
    if (musicOn) {
      getActiveMusic().play().catch(() => {});
    }
    document.removeEventListener('click', startOnInteraction);
    document.removeEventListener('keydown', startOnInteraction);
    document.removeEventListener('touchstart', startOnInteraction);
  }

  function attachAutoplayUnlock() {
    document.addEventListener('click', startOnInteraction);
    document.addEventListener('keydown', startOnInteraction);
    document.addEventListener('touchstart', startOnInteraction);
  }

  function toggle() {
    if (musicOn) {
      musicOn = false;
      musicNormal.pause();
      musicGiant.pause();
    } else {
      musicOn = true;
      getActiveMusic().play().catch(() => {});
    }
  }

  function switchToGiant() {
    giantMusicActive = true;
    if (musicOn) {
      musicNormal.pause();
      musicGiant.currentTime = 0;
      musicGiant.play().catch(() => {});
    }
  }

  function switchToNormal() {
    giantMusicActive = false;
    if (musicOn) {
      musicGiant.pause();
      musicNormal.currentTime = musicGiant.currentTime % (musicNormal.duration || 1);
      musicNormal.play().catch(() => {});
    }
  }

  // Used on death/restart: drop back to the normal track if giant music is
  // playing, and clear the giant flag either way.
  function resetToNormal() {
    if (giantMusicActive && musicOn) switchToNormal();
    giantMusicActive = false;
  }

  return {
    isOn: () => musicOn,
    isGiantActive: () => giantMusicActive,
    attachAutoplayUnlock,
    toggle,
    switchToGiant,
    switchToNormal,
    resetToNormal,
  };
}

// No-op implementation of the same interface, for tests.
export function createSilentMusic() {
  let giantMusicActive = false;
  return {
    isOn: () => false,
    isGiantActive: () => giantMusicActive,
    attachAutoplayUnlock: () => {},
    toggle: () => {},
    switchToGiant: () => { giantMusicActive = true; },
    switchToNormal: () => { giantMusicActive = false; },
    resetToNormal: () => { giantMusicActive = false; },
  };
}
