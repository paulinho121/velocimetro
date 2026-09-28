/**
 * Spoken directions through the browser's own speech engine: no network, no
 * key, and it works offline on Android and iOS. Silently does nothing where
 * the browser has no speech support.
 */

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

/** A Brazilian voice when there is one, else any Portuguese one. */
function pickVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = s.getVoices();
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'pt-br') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null
  );
}

/**
 * Says `text`. `interrupt` cuts off whatever is being said: a direction for
 * the turn right ahead must not wait behind a stale one.
 *
 * iOS only lets a page speak after a tap has spoken first, so the first call
 * must come from a tap handler (starting navigation does).
 */
export function speak(text: string, { interrupt = false } = {}) {
  const s = synth();
  if (!s || !text) return;
  try {
    if (interrupt) s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const voice = pickVoice(s);
    if (voice) u.voice = voice;
    u.rate = 1.05;
    s.speak(u);
  } catch {
    /* speech is a nicety, never a hard failure */
  }
}

export function stopSpeaking() {
  try {
    synth()?.cancel();
  } catch {
    /* ignore */
  }
}
