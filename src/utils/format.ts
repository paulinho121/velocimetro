export function formatTime(ms: number): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    return `${h}:${m}:${s}`;
  }
  return `${m}:${s}`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR');
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR');
}
