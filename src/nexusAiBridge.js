const STORAGE_KEY = 'nexus-state-v1';
const originalFetch = window.fetch.bind(window);

function readPersistedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function buildPersistentContext(state) {
  const chat = (state.chats || []).find((item) => item.id === state.activeChatId);
  if (!chat) return '';

  const characters = (chat.participants || [])
    .map((id) => (state.characters || []).find((character) => character.id === id))
    .filter(Boolean)
    .map((character) => ({
      id: character.id,
      name: character.name,
      identity: character.identity,
      personality: character.personality,
      moral: character.moral,
      goal: character.goal,
      speechStyle: character.speechStyle,
      description: character.description,
      outfit: character.outfit,
      physical: character.physical,
      knowledge: character.knowledge || [],
      blindSpots: character.blindSpots || [],
      memories: character.memories || [],
      relations: character.relations || {}
    }));

  const universe = (state.universes || []).find((item) => item.id === chat.universeId) || null;
  const fullConversation = (chat.messages || []).map((message) => ({
    author: message.author,
    text: message.text,
    timestamp: message.timestamp
  }));

  return JSON.stringify({
    instruction: 'Usa este contexto persistente completo. No olvides mensajes anteriores por superar cuatro turnos. Coherencia > creatividad. No inventes conocimiento, secretos, relaciones, objetos ni acontecimientos.',
    sala: {
      name: chat.name,
      scene: chat.scene,
      description: chat.description,
      openingDialogue: chat.openingDialogue,
      narrativeState: chat.narrativeState || {},
      narrativeSummary: chat.narrativeSummary || ''
    },
    universo: universe,
    personajesPresentes: characters,
    perfilJugador: state.playerProfile || {},
    conversacionCompletaDesdeElInicio: fullConversation
  }, null, 2);
}

// The existing UI already uses <input type="file" accept="image/*"> for
// characters and universes. On mobile that opens Files/Gallery; this bridge
// only ensures the AI receives the complete persistent conversation.
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (!url.includes('openrouter.ai/api/v1/chat/completions') || !init.body) {
    return originalFetch(input, init);
  }

  try {
    const body = JSON.parse(init.body);
    const state = readPersistedState();
    const persistentContext = buildPersistentContext(state);
    if (persistentContext) {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const systemIndex = messages.findIndex((message) => message.role === 'system');
      const contextBlock = `\n\n--- NEXUS: CONTEXTO PERSISTENTE COMPLETO ---\n${persistentContext}\n--- FIN DEL CONTEXTO PERSISTENTE ---`;
      if (systemIndex >= 0) {
        messages[systemIndex] = { ...messages[systemIndex], content: `${messages[systemIndex].content || ''}${contextBlock}` };
      } else {
        messages.unshift({ role: 'system', content: contextBlock });
      }
      body.messages = messages;
      body.temperature = Math.min(Number(body.temperature ?? 0.9), 0.8);
      init = { ...init, body: JSON.stringify(body) };
    }
  } catch {
    // Preserve the original request if a provider or browser returns an
    // unexpected payload; the existing application behaviour remains intact.
  }

  return originalFetch(input, init);
};

export { buildPersistentContext };
