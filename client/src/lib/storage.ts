const KEY_NAME = "fraud.playerName";
const KEY_ID = "fraud.clientPlayerId";
const KEY_AVATAR = "fraud.avatarDataUrl";

export function getOrCreateClientPlayerId(): string {
  const existing = localStorage.getItem(KEY_ID);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(KEY_ID, id);
  return id;
}

export function getStoredPlayerName(): string | null {
  const v = localStorage.getItem(KEY_NAME);
  return v && v.trim() ? v : null;
}

export function setStoredPlayerName(name: string) {
  localStorage.setItem(KEY_NAME, name);
}

export function getStoredAvatarDataUrl(): string | null {
  const v = localStorage.getItem(KEY_AVATAR);
  return v && v.trim() ? v : null;
}

export function setStoredAvatarDataUrl(dataUrl: string | null) {
  if (!dataUrl) localStorage.removeItem(KEY_AVATAR);
  else localStorage.setItem(KEY_AVATAR, dataUrl);
}

