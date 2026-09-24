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
  const conversation = (chat.messages || []).map((message) => ({ author: message.author, text: message.text, timestamp: message.timestamp }));
  return JSON.stringify({
    instruction: 'Usa el contexto persistente completo. No olvides la conversación por superar cuatro mensajes.',
    antiRepetition: [
      'No repitas literalmente ninguna frase, acción, gesto o párrafo de mensajes anteriores.',
      'No reutilices la misma respuesta para dos NPCs distintos.',
      'Cada intervención debe avanzar la escena y responder desde la voz del NPC que habla.',
      'Si ya se dijo algo, reacciona a ello con información o acción nueva; no lo copies.',
      'No rellenes huecos inventando hechos, secretos, relaciones o conocimientos.'
    ],
    sala: { name: chat.name, scene: chat.scene, description: chat.description, openingDialogue: chat.openingDialogue, narrativeState: chat.narrativeState || {}, narrativeSummary: chat.narrativeSummary || '' },
    universo: universe,
    personajesPresentes: characters,
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
      const block = `\n\n--- REGLAS NEXUS: NO REPETICIÓN ---\n${context}\n--- FIN DE REGLAS NEXUS ---`;
      if (index >= 0) messages[index] = { ...messages[index], content: `${messages[index].content || ''}${block}` };
      else messages.unshift({ role: 'system', content: block });
      body.messages = messages;
      body.temperature = Math.min(Number(body.temperature ?? 0.9), 0.8);
      init = { ...init, body: JSON.stringify(body) };
    }
  } catch {
    // Preserve the existing request if its provider payload is malformed.
  }
  return originalFetch(input, init);
};

export { buildPersistentContext };
