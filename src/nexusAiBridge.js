const STORAGE_KEY = 'nexus-state-v1';
const originalFetch = window.fetch.bind(window);

function readPersistedState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function buildPersistentContext(state) {
  const chat = (state.chats || []).find((item) => item.id === state.activeChatId);
  if (!chat) return '';
  const characters = (chat.participants || []).map((id) => (state.characters || []).find((character) => character.id === id)).filter(Boolean).map((character) => ({
    id: character.id, name: character.name, identity: character.identity, personality: character.personality,
    moral: character.moral, goal: character.goal, speechStyle: character.speechStyle, description: character.description,
    outfit: character.outfit, physical: character.physical, knowledge: character.knowledge || [], blindSpots: character.blindSpots || [],
    memories: character.memories || [], relations: character.relations || {}
  }));
  const universe = (state.universes || []).find((item) => item.id === chat.universeId) || null;
  const conversation = (chat.messages || []).map((message) => ({ author: message.author, text: message.text, timestamp: message.timestamp }));
  return JSON.stringify({
    instruction: 'Usa todo el contexto de esta sala desde su primer mensaje. No olvides la conversación por superar cuatro mensajes. Las relaciones y memorias son persistentes y evolucionan cada cuatro mensajes; respétalas.',
    antiRepetition: ['No repitas literalmente frases, acciones, gestos o párrafos anteriores.', 'No reutilices una respuesta para dos NPCs.', 'Cada intervención debe avanzar la escena.'],
    sala: { name: chat.name, scene: chat.scene, description: chat.description, openingDialogue: chat.openingDialogue, narrativeState: chat.narrativeState || {}, narrativeSummary: chat.narrativeSummary || {}, relationshipCursor: chat.relationshipCursor || 0, memoryCursor: chat.memoryCursor || 0 },
    universo: universe,
    personajesPresentes: characters,
    relacionesDelJugador: state.playerProfile?.relations || {},
    perfilJugador: state.playerProfile || {},
    conversacionCompletaDesdeElInicio: conversation
  }, null, 2);
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (!url.includes('openrouter.ai/api/v1/chat/completions') || !init.body) return originalFetch(input, init);
  try {
    const body = JSON.parse(init.body);
    const context = buildPersistentContext(readPersistedState());
    if (context) {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const index = messages.findIndex((message) => message.role === 'system');
      const block = `\n\n--- CONTEXTO NEXUS COMPLETO Y RELACIONES PERSISTENTES ---\n${context}\n--- FIN DEL CONTEXTO ---`;
      if (index >= 0) messages[index] = { ...messages[index], content: `${messages[index].content || ''}${block}` };
      else messages.unshift({ role: 'system', content: block });
      body.messages = messages;
      body.temperature = Math.min(Number(body.temperature ?? 0.9), 0.8);
      init = { ...init, body: JSON.stringify(body) };
    }
  } catch {}
  return originalFetch(input, init);
};

export { buildPersistentContext };
