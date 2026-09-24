const STORAGE_KEY = 'nexus-state-v1';

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return null;
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('nexus-state-updated'));
}

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function removeRepeatedNpcMessages() {
  const state = readState();
  if (!state?.chats || !state.activeChatId) return;
  let changed = false;
  const chats = state.chats.map((chat) => {
    if (chat.id !== state.activeChatId || !Array.isArray(chat.messages)) return chat;
    const seenInTurn = new Set();
    const messages = chat.messages.filter((message) => {
      if (message.author === 'user') {
        seenInTurn.clear();
        return true;
      }
      const key = normalise(message.text);
      if (!key) return true;
      if (seenInTurn.has(key)) {
        changed = true;
        return false;
      }
      seenInTurn.add(key);
      return true;
    });
    return changed ? { ...chat, messages } : chat;
  });
  if (changed) writeState({ ...state, chats });
}

// Defensive client-side guard for group chats: the old renderer reused one
// generated answer for every NPC. Repeated identical NPC turns are removed
// from persistence and from the visible conversation, while the first answer
// remains intact. This does not touch user messages or different turns.
window.setInterval(removeRepeatedNpcMessages, 900);
export { removeRepeatedNpcMessages };
