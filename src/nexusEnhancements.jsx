import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nexus-state-v1';
const DEFAULT_INTERVAL = 4;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
const statusFor = (affinity) => {
  if (affinity >= 80) return 'Lealtad incondicional';
  if (affinity >= 60) return 'Confianza sólida';
  if (affinity >= 30) return 'Tensión contenida';
  if (affinity >= 10) return 'Neutral';
  if (affinity <= -80) return 'Enemistad jurada';
  if (affinity <= -60) return 'Rivalidad latente';
  if (affinity <= -30) return 'Desconfianza velada';
  return 'Hostilidad mínima';
};

function readState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function eventDelta(text) {
  const value = text.toLowerCase();
  if (/traici[oó]n|mentira|ataque|agresi[oó]n|amenaza|odio|violencia/.test(value)) return -4;
  if (/promesa|prote|ayuda|confianza|amistad|afecto|amor|favor|alianza/.test(value)) return 3;
  if (/discusi[oó]n|rival|enemigo|desconfianza|secreto/.test(value)) return -2;
  return 0;
}
function relevantMemory(text) {
  return /promesa|revel|secreto|decidi|descubri|ataqu|amenaz|traici|ayud|perdi|muri|herid|confian|mentir/i.test(text);
}
function relationCopy(relation) {
  return { affinity: clamp(relation?.affinity, -100, 100), status: relation?.status || statusFor(relation?.affinity || 0), notes: relation?.notes || '', history: Array.isArray(relation?.history) ? relation.history : [] };
}

function consolidate(state) {
  const interval = clamp(state.settings?.autoMemoryEvery || DEFAULT_INTERVAL, 1, 100);
  let changed = false;
  const characters = (state.characters || []).map((character) => ({ ...character, relations: { ...(character.relations || {}) }, memories: Array.isArray(character.memories) ? character.memories : [] }));
  const byId = Object.fromEntries(characters.map((character) => [character.id, character]));
  const chats = (state.chats || []).map((chat) => {
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const cursor = clamp(chat.nexusProcessedMessageCount, 0, messages.length);
    const pending = messages.slice(cursor);
    let nextCursor = cursor;
    let relationEvents = chat.nexusRelationEventIds || [];
    pending.forEach((message) => {
      const delta = eventDelta(message.text || '');
      if (!delta || message.author === 'user') return;
      const source = byId[message.author];
      if (!source) return;
      (chat.participants || []).filter((id) => id !== source.id).forEach((targetId) => {
        const relation = relationCopy(source.relations[targetId]);
        const key = `${message.id}:${source.id}:${targetId}`;
        if (relationEvents.includes(key)) return;
        relation.affinity = clamp(relation.affinity + delta, -100, 100);
        relation.status = statusFor(relation.affinity);
        relation.notes = `${relation.notes ? `${relation.notes} ` : ''}${delta > 0 ? 'Evolución positiva' : 'Tensión o conflicto'}: ${(message.text || '').slice(0, 120)}`.trim();
        relation.history = [{ id: uid('rel'), delta, reason: 'Acontecimiento narrativo significativo', actor: source.name, timestamp: new Date().toISOString(), affinity: relation.affinity, status: relation.status }, ...relation.history].slice(0, 50);
        source.relations[targetId] = relation;
        relationEvents = [...relationEvents, key];
        changed = true;
      });
    });
    if (pending.length >= interval) {
      const batch = pending.slice(0, interval);
      const meaningful = batch.filter((message) => relevantMemory(message.text || ''));
      const knownTo = new Set((chat.participants || []));
      meaningful.forEach((message) => {
        const key = `auto:${message.id}`;
        characters.filter((character) => knownTo.has(character.id)).forEach((character) => {
          if (character.memories.some((memory) => memory.sourceEventId === key)) return;
          character.memories.unshift({ id: uid('mem'), sourceEventId: key, summary: (message.text || '').slice(0, 240), category: 'hecho_historico', relevance: 7, pinned: false, automatic: true, createdAt: new Date().toISOString(), notes: 'Consolidación automática; conocido por estar presente en la sala.' });
          changed = true;
        });
      });
      nextCursor = cursor + batch.length;
    }
    if (nextCursor !== cursor || relationEvents !== (chat.nexusRelationEventIds || [])) changed = true;
    return { ...chat, nexusProcessedMessageCount: nextCursor, nexusRelationEventIds: relationEvents, nexusLastMemoryUpdate: nextCursor ? new Date().toISOString() : chat.nexusLastMemoryUpdate };
  });
  return changed ? { ...state, characters, chats } : state;
}

export default function NexusEnhancements() {
  const [state, setState] = useState(readState);
  const [open, setOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState('');

  useEffect(() => {
    const tick = () => {
      const current = readState();
      const next = consolidate(current);
      if (JSON.stringify(next) !== JSON.stringify(current)) writeState(next);
      setState(next);
    };
    tick();
    const timer = window.setInterval(tick, 900);
    return () => window.clearInterval(timer);
  }, []);

  const patch = (updater) => {
    const next = updater(readState());
    writeState(next);
    setState(next);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(next) }));
  };
  const clearChat = (chatId) => {
    if (!chatId || !window.confirm('¿Vaciar chat? La sala, participantes y configuración se conservarán.')) return;
    patch((current) => ({ ...current, chats: (current.chats || []).map((chat) => chat.id === chatId ? { ...chat, messages: [], nexusProcessedMessageCount: 0, nexusRelationEventIds: [] } : chat) }));
  };
  const deleteChat = (chatId) => {
    if (!chatId || !window.confirm('¿Eliminar sala? Esta acción no elimina personajes ni universos.')) return;
    patch((current) => ({ ...current, chats: (current.chats || []).filter((chat) => chat.id !== chatId), activeChatId: current.activeChatId === chatId ? null : current.activeChatId }));
    setSelectedChat('');
  };
  const interval = state.settings?.autoMemoryEvery || DEFAULT_INTERVAL;

  return <>
    <button className="nexus-enhance-toggle" onClick={() => setOpen((value) => !value)} aria-label="Controles de continuidad">Continuidad</button>
    {open && <section className="nexus-enhance-panel panel">
      <div className="nexus-enhance-heading"><strong>Continuidad narrativa</strong><button className="mini-button" onClick={() => setOpen(false)}>×</button></div>
      <p className="nexus-enhance-muted">Memoria cada {interval} mensajes · conocimiento limitado por presencia · relaciones asimétricas.</p>
      <label>Actualizar memoria cada X mensajes
        <input type="number" min="1" max="100" value={interval} onChange={(event) => patch((current) => ({ ...current, settings: { ...(current.settings || {}), autoMemoryEvery: clamp(event.target.value, 1, 100) } }))} />
      </label>
      <label>Sala
        <select value={selectedChat} onChange={(event) => setSelectedChat(event.target.value)}><option value="">Seleccionar sala</option>{(state.chats || []).map((chat) => <option key={chat.id} value={chat.id}>{chat.name}</option>)}</select>
      </label>
      <div className="nexus-enhance-actions"><button className="button ghost" disabled={!selectedChat} onClick={() => clearChat(selectedChat)}>Vaciar chat</button><button className="button danger" disabled={!selectedChat} onClick={() => deleteChat(selectedChat)}>Eliminar sala</button></div>
      <small className="nexus-enhance-muted">Las acciones destructivas requieren confirmación. Los datos se conservan en localStorage.</small>
    </section>}
  </>;
}
