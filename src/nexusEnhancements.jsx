import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'nexus-state-v1';
const DEFAULT_X = 4;

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('nexus-state-updated'));
}

function normaliseCharacter(character) {
  return {
    ...character,
    knowledge: Array.isArray(character.knowledge) ? character.knowledge : [],
    blindSpots: Array.isArray(character.blindSpots) ? character.blindSpots : [],
    memories: Array.isArray(character.memories) ? character.memories : [],
    relations: character.relations || {}
  };
}

function migrateState(state) {
  const migrated = { ...state };
  migrated.settings = {
    ...(state.settings || {}),
    autoMemoryEvery: Number(state.settings?.autoMemoryEvery || DEFAULT_X),
    narrativeValidation: state.settings?.narrativeValidation !== false
  };
  migrated.playerProfile = {
    visible: '',
    reputation: '',
    appearance: '',
    visibleObjects: '',
    rumors: '',
    knownInformation: '',
    secrets: [],
    ...(state.playerProfile || {})
  };
  migrated.characters = (state.characters || []).map(normaliseCharacter);
  migrated.chats = (state.chats || []).map((chat) => ({
    ...chat,
    autoMemoryCursor: Number.isInteger(chat.autoMemoryCursor) ? chat.autoMemoryCursor : 0,
    narrativeState: {
      location: '',
      presentCharacterIds: chat.participants || [],
      departedCharacterIds: [],
      importantObjects: [],
      wounds: [],
      revealedSecrets: [],
      activeConflicts: [],
      immediateObjective: '',
      ...(chat.narrativeState || {})
    },
    narrativeSummary: chat.narrativeSummary || ''
  }));
  return migrated;
}

function relationDelta(text) {
  const value = text.toLowerCase();
  const signals = [
    [/\b(ayud|salv|prote|apoy|conf[ií]a|promet|gracias|perdon)/i, 2],
    [/\b(amistad|afecto|amor|cari[nñ]o|lealtad)/i, 2],
    [/\b(amenaz|mentir|traici|enga[nñ]|odio|atac|golpe|violencia)/i, -3],
    [/\b(rival|enemig|discusi|desconf|secreto)/i, -1]
  ];
  return signals.reduce((total, [pattern, amount]) => pattern.test(value) ? total + amount : total, 0);
}

function eventMemory(text) {
  const value = text.trim();
  if (!value || value.length < 18) return null;
  const lower = value.toLowerCase();
  const category = /promet|juramento/.test(lower) ? 'promesa'
    : /revel|secret|confes/.test(lower) ? 'revelacion'
      : /atac|combate|herid|arma/.test(lower) ? 'combate' : 'hecho_historico';
  const relevant = /promet|revel|secret|confes|atac|combate|herid|amenaz|ayud|salv|entreg|perd[ií]/.test(lower);
  if (!relevant) return null;
  return { category, summary: value.slice(0, 240), relevance: clamp(category === 'hecho_historico' ? 6 : 8, 1, 10), pinned: false, notes: 'Consolidación automática' };
}

