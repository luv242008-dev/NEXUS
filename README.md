# NEXUS — Estudio de Rol y Psicología Profunda

NEXUS es una PWA de roleplay narrativo con personajes persistentes, universos, relaciones asimétricas y memoria contextual.

## Contexto completo y carga de imágenes

La aplicación mantiene la conversación completa de cada sala en `localStorage`. Antes de cada petición a OpenRouter, la capa `src/nexusAiBridge.js` añade al contexto del modelo la conversación completa desde el primer mensaje, la sala, el universo, los personajes presentes, relaciones, memorias, conocimiento permitido, puntos ciegos y el estado narrativo. Así la IA no limita la continuidad a los últimos cuatro mensajes.

Los campos de imagen existentes usan `accept="image/*"`. En ordenador permiten elegir archivos y en móvil abren el selector de archivos o la galería, según el dispositivo y el navegador. Las imágenes se guardan como datos locales y siguen funcionando con la PWA.

## Continuidad narrativa

La capa incremental de continuidad conserva la interfaz existente y añade consolidación de memorias, evolución gradual de relaciones, blind spots, estado narrativo persistente y acciones confirmadas para vaciar o eliminar salas.
