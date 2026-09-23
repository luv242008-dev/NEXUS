# NEXUS — Estudio de Rol y Psicología Profunda

NEXUS es una PWA de roleplay narrativo con personajes persistentes, universos, relaciones asimétricas y memoria contextual.

## Continuidad narrativa

La capa incremental de continuidad conserva la interfaz existente y añade:

- consolidación automática de memorias cada X mensajes, sin reprocesar mensajes ya consolidados;
- evolución gradual y asimétrica de relaciones basada en acontecimientos significativos;
- separación entre conocimiento permitido y `Knowledge Blind Spots`;
- estado narrativo persistente por sala;
- perfil editable de «Cómo me ven los NPCs»;
- acciones confirmadas e independientes para «Vaciar chat» y «Eliminar sala»;
- preparación de contexto jerarquizado mediante `prepareNarrativeContext` para priorizar identidad, conocimiento, puntos ciegos, relaciones, memorias, continuidad reciente, escena y lore.

Los datos siguen almacenándose localmente en `localStorage`, igual que la aplicación existente. Las actualizaciones automáticas no bloquean la edición manual.