function consolidate(state) {
  const next = migrateState(clone(state));
  const threshold = Number(next.settings.autoMemoryEvery || DEFAULT_X);
  next.chats = next.chats.map((chat) => {
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const cursor = Math.max(0, chat.autoMemoryCursor || 0);
    if (messages.length - cursor < threshold) return chat;
    const fresh = messages.slice(cursor);
    const participants = (chat.participants || []).filter((id) => next.characters.some((character) => character.id === id));
    const memories = fresh.map((message) => eventMemory(message.text || '')).filter(Boolean);
    if (!memories.length) return { ...chat, autoMemoryCursor: messages.length };

    const dedupe = (character, memory) => (character.memories || []).some((item) => item.summary === memory.summary);
    memories.forEach((memory) => {
      participants.forEach((characterId) => {
        const character = next.characters.find((item) => item.id === characterId);
        if (!character || dedupe(character, memory)) return;
        character.memories = [{ ...memory, id: `mem-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString(), sourceChatId: chat.id }, ...(character.memories || [])];
      });
    });

    const signal = relationDelta(fresh.map((message) => message.text || '').join(' '));
    if (signal) {
      for (const sourceId of participants) {
        const source = next.characters.find((item) => item.id === sourceId);
        for (const targetId of participants) {
          if (sourceId === targetId) continue;
          const previous = source.relations[targetId] || { affinity: 0, status: 'Neutral', notes: '', history: [] };
          const affinity = clamp(previous.affinity + signal, -100, 100);
          source.relations[targetId] = {
            ...previous,
            affinity,
            status: affinity >= 60 ? 'Confianza sólida' : affinity >= 20 ? 'Tensión contenida' : affinity <= -60 ? 'Rivalidad latente' : affinity <= -20 ? 'Desconfianza velada' : 'Neutral',
            notes: previous.notes || 'Evolución automática basada en acontecimientos consolidados.',
            history: [{ id: `rel-auto-${Date.now()}-${sourceId}`, delta: signal, reason: 'Acontecimiento narrativo consolidado', actor: source.name, timestamp: new Date().toISOString(), affinity }, ...(previous.history || [])].slice(0, 30)
          };
        }
      }
    }
    return { ...chat, autoMemoryCursor: messages.length };
  });
  return next;
}

export function prepareNarrativeContext(chat, character, state) {
  const current = migrateState(state);
  const recent = (chat.messages || []).slice(-12);
  const present = (chat.participants || []).map((id) => current.characters.find((item) => item.id === id)).filter(Boolean);
  const relevant = (character.memories || []).filter((memory) => memory.pinned || recent.some((message) => (message.text || '').toLowerCase().includes((memory.summary || '').toLowerCase().split(' ')[0]))).slice(0, 12);
  return {
    speaker: { id: character.id, name: character.name, identity: character.identity, personality: character.personality || character.description, moral: character.moral, goal: character.goal, speechStyle: character.speechStyle },
    situation: { scene: chat.scene, description: chat.description, narrativeState: chat.narrativeState, present: present.map((item) => item.name) },
    recentMessages: recent,
    relationships: present.filter((item) => item.id !== character.id).map((item) => ({ name: item.name, ...(character.relations?.[item.id] || {}) })),
    memories: relevant,
    allowedKnowledge: character.knowledge || [],
    forbiddenKnowledge: character.blindSpots || [],
    universe: current.universes?.find((item) => item.id === chat.universeId) || null,
    rules: 'Coherencia > creatividad. No inventar conocimiento, secretos, relaciones, objetos, heridas, lugares ni acontecimientos sin respaldo en este contexto.'
  };
}

export default function NexusEnhancements() {
  const [state, setState] = useState(() => migrateState(readState()));
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const sync = () => setState(migrateState(readState()));
    window.addEventListener('nexus-state-updated', sync);
    const timer = window.setInterval(() => {
      const current = readState();
      const next = consolidate(current);
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        writeState(next);
        setState(next);
        setNotice('Continuidad actualizada');
        window.setTimeout(() => setNotice(''), 2400);
      }
    }, 1500);
    return () => { window.removeEventListener('nexus-state-updated', sync); window.clearInterval(timer); };
  }, []);

  const activeChat = useMemo(() => state.chats?.find((chat) => chat.id === state.activeChatId), [state]);
  const update = (patch) => { const next = migrateState({ ...state, ...patch }); writeState(next); setState(next); };
  const clearChat = () => {
    if (!activeChat || !window.confirm('¿Vaciar chat? La sala y toda su configuración se conservarán.')) return;
    update({ chats: state.chats.map((chat) => chat.id === activeChat.id ? { ...chat, messages: [], autoMemoryCursor: 0, narrativeSummary: '' } : chat) });
  };
  const deleteChat = () => {
    if (!activeChat || !window.confirm('¿Eliminar sala? Esta acción no elimina personajes ni universos.')) return;
    update({ chats: state.chats.filter((chat) => chat.id !== activeChat.id), activeChatId: null });
  };
  const updatePlayer = (key, value) => update({ playerProfile: { ...state.playerProfile, [key]: value } });

  return <>
    <button type="button" onClick={() => setOpen((value) => !value)} style={buttonStyle}>{open ? 'Cerrar continuidad' : 'Continuidad'}</button>
    {notice && <span style={noticeStyle}>{notice}</span>}
    {open && <aside style={panelStyle} aria-label="Continuidad narrativa">
      <h3 style={{ marginTop: 0 }}>Continuidad narrativa</h3>
      <p style={mutedStyle}>Las actualizaciones son graduales, persistentes y editables. X = {state.settings?.autoMemoryEvery || DEFAULT_X} mensajes.</p>
      <label style={labelStyle}>Actualizar memoria cada X mensajes
        <select value={state.settings?.autoMemoryEvery || DEFAULT_X} onChange={(event) => update({ settings: { ...state.settings, autoMemoryEvery: Number(event.target.value) } })} style={inputStyle}>
          {[2, 3, 4, 5, 8, 10, 15].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <h4>Cómo me ven los NPCs</h4>
      {['visible', 'reputation', 'appearance', 'visibleObjects', 'rumors', 'knownInformation'].map((key) => <label key={key} style={labelStyle}>{key === 'visibleObjects' ? 'Objetos visibles' : key === 'knownInformation' ? 'Información conocida' : key[0].toUpperCase() + key.slice(1)}<textarea value={state.playerProfile?.[key] || ''} onChange={(event) => updatePlayer(key, event.target.value)} style={inputStyle} rows={2} /></label>)}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" onClick={clearChat} style={secondaryButton}>Vaciar chat</button><button type="button" onClick={deleteChat} style={dangerButton}>Eliminar sala</button></div>
    </aside>}
  </>;
}

const buttonStyle = { position: 'fixed', right: 16, bottom: 16, zIndex: 50, background: '#27272a', color: '#f4f4f5', border: '1px solid #52525b', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' };
const noticeStyle = { position: 'fixed', right: 16, bottom: 58, zIndex: 50, background: '#166534', color: '#dcfce7', borderRadius: 8, padding: '6px 10px', fontSize: 12 };
const panelStyle = { position: 'fixed', right: 16, bottom: 58, zIndex: 49, width: 'min(360px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 90px)', overflow: 'auto', background: '#111116', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: 16, padding: 16, boxShadow: '0 18px 50px #000b' };
const labelStyle = { display: 'grid', gap: 5, marginBottom: 10, fontSize: 12, color: '#d4d4d8' };
const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#09090b', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: 8, padding: 8, font: 'inherit' };
const mutedStyle = { color: '#a1a1aa', fontSize: 12 };
const secondaryButton = { background: '#27272a', color: '#e4e4e7', border: '1px solid #52525b', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' };
const dangerButton = { ...secondaryButton, color: '#fecaca', borderColor: '#7f1d1d' };
