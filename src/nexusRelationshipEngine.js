const STORAGE_KEY = 'nexus-state-v1';
const BATCH_SIZE = 4;

const readState = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value) => Math.max(-100, Math.min(100, Number(value) || 0));

function statusFor(affinity) {
  if (affinity >= 80) return 'Lealtad incondicional';
  if (affinity >= 60) return 'Confianza sólida';
  if (affinity >= 20) return 'Afinidad creciente';
  if (affinity <= -80) return 'Enemistad jurada';
  if (affinity <= -60) return 'Rivalidad latente';
  if (affinity <= -20) return 'Desconfianza';
  return 'Neutral';
}

function relationSignal(text) {
  const value = String(text || '').toLowerCase();
  let score = 0;
  if (/ayud|salv|prote|apoy|graci|perdon|conf[ií]a|promet|cumpl/.test(value)) score += 2;
  if (/amistad|afecto|amor|cari[nñ]o|lealtad|compart/.test(value)) score += 2;
  if (/amenaz|mentir|traici|enga[nñ]|odio|atac|golpe|viol|insult/.test(value)) score -= 3;
  if (/rival|enemig|discusi|desconf|rechaz|secreto/.test(value)) score -= 1;
  return Math.max(-4, Math.min(4, score));
}

function ensureRelation(owner, targetId) {
  owner.relations = owner.relations || {};
  return owner.relations[targetId] || { affinity: 0, status: 'Neutral', notes: '', history: [] };
}

function applyRelation(owner, targetId, delta, reason) {
  if (!owner || !targetId || !delta) return;
  const previous = ensureRelation(owner, targetId);
  const affinity = clamp(previous.affinity + delta);
  owner.relations[targetId] = {
    ...previous,
    affinity,
    status: statusFor(affinity),
    notes: previous.notes || 'Relación evolucionada automáticamente; editable por el usuario.',
    history: [{ id: uid('rel-auto'), delta, reason, timestamp: new Date().toISOString(), affinity, status: statusFor(affinity) }, ...(previous.history || [])].slice(0, 50)
  };
}

function ensureStartingRelations(state) {
  state.playerProfile = state.playerProfile || {};
  state.playerProfile.relations = state.playerProfile.relations || {};
  state.characters = state.characters || [];
  for (const source of state.characters) {
    source.relations = source.relations || {};
    for (const target of state.characters) {
      if (source.id !== target.id) ensureRelation(source, target.id);
    }
    ensureRelation(source, 'player');
    ensureRelation(state.playerProfile, source.id);
  }
}

function addMemory(character, text, chatId) {
  if (!character || !text || !/promet|revel|secret|confes|atac|herid|amenaz|ayud|salv|entreg|perd[ií]|decid/.test(text.toLowerCase())) return;
  character.memories = character.memories || [];
  if (character.memories.some((memory) => memory.summary === text)) return;
  character.memories.unshift({ id: uid('mem-auto'), summary: text.slice(0, 240), category: /promet/.test(text.toLowerCase()) ? 'promesa' : /atac|herid/.test(text.toLowerCase()) ? 'combate' : 'hecho_historico', relevance: 7, pinned: false, notes: 'Actualización automática cada 4 mensajes', sourceChatId: chatId, createdAt: new Date().toISOString() });
}

function processChat(state, chat) {
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  const cursor = Number.isInteger(chat.relationshipCursor) ? chat.relationshipCursor : 0;
  if (messages.length - cursor < BATCH_SIZE) return false;
  const fresh = messages.slice(cursor);
  const text = fresh.map((message) => message.text || '').join(' ');
  const signal = relationSignal(text);
  const participants = (chat.participants || []).map((id) => state.characters.find((character) => character.id === id)).filter(Boolean);
  for (const character of participants) addMemory(character, text, chat.id);
  if (signal) {
    for (const source of participants) {
      for (const target of participants) {
        if (source.id !== target.id) applyRelation(source, target.id, signal, 'Acontecimientos de los últimos 4 mensajes');
      }
      applyRelation(source, 'player', signal, 'Interacción NPC–jugador de los últimos 4 mensajes');
      applyRelation(state.playerProfile, source.id, signal, `Interacción con ${source.name} de los últimos 4 mensajes`);
    }
  }
  chat.relationshipCursor = messages.length;
  chat.memoryCursor = messages.length;
  return true;
}

function sync() {
  const current = readState();
  if (!current || !Array.isArray(current.characters)) return;
  const next = clone(current);
  ensureStartingRelations(next);
  let changed = JSON.stringify(next) !== JSON.stringify(current);
  for (const chat of next.chats || []) changed = processChat(next, chat) || changed;
  if (!changed) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('nexus-state-updated'));
}

sync();
window.setInterval(sync, 1200);
export { sync, statusFor };
