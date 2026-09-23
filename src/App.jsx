import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'nexus-state-v1';
const defaultSettings = {
  theme: 'obsidian',
  fontScale: 'comfortable',
  autoMemoryEvery: 4,
  autoRelations: true,
  openRouterApiKey: '',
  openRouterModel: 'openai/gpt-4o-mini',
  darkMode: true,
  aiSystemPrompt: 'No hables por el usuario. Solo responde desde el punto de vista del personaje. No describas pensamientos o decisiones del jugador. Describe lo que el personaje ve, dice y hace.'
};

const emptyState = {
  universes: [],
  characters: [],
  chats: [],
  settings: defaultSettings,
  activeChatId: null,
  activeUniverseId: null,
  activeCharacterId: null
};

const initialRelations = {
  status: 'Neutral',
  affinity: 0,
  notes: '',
  history: []
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(emptyState);
    const parsed = JSON.parse(raw);
    return {
      ...deepClone(emptyState),
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      universes: parsed.universes || [],
      characters: parsed.characters || [],
      chats: parsed.chats || []
    };
  } catch {
    return deepClone(emptyState);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sanitizeText(value) {
  return (value || '').trim();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function computeRelationStatus(affinity) {
  if (affinity >= 80) return 'Lealtad incondicional';
  if (affinity >= 60) return 'Confianza sólida';
  if (affinity >= 30) return 'Tensión contenida';
  if (affinity >= 10) return 'Neutral';
  if (affinity <= -80) return 'Enemistad jurada';
  if (affinity <= -60) return 'Rivalidad latente';
  if (affinity <= -30) return 'Desconfianza velada';
  return 'Hostilidad mínima';
}

function clampAffinity(value) {
  return Math.max(-100, Math.min(100, Number(value) || 0));
}

function updateRelationSnapshot(relations, delta, reason, actorName = 'Sistema') {
  const next = { ...relations };
  next.affinity = clampAffinity((Number(next.affinity) || 0) + Number(delta || 0));
  next.status = computeRelationStatus(next.affinity);
  next.notes = next.notes || '';
  next.history = Array.isArray(next.history) ? next.history : [];
  next.history.unshift({
    id: uid('rel'),
    delta: Number(delta || 0),
    reason,
    actor: actorName,
    timestamp: new Date().toISOString(),
    affinity: next.affinity,
    status: next.status
  });
  return next;
}

function buildPromptFromChat(chat, state) {
  const participants = (chat.participants || [])
    .map((id) => state.characters.find((c) => c.id === id))
    .filter(Boolean);

  const lore = participants
    .map((char) => {
      const memories = (char.memories || []).filter((m) => m.pinned).slice(0, 4);
      const rels = Object.entries(char.relations || {})
        .map(([targetId, rel]) => {
          const target = state.characters.find((c) => c.id === targetId);
          return target ? `${target.name}: afinidad ${rel.affinity || 0}, estado ${rel.status || 'Neutral'}` : null;
        })
        .filter(Boolean)
        .slice(0, 3)
        .join('; ');

      return `- ${char.name}: identidad=${char.identity || 'sin identidad'}, objetivo=${char.goal || 'sin objetivo'}, estilo=${char.speechStyle || 'natural'}, vestimenta=${char.outfit || 'sin det[...`;
    })
    .join('\n');

  const universe = chat.universeId ? state.universes.find((u) => u.id === chat.universeId) : null;
  const world = universe ? `\nUniverso: ${universe.name}. Lore: ${universe.lore || 'sin lore definido'}. Tono: ${universe.tone || 'sin tono definido'}.` : '';

  return `Eres un motor de roleplay narrativo. Responde solo desde el punto de vista del personaje activo. No hables en nombre del usuario ni describas lo que el jugador siente. Solo describe lo que el personaje ve, dice y hace.\n\nContexto de escena:\n${lore}${world}\n\nNo conviertas el mensaje del jugador en narración omnisciente; responde como diálogo o acción del personaje.`;
}

const categoryPalette = {
  promesa: '#ef4444',
  revelacion: '#a78bfa',
  combate: '#f59e0b',
  hecho_historico: '#22c55e'
};

function App() {
  const [state, setState] = useState(() => loadState());
  const [newUniverse, setNewUniverse] = useState({ name: '', lore: '', tone: '', image: '' });
  const [newCharacter, setNewCharacter] = useState({
    name: '', universeId: '', identity: '', goal: '', speechStyle: '', description: '', outfit: '', physical: '', image: ''
  });
  const [chatDraft, setChatDraft] = useState({
    name: '', universeId: '', participants: [], scene: '', description: '', openingDialogue: '', type: 'group'
  });
  const [messageDraft, setMessageDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installState, setInstallState] = useState({ available: false, prompt: null });
  const [activeSection, setActiveSection] = useState('chat');

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    document.body.dataset.theme = state.settings.theme || 'obsidian';
    document.body.dataset.font = state.settings.fontScale || 'comfortable';
  }, [state.settings.theme, state.settings.fontScale]);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallState({ available: true, prompt: event });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const activeChat = useMemo(
    () => state.chats.find((chat) => chat.id === state.activeChatId) || null,
    [state.chats, state.activeChatId]
  );

  const activeUniverse = useMemo(
    () => state.universes.find((u) => u.id === state.activeUniverseId) || null,
    [state.universes, state.activeUniverseId]
  );

  const filteredCharacters = useMemo(() => {
    if (!state.activeUniverseId) return state.characters;
    return state.characters.filter((char) => char.universeId === state.activeUniverseId);
  }, [state.characters, state.activeUniverseId]);

  const activeCharacter = useMemo(
    () => state.characters.find((char) => char.id === state.activeCharacterId) || null,
    [state.characters, state.activeCharacterId]
  );

  const setStateWith = (updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(next);
      return next;
    });
  };

  const saveToStorage = (next) => {
    saveState(next);
    setState(next);
  };

  const handleImageUpload = async (event, setter) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setter((prev) => ({ ...prev, image: dataUrl }));
  };

  const addUniverse = () => {
    const name = sanitizeText(newUniverse.name);
    if (!name) return;
    const universe = {
      id: uid('uni'),
      name,
      lore: newUniverse.lore || '',
      tone: newUniverse.tone || '',
      image: newUniverse.image || '',
      createdAt: new Date().toISOString(),
      characters: []
    };

    setStateWith((prev) => ({
      ...prev,
      universes: [universe, ...prev.universes],
      activeUniverseId: universe.id,
      activeCharacterId: null
    }));
    setNewUniverse({ name: '', lore: '', tone: '', image: '' });
  };

  const addCharacter = () => {
    const name = sanitizeText(newCharacter.name);
    if (!name) return;
    const universeId = newCharacter.universeId || state.activeUniverseId || null;
    const char = {
      id: uid('char'),
      name,
      universeId,
      identity: newCharacter.identity || '',
      goal: newCharacter.goal || '',
      speechStyle: newCharacter.speechStyle || '',
      description: newCharacter.description || '',
      outfit: newCharacter.outfit || '',
      physical: newCharacter.physical || '',
      image: newCharacter.image || '',
      createdAt: new Date().toISOString(),
      memories: [],
      relations: {},
      profile: {
        scene: '',
        openingDialogue: ''
      }
    };

    setStateWith((prev) => ({
      ...prev,
      characters: [char, ...prev.characters],
      activeCharacterId: char.id
    }));
    setNewCharacter({
      name: '', universeId: '', identity: '', goal: '', speechStyle: '', description: '', outfit: '', physical: '', image: ''
    });
  };

  const addChat = () => {
    const name = sanitizeText(chatDraft.name) || 'Nueva sala';
    const participants = chatDraft.participants.length ? chatDraft.participants : (state.characters.slice(0, 2).map((c) => c.id));
    if (!participants.length) return;

    const chat = {
      id: uid('chat'),
      name,
      universeId: chatDraft.universeId || state.activeUniverseId || null,
      participants,
      scene: chatDraft.scene || '',
      description: chatDraft.description || 'Sala de roleplay',
      openingDialogue: chatDraft.openingDialogue || '',
      type: chatDraft.type || 'group',
      messages: [],
      createdAt: new Date().toISOString(),
      nexusProcessedMessageCount: 0,
      nexusRelationEventIds: [],
      nexusLastMemoryUpdate: null
    };

    setStateWith((prev) => ({
      ...prev,
      chats: [chat, ...prev.chats],
      activeChatId: chat.id
    }));
    setChatDraft({ name: '', universeId: '', participants: [], scene: '', description: '', openingDialogue: '', type: 'group' });
  };

  const createRelationMatrix = (charAId, charBId) => {
    const allChars = state.characters;
    const left = allChars.find((c) => c.id === charAId);
    const right = allChars.find((c) => c.id === charBId);
    if (!left || !right) return;

    if (!left.relations) left.relations = {};
    if (!right.relations) right.relations = {};

    if (!left.relations[charBId]) left.relations[charBId] = { ...initialRelations };
    if (!right.relations[charAId]) right.relations[charAId] = { ...initialRelations };

    const next = { ...state };
    next.characters = next.characters.map((char) => {
      if (char.id === charAId) return { ...char, relations: { ...char.relations, [charBId]: { ...(char.relations[charBId] || initialRelations) } } };
      if (char.id === charBId) return { ...char, relations: { ...char.relations, [charAId]: { ...(char.relations[charAId] || initialRelations) } } };
      return char;
    });
    setState(next);
  };

  const updateRelation = (sourceId, targetId, affinityDelta, note) => {
    setStateWith((prev) => {
      const source = prev.characters.find((c) => c.id === sourceId);
      const target = prev.characters.find((c) => c.id === targetId);
      if (!source || !target) return prev;

      const sourceRel = { ...(source.relations?.[targetId] || initialRelations) };
      const nextSourceRel = updateRelationSnapshot(sourceRel, affinityDelta, note || 'Cambio de vínculo', source.name);
      const targetRel = { ...(target.relations?.[sourceId] || initialRelations) };
      const nextTargetRel = updateRelationSnapshot(targetRel, -affinityDelta, `Reflejo de ${source.name}`, target.name);

      const nextCharacters = prev.characters.map((char) => {
        if (char.id === sourceId) {
          return {
            ...char,
            relations: {
              ...(char.relations || {}),
              [targetId]: nextSourceRel
            }
          };
        }
        if (char.id === targetId) {
          return {
            ...char,
            relations: {
              ...(char.relations || {}),
              [sourceId]: nextTargetRel
            }
          };
        }
        return char;
      });

      return { ...prev, characters: nextCharacters };
    });
  };

  const addMemory = (characterId, memory) => {
    setStateWith((prev) => {
      const nextChars = prev.characters.map((char) => {
        if (char.id !== characterId) return char;
        return {
          ...char,
          memories: [
            { ...memory, id: uid('mem'), createdAt: new Date().toISOString() },
            ...(char.memories || [])
          ]
        };
      });
      return { ...prev, characters: nextChars };
    });
  };

  const clearMessagesInChat = (chatId) => {
    if (!chatId || !window.confirm('¿Vaciar chat? La sala, sus participantes y su configuración se conservan.')) return;
    setStateWith((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => chat.id === chatId ? { ...chat, messages: [], nexusProcessedMessageCount: 0, nexusRelationEventIds: [] } : chat)
    }));
  };

  const deleteChat = (chatId) => {
    if (!chatId || !window.confirm('¿Eliminar sala? Esta acción no elimina personajes ni universos.')) return;
    setStateWith((prev) => ({
      ...prev,
      chats: prev.chats.filter((chat) => chat.id !== chatId),
      activeChatId: prev.activeChatId === chatId ? null : prev.activeChatId
    }));
  };

  const deleteCharacter = (charId) => {
    if (!window.confirm('¿Eliminar este personaje?')) return;
    setStateWith((prev) => ({
      ...prev,
      characters: prev.characters.filter((char) => char.id !== charId),
      chats: prev.chats.map((chat) => ({
        ...chat,
        participants: (chat.participants || []).filter((pid) => pid !== charId)
      })),
      activeCharacterId: prev.activeCharacterId === charId ? null : prev.activeCharacterId
    }));
  };

  const deleteUniverse = (uniId) => {
    if (!window.confirm('¿Eliminar este universo y sus personajes asociados?')) return;
    setStateWith((prev) => ({
      ...prev,
      universes: prev.universes.filter((uni) => uni.id !== uniId),
      characters: prev.characters.filter((char) => char.universeId !== uniId),
      chats: prev.chats.filter((chat) => chat.universeId !== uniId),
      activeUniverseId: prev.activeUniverseId === uniId ? null : prev.activeUniverseId
    }));
  };

  const resetAll = () => {
    if (!window.confirm('¿Borrar todo el contenido de NEXUS?')) return;
    const empty = deepClone(emptyState);
    setState(empty);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  };

  const installApp = async () => {
    if (!installState.prompt) return;
    installState.prompt.prompt();
    const result = await installState.prompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstallState({ available: false, prompt: null });
    }
  };

  const buildAiResponse = async (chat, userMessage) => {
    const participants = (chat.participants || []).map((id) => state.characters.find((c) => c.id === id)).filter(Boolean);
    if (!participants.length) return 'La sala está vacía.';

    const prompt = buildPromptFromChat(chat, state);
    const system = `${state.settings.aiSystemPrompt || defaultSettings.aiSystemPrompt}\n\n${prompt}`;

    if (!state.settings.openRouterApiKey) {
      const chosen = participants[Math.floor(Math.random() * participants.length)];
      const k = userMessage.toLowerCase();
      const verbs = [
        'frunce el ceño',
        'se inclina sin romper la mirada',
        'da un paso adelante',
        'baja la vista un instante',
        'endereza la espalda',
        'aprieta los dedos'
      ];
      const tone = k.includes('traición') || k.includes('miedo') || k.includes('peligro')
        ? 'la frase resuena como una amenaza'
        : k.includes('amor') || k.includes('querer')
          ? 'la palabra hace que su mirada se suavice'
          : 'la frase le deja un sabor amargo';
      return `*${chosen.name} ${verbs[Math.floor(Math.random() * verbs.length)]}.* ${userMessage.slice(0, 120)} ${tone}.`;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.settings.openRouterApiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'NEXUS'
        },
        body: JSON.stringify({
          model: state.settings.openRouterModel || 'openai/gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `${userMessage}` }
          ],
          temperature: 0.9,
          max_tokens: 420
        })
      });

      if (!response.ok) {
        throw new Error('OpenRouter no respondió correctamente');
      }

      const json = await response.json();
      return json?.choices?.[0]?.message?.content || 'La respuesta no llegó.';
    } catch (error) {
      const chosen = participants[Math.floor(Math.random() * participants.length)];
      return `*${chosen.name} se queda quieto, evaluando la frase.* ${userMessage.slice(0, 120)}`;
    }
  };

  const sendMessage = async () => {
    const text = sanitizeText(messageDraft);
    if (!activeChat || !text) return;

    const userMsg = {
      id: uid('msg'),
      author: 'user',
      text,
      timestamp: new Date().toISOString()
    };

    const nextChats = state.chats.map((chat) => chat.id === activeChat.id ? { ...chat, messages: [...chat.messages, userMsg] } : chat);
    setState((prev) => ({ ...prev, chats: nextChats }));
    setMessageDraft('');

    const chat = nextChats.find((item) => item.id === activeChat.id);
    const aiText = await buildAiResponse(chat, text);

    const npcMessages = chat.participants.map((charId, index) => {
      const character = state.characters.find((c) => c.id === charId);
      const relationGroup = chat.participants.filter((id) => id !== charId);
      const relationNote = relationGroup.length ? relationGroup.map((rid) => {
        const rel = character?.relations?.[rid] || { affinity: 0, status: 'Neutral' };
        return `${character.name} siente afinidad ${rel.affinity || 0} con ${state.characters.find((c) => c.id === rid)?.name || 'otro'}.`;
      }).join(' ') : '';

      return {
        id: uid('msg'),
        author: charId,
        text: `${aiText}${relationNote ? ` ${relationNote}` : ''}`,
        timestamp: new Date().toISOString(),
        index
      };
    });

    setState((prev) => {
      const updated = prev.chats.map((item) => {
        if (item.id !== activeChat.id) return item;
        return { ...item, messages: [...item.messages, ...npcMessages] };
      });
      return { ...prev, chats: updated };
    });

    if (state.settings.autoRelations) {
      for (const charId of chat.participants) {
        const source = state.characters.find((c) => c.id === charId);
        for (const targetId of chat.participants) {
          if (charId === targetId) continue;
          const delta = /traición|miedo|odio|rival|enemigo|peligro|apoyo|confianza|alianza|amor|secreto/i.test(text)
            ? (text.includes('traición') || text.includes('odio') || text.includes('enemigo') || text.includes('miedo') || text.includes('peligro') ? -5 : 5)
            : 0;
          if (delta) updateRelation(charId, targetId, delta, `Interacción de sala: ${text.slice(0, 80)}`);
        }
      }
    }

    const autoMemoryEvery = Number(state.settings.autoMemoryEvery || 4);
    const messagesCount = chat.messages.length + 1 + npcMessages.length;
    if (messagesCount % autoMemoryEvery === 0) {
      for (const participant of chat.participants.map((id) => state.characters.find((c) => c.id === id)).filter(Boolean)) {
        addMemory(participant.id, {
          summary: `${participant.name} recordó: ${text.slice(0, 120)}`,
          category: 'hecho_historico',
          relevance: 7,
          pinned: false,
          notes: 'Memoria auto-guardada'
        });
      }
    }
  };

  const toggleParticipant = (charId) => {
    setChatDraft((prev) => {
      const exists = prev.participants.includes(charId);
      return { ...prev, participants: exists ? prev.participants.filter((id) => id !== charId) : [...prev.participants, charId] };
    });
  };

  const renderRelationMatrix = () => {
    if (!state.characters.length) return <p className="empty">Crea personajes para ver la matriz.</p>;
    return state.characters.map((left) => (
      <div key={left.id} className="matrix-row">
        <strong>{left.name}</strong>
        <div className="matrix-strip">
          {state.characters.filter((right) => right.id !== left.id).map((right) => {
            const relation = left.relations?.[right.id] || { affinity: 0, status: 'Neutral', notes: '', history: [] };
            return (
              <div key={`${left.id}-${right.id}`} className="matrix-cell" title={`${left.name} → ${right.name}`}>
                <span>{relation.affinity ?? 0}</span>
                <small>{relation.status || 'Neutral'}</small>
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">N</div>
          <div>
            <h1>NEXUS</h1>
            <small>rol, universo y presencia narrativa</small>
          </div>
        </div>

        <div className="top-actions">
          <button className="button ghost" onClick={() => setSettingsOpen((prev) => !prev)}>Ajustes</button>
          <button className="button ghost" onClick={() => setState((prev) => ({ ...prev, activeChatId: prev.activeChatId }))}>Cómo me ven los NPCs</button>
          {installState.available && <button className="button primary" onClick={installApp}>Instalar App</button>}
          <button className="button danger" onClick={resetAll}>Borrar todo</button>
        </div>
      </header>

      <div className="section-tabs" aria-label="Secciones de NEXUS">
        <button
          className={`section-tab ${activeSection === 'mundo' ? 'active' : ''}`}
          onClick={() => setActiveSection('mundo')}
        >
          Mundo
        </button>
        <button
          className={`section-tab ${activeSection === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveSection('chat')}
        >
          Chat
        </button>
        <button
          className={`section-tab ${activeSection === 'personajes' ? 'active' : ''}`}
          onClick={() => setActiveSection('personajes')}
        >
          Personajes
        </button>
      </div>

      {activeSection === 'mundo' ? (
        <div className="layout-grid">
          <aside className="sidebar left-panel">
            <section className="panel">
              <h3>Universos</h3>
              <div className="stack">
                <input value={newUniverse.name} onChange={(e) => setNewUniverse((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del universo" />
                <textarea value={newUniverse.lore} onChange={(e) => setNewUniverse((prev) => ({ ...prev, lore: e.target.value }))} placeholder="Lore y reglas" rows={2} />
                <input value={newUniverse.tone} onChange={(e) => setNewUniverse((prev) => ({ ...prev, tone: e.target.value }))} placeholder="Tono narrativo" />
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setNewUniverse)} />
                <button className="button primary" onClick={addUniverse}>Crear universo</button>
              </div>
              <div className="card-list compact">
                {state.universes.map((uni) => (
                  <div key={uni.id} className={`card ${state.activeUniverseId === uni.id ? 'selected' : ''}`} onClick={() => setState((prev) => ({ ...prev, activeUniverseId: uni.id }))}>
                    {uni.image && <img src={uni.image} alt={uni.name} className="card-image" />}
                    <div className="card-body">
                      <strong>{uni.name}</strong>
                      <small>{(state.characters.filter((c) => c.universeId === uni.id)).length} personajes</small>
                    </div>
                    <button className="mini-button danger" onClick={(e) => { e.stopPropagation(); deleteUniverse(uni.id); }}>X</button>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main className="panel overview-panel">
            <h3>Visión general del mundo</h3>
            <div className="overview-grid">
              <div className="metric-card">
                <span>Universos</span>
                <strong>{state.universes.length}</strong>
              </div>
              <div className="metric-card">
                <span>Personajes</span>
                <strong>{state.characters.length}</strong>
              </div>
              <div className="metric-card">
                <span>Salas</span>
                <strong>{state.chats.length}</strong>
              </div>
            </div>

            {activeUniverse ? (
              <div className="world-details">
                <h4>{activeUniverse.name}</h4>
                <p>{activeUniverse.lore || 'Sin lore definido aún.'}</p>
                <div className="mini-badges">
                  {state.characters.filter((char) => char.universeId === activeUniverse.id).map((char) => (
                    <span key={char.id} className="mini-badge" onClick={() => setState((prev) => ({ ...prev, activeCharacterId: char.id }))}>
                      {char.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="empty">Selecciona un universo para ver su historia.</p>
            )}
          </main>

          <aside className="sidebar right-panel">
            <section className="panel">
              <h3>Personaje activo</h3>
              {activeCharacter ? (
                <div className="character-sheet">
                  {activeCharacter.image && <img src={activeCharacter.image} alt={activeCharacter.name} className="profile-image" />}
                  <h4>{activeCharacter.name}</h4>
                  <p><strong>Identidad:</strong> {activeCharacter.identity || 'Sin identidad'}</p>
                  <p><strong>Objetivo:</strong> {activeCharacter.goal || 'Sin objetivo'}</p>
                  <p><strong>Estilo:</strong> {activeCharacter.speechStyle || 'Natural'}</p>
                  <div className="field-block">
                    <strong>Vestimenta y Equipamiento</strong>
                    <p>{activeCharacter.outfit || 'Sin equipamiento'}</p>
                  </div>
                  <div className="field-block">
                    <strong>Físico y Fisonomía</strong>
                    <p>{activeCharacter.physical || 'Sin descripción física'}</p>
                  </div>
                </div>
              ) : <p className="empty">Selecciona un personaje.</p>}
            </section>

            <section className="panel">
              <h3>Matriz de relaciones</h3>
              {renderRelationMatrix()}
            </section>

            {settingsOpen && (
              <section className="panel settings-panel">
                <h3>Ajustes</h3>
                <div className="stack">
                  <label>
                    Tema
                    <select value={state.settings.theme} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, theme: e.target.value } }))}>
                      <option value="obsidian">Obsidiana Pura</option>
                      <option value="midnight">Medianoche Ciber</option>
                      <option value="sepia">Sepia Penumbra</option>
                      <option value="grafito">Grafito Nórdico</option>
                    </select>
                  </label>
                  <label>
                    Tipografía
                    <select value={state.settings.fontScale} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, fontScale: e.target.value } }))}>
                      <option value="small">Pequeña</option>
                      <option value="comfortable">Mediana</option>
                      <option value="large">Cómoda</option>
                      <option value="wide">Amplia</option>
                    </select>
                  </label>
                  <label>
                    Auto relaciones
                    <input type="checkbox" checked={state.settings.autoRelations ?? true} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, autoRelations: e.target.checked } }))} />
                  </label>
                  <label>
                    Guardar memoria cada N mensajes
                    <select value={state.settings.autoMemoryEvery || 4} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, autoMemoryEvery: Number(e.target.value) } }))}>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                  <label>
                    OpenRouter API Key
                    <input type="password" value={state.settings.openRouterApiKey || ''} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, openRouterApiKey: e.target.value } }))} />
                  </label>
                  <label>
                    Modelo
                    <select value={state.settings.openRouterModel || 'openai/gpt-4o-mini'} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, openRouterModel: e.target.value } }))}>
                      <option value="openai/gpt-4o-mini">OpenAI GPT-4o mini</option>
                      <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                      <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B Free</option>
                      <option value="cognitivecomputations/dolphin-mixtral-8x7b">Dolphin Mixtral</option>
                    </select>
                  </label>
                  <button className="button primary" onClick={() => setSettingsOpen(false)}>Guardar ajustes</button>
                </div>
              </section>
            )}
          </aside>
        </div>
      ) : activeSection === 'personajes' ? (
        <div className="layout-grid">
          <aside className="sidebar left-panel">
            <section className="panel">
              <h3>Personajes</h3>
              <div className="stack">
                <input value={newCharacter.name} onChange={(e) => setNewCharacter((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del personaje" />
                <select value={newCharacter.universeId || state.activeUniverseId || ''} onChange={(e) => setNewCharacter((prev) => ({ ...prev, universeId: e.target.value }))}>
                  <option value="">Sin universo</option>
                  {state.universes.map((uni) => <option key={uni.id} value={uni.id}>{uni.name}</option>)}
                </select>
                <input value={newCharacter.identity} onChange={(e) => setNewCharacter((prev) => ({ ...prev, identity: e.target.value }))} placeholder="Identidad" />
                <input value={newCharacter.goal} onChange={(e) => setNewCharacter((prev) => ({ ...prev, goal: e.target.value }))} placeholder="Objetivo" />
                <input value={newCharacter.speechStyle} onChange={(e) => setNewCharacter((prev) => ({ ...prev, speechStyle: e.target.value }))} placeholder="Estilo de habla" />
                <textarea value={newCharacter.description} onChange={(e) => setNewCharacter((prev) => ({ ...prev, description: e.target.value }))} placeholder="Trasfondo" rows={2} />
                <textarea value={newCharacter.outfit} onChange={(e) => setNewCharacter((prev) => ({ ...prev, outfit: e.target.value }))} placeholder="Vestimenta y equipo" rows={2} />
                <textarea value={newCharacter.physical} onChange={(e) => setNewCharacter((prev) => ({ ...prev, physical: e.target.value }))} placeholder="Físico y fisonomía" rows={2} />
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setNewCharacter)} />
                <button className="button primary" onClick={addCharacter}>Crear personaje</button>
              </div>
              <div className="card-list compact">
                {state.characters.map((char) => (
                  <div key={char.id} className={`card ${state.activeCharacterId === char.id ? 'selected' : ''}`} onClick={() => setState((prev) => ({ ...prev, activeCharacterId: char.id }))}>
                    {char.image && <img src={char.image} alt={char.name} className="card-image" />}
                    <div className="card-body">
                      <strong>{char.name}</strong>
                      <small>{char.identity || 'Sin identidad'}</small>
                    </div>
                    <button className="mini-button danger" onClick={(e) => { e.stopPropagation(); deleteCharacter(char.id); }}>X</button>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main className="panel directory-panel">
            <h3>Directorio de personajes</h3>
            <div className="directory-grid">
              {state.characters.map((char) => (
                <div key={char.id} className={`directory-card ${state.activeCharacterId === char.id ? 'selected' : ''}`} onClick={() => setState((prev) => ({ ...prev, activeCharacterId: char.id }))}>
                  {char.image && <img src={char.image} alt={char.name} className="directory-image" />}
                  <div>
                    <strong>{char.name}</strong>
                    <p>{char.identity || 'Sin identidad'}</p>
                  </div>
                </div>
              ))}
            </div>
          </main>

          <aside className="sidebar right-panel">
            <section className="panel">
              <h3>Personaje activo</h3>
              {activeCharacter ? (
                <div className="character-sheet">
                  {activeCharacter.image && <img src={activeCharacter.image} alt={activeCharacter.name} className="profile-image" />}
                  <h4>{activeCharacter.name}</h4>
                  <p><strong>Identidad:</strong> {activeCharacter.identity || 'Sin identidad'}</p>
                  <p><strong>Objetivo:</strong> {activeCharacter.goal || 'Sin objetivo'}</p>
                  <p><strong>Estilo:</strong> {activeCharacter.speechStyle || 'Natural'}</p>
                  <div className="field-block">
                    <strong>Trasfondo</strong>
                    <p>{activeCharacter.description || 'Sin trasfondo definido'}</p>
                  </div>
                  <div className="field-block">
                    <strong>Vestimenta y Equipamiento</strong>
                    <p>{activeCharacter.outfit || 'Sin equipamiento'}</p>
                  </div>
                  <div className="field-block">
                    <strong>Memorias</strong>
                    <div className="memory-list">
                      {(activeCharacter.memories || []).slice(0, 5).map((mem) => (
                        <div key={mem.id} className="memory-item" style={{ borderLeft: `4px solid ${categoryPalette[mem.category] || '#888'}` }}>
                          <span className="tag" style={{ background: categoryPalette[mem.category] || '#888' }}>{mem.category}</span>
                          <strong>{mem.relevance || 1}/10</strong>
                          <p>{mem.summary}</p>
                          {mem.pinned && <small>Pinned</small>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : <p className="empty">Selecciona un personaje.</p>}
            </section>

            <section className="panel">
              <h3>Matriz de relaciones</h3>
              {renderRelationMatrix()}
            </section>
          </aside>
        </div>
      ) : (
        <div className="layout-grid">
          <aside className="sidebar left-panel">
            <section className="panel">
              <h3>Universos</h3>
              <div className="stack">
                <input value={newUniverse.name} onChange={(e) => setNewUniverse((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del universo" />
                <textarea value={newUniverse.lore} onChange={(e) => setNewUniverse((prev) => ({ ...prev, lore: e.target.value }))} placeholder="Lore y reglas" rows={2} />
                <input value={newUniverse.tone} onChange={(e) => setNewUniverse((prev) => ({ ...prev, tone: e.target.value }))} placeholder="Tono narrativo" />
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setNewUniverse)} />
                <button className="button primary" onClick={addUniverse}>Crear universo</button>
              </div>
              <div className="card-list compact">
                {state.universes.map((uni) => (
                  <div key={uni.id} className={`card ${state.activeUniverseId === uni.id ? 'selected' : ''}`} onClick={() => setState((prev) => ({ ...prev, activeUniverseId: uni.id }))}>
                    {uni.image && <img src={uni.image} alt={uni.name} className="card-image" />}
                    <div className="card-body">
                      <strong>{uni.name}</strong>
                      <small>{(state.characters.filter((c) => c.universeId === uni.id)).length} personajes</small>
                    </div>
                    <button className="mini-button danger" onClick={(e) => { e.stopPropagation(); deleteUniverse(uni.id); }}>X</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h3>Personajes</h3>
              <div className="stack">
                <input value={newCharacter.name} onChange={(e) => setNewCharacter((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del personaje" />
                <select value={newCharacter.universeId || state.activeUniverseId || ''} onChange={(e) => setNewCharacter((prev) => ({ ...prev, universeId: e.target.value }))}>
                  <option value="">Sin universo</option>
                  {state.universes.map((uni) => <option key={uni.id} value={uni.id}>{uni.name}</option>)}
                </select>
                <input value={newCharacter.identity} onChange={(e) => setNewCharacter((prev) => ({ ...prev, identity: e.target.value }))} placeholder="Identidad" />
                <input value={newCharacter.goal} onChange={(e) => setNewCharacter((prev) => ({ ...prev, goal: e.target.value }))} placeholder="Objetivo" />
                <input value={newCharacter.speechStyle} onChange={(e) => setNewCharacter((prev) => ({ ...prev, speechStyle: e.target.value }))} placeholder="Estilo de habla" />
                <textarea value={newCharacter.description} onChange={(e) => setNewCharacter((prev) => ({ ...prev, description: e.target.value }))} placeholder="Trasfondo" rows={2} />
                <textarea value={newCharacter.outfit} onChange={(e) => setNewCharacter((prev) => ({ ...prev, outfit: e.target.value }))} placeholder="Vestimenta y equipo" rows={2} />
                <textarea value={newCharacter.physical} onChange={(e) => setNewCharacter((prev) => ({ ...prev, physical: e.target.value }))} placeholder="Físico y fisonomía" rows={2} />
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setNewCharacter)} />
                <button className="button primary" onClick={addCharacter}>Crear personaje</button>
              </div>
              <div className="card-list compact">
                {filteredCharacters.map((char) => (
                  <div key={char.id} className={`card ${state.activeCharacterId === char.id ? 'selected' : ''}`} onClick={() => setState((prev) => ({ ...prev, activeCharacterId: char.id }))}>
                    {char.image && <img src={char.image} alt={char.name} className="card-image" />}
                    <div className="card-body">
                      <strong>{char.name}</strong>
                      <small>{char.identity || 'Sin identidad'}</small>
                    </div>
                    <button className="mini-button danger" onClick={(e) => { e.stopPropagation(); deleteCharacter(char.id); }}>X</button>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main className="chat-panel">
            <section className="panel chat-header-panel">
              <div className="chat-header">
                <div>
                  <h3>{activeChat ? activeChat.name : 'Nueva sala'}</h3>
                  <small>{activeChat ? activeChat.scene || 'Sin escena' : 'Selecciona un chat'}</small>
                </div>
                <div className="header-actions">
                  {activeChat && <button className="button ghost" onClick={() => clearMessagesInChat(activeChat.id)}>Vaciar chat</button>}
                  {activeChat && <button className="button danger" onClick={() => deleteChat(activeChat.id)}>Eliminar sala</button>}
                </div>
              </div>

              <div className="chat-form">
                <input value={chatDraft.name} onChange={(e) => setChatDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del chat" />
                <select value={chatDraft.type} onChange={(e) => setChatDraft((prev) => ({ ...prev, type: e.target.value }))}>
                  <option value="group">Grupal</option>
                  <option value="solo">Individual</option>
                </select>
                <select value={chatDraft.universeId || state.activeUniverseId || ''} onChange={(e) => setChatDraft((prev) => ({ ...prev, universeId: e.target.value }))}>
                  <option value="">Sin universo</option>
                  {state.universes.map((uni) => <option key={uni.id} value={uni.id}>{uni.name}</option>)}
                </select>
                <input value={chatDraft.scene} onChange={(e) => setChatDraft((prev) => ({ ...prev, scene: e.target.value }))} placeholder="Escena activa" />
                <textarea value={chatDraft.description} onChange={(e) => setChatDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="Descripción del chat" rows={2} />
                <textarea value={chatDraft.openingDialogue} onChange={(e) => setChatDraft((prev) => ({ ...prev, openingDialogue: e.target.value }))} placeholder="Diálogo de inicio" rows={2} />
                <div className="participant-picker">
                  {state.characters.map((char) => (
                    <label key={char.id} className="choice-pill">
                      <input type="checkbox" checked={chatDraft.participants.includes(char.id)} onChange={() => toggleParticipant(char.id)} />
                      {char.name}
                    </label>
                  ))}
                </div>
                <button className="button primary" onClick={addChat}>Crear / abrir chat</button>
              </div>
            </section>

            {activeChat ? (
              <>
                <div className="chat-scene-meta">
                  <div className="scene-box">
                    <strong>Escena</strong>
                    <p>{activeChat.scene || 'Sin escena definida'}</p>
                  </div>
                  <div className="scene-box">
                    <strong>Diálogo inicial</strong>
                    <p>{activeChat.openingDialogue || 'No hay inicio narrativo'}</p>
                  </div>
                </div>

                <div className="chat-thread">
                  {activeChat.messages.map((message) => {
                    const isUser = message.author === 'user';
                    const author = isUser ? 'Tú' : state.characters.find((c) => c.id === message.author)?.name || 'NPC';
                    return (
                      <div key={message.id} className={`message ${isUser ? 'user' : 'npc'}`}>
                        <div className="message-meta">
                          <strong>{author}</strong>
                          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p>{message.text}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="composer">
                  <textarea value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} rows={4} placeholder="Escribe la escena o el diálogo..." />
                  <div className="quick-format-bar">
                    <button onClick={() => setMessageDraft((prev) => `${prev} *Se inclina hacia delante.*`)}>Acción</button>
                    <button onClick={() => setMessageDraft((prev) => `${prev} *¿Qué quieres de mí?*`)}>Diálogo</button>
                    <button onClick={() => setMessageDraft((prev) => `${prev} [Físico]`)}>Físico</button>
                  </div>
                  <button className="button primary" onClick={sendMessage}>Enviar</button>
                </div>
              </>
            ) : (
              <div className="empty-state">Crea o selecciona una sala para comenzar.</div>
            )}
          </main>

          <aside className="sidebar right-panel">
            <section className="panel">
              <h3>Personaje activo</h3>
              {activeCharacter ? (
                <div className="character-sheet">
                  {activeCharacter.image && <img src={activeCharacter.image} alt={activeCharacter.name} className="profile-image" />}
                  <h4>{activeCharacter.name}</h4>
                  <p><strong>Identidad:</strong> {activeCharacter.identity || 'Sin identidad'}</p>
                  <p><strong>Objetivo:</strong> {activeCharacter.goal || 'Sin objetivo'}</p>
                  <p><strong>Estilo:</strong> {activeCharacter.speechStyle || 'Natural'}</p>
                  <div className="field-block">
                    <strong>Vestimenta y Equipamiento</strong>
                    <p>{activeCharacter.outfit || 'Sin equipamiento'}</p>
                  </div>
                  <div className="field-block">
                    <strong>Físico y Fisonomía</strong>
                    <p>{activeCharacter.physical || 'Sin descripción física'}</p>
                  </div>
                  <div className="field-block">
                    <strong>Memorias</strong>
                    <div className="memory-list">
                      {(activeCharacter.memories || []).slice(0, 5).map((mem) => (
                        <div key={mem.id} className="memory-item" style={{ borderLeft: `4px solid ${categoryPalette[mem.category] || '#888'}` }}>
                          <span className="tag" style={{ background: categoryPalette[mem.category] || '#888' }}>{mem.category}</span>
                          <strong>{mem.relevance || 1}/10</strong>
                          <p>{mem.summary}</p>
                          {mem.pinned && <small>Pinned</small>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : <p className="empty">Selecciona un personaje.</p>}
            </section>

            <section className="panel">
              <h3>Matriz de relaciones</h3>
              {renderRelationMatrix()}
            </section>

            {settingsOpen && (
              <section className="panel settings-panel">
                <h3>Ajustes</h3>
                <div className="stack">
                  <label>
                    Tema
                    <select value={state.settings.theme} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, theme: e.target.value } }))}>
                      <option value="obsidian">Obsidiana Pura</option>
                      <option value="midnight">Medianoche Ciber</option>
                      <option value="sepia">Sepia Penumbra</option>
                      <option value="grafito">Grafito Nórdico</option>
                    </select>
                  </label>
                  <label>
                    Tipografía
                    <select value={state.settings.fontScale} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, fontScale: e.target.value } }))}>
                      <option value="small">Pequeña</option>
                      <option value="comfortable">Mediana</option>
                      <option value="large">Cómoda</option>
                      <option value="wide">Amplia</option>
                    </select>
                  </label>
                  <label>
                    Auto relaciones
                    <input type="checkbox" checked={state.settings.autoRelations ?? true} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, autoRelations: e.target.checked } }))} />
                  </label>
                  <label>
                    Guardar memoria cada N mensajes
                    <select value={state.settings.autoMemoryEvery || 4} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, autoMemoryEvery: Number(e.target.value) } }))}>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                  <label>
                    OpenRouter API Key
                    <input type="password" value={state.settings.openRouterApiKey || ''} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, openRouterApiKey: e.target.value } }))} />
                  </label>
                  <label>
                    Modelo
                    <select value={state.settings.openRouterModel || 'openai/gpt-4o-mini'} onChange={(e) => setState((prev) => ({ ...prev, settings: { ...prev.settings, openRouterModel: e.target.value } }))}>
                      <option value="openai/gpt-4o-mini">OpenAI GPT-4o mini</option>
                      <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                      <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B Free</option>
                      <option value="cognitivecomputations/dolphin-mixtral-8x7b">Dolphin Mixtral</option>
                    </select>
                  </label>
                  <button className="button primary" onClick={() => setSettingsOpen(false)}>Guardar ajustes</button>
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
