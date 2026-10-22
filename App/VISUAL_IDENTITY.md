# Identidad visual del frontend

Implementación basada en la copia local de `facMolina/FraudLens`:

- `docs/05-producto/identidad/propuesta-canva.md`: decisión final del 2026-09-09, opción B (anomalía en grilla).
- `docs/05-producto/identidad/paleta.md`: colores y requisitos de contraste.
- `docs/05-producto/identidad-visual.md`: interfaz en inglés, modos claro y oscuro, cifras tabulares y diferenciación de riesgos.

Los logos completos y el favicon se copian sin modificaciones desde los assets oficiales de `docs/05-producto/identidad/logo/`, reconstruidos a partir del PPTX de Canva. Se alternan los logos según el tema: puntos #6B21A8, anomalía #9333EA y wordmark #0D0D10 en claro; puntos #7E22CE, anomalía #C084FC y wordmark blanco en oscuro. Según el README de origen, los PNG usan Liberation Sans Bold como sustitución de Arimo Bold.

El botón visible “Dark mode” / “Light mode” cambia el tema y expone su estado con `aria-pressed`. `src/theme.js` aplica la preferencia antes del render de React y tolera almacenamiento deshabilitado.

Se usa Inter para la interfaz e IBM Plex Mono para IDs, como elección de implementación entre las candidatas documentadas, pendiente de la definición tipográfica del equipo. Las fuentes se cargan desde Google Fonts con alternativas locales sans-serif y monospace.

Los tokens están en `src/styles.css`. La preferencia de tema se guarda en `localStorage`; sin preferencia guardada se toma el modo del sistema. Marca: #9333EA claro y #A855F7 oscuro. En oscuro, el rojo de texto se aclara a #F87171 y el verde a #22C55E para mantener contraste sobre los paneles y chips reales. Los cuatro niveles incluyen una forma y su etiqueta.

Los textos propios de la interfaz están en inglés. Los datos, razones y errores devueltos por la API se muestran en su idioma original. Los contratos y valores de la API no se traducen.

Validación: `npm run build`, `git diff --check` y cálculo WCAG de texto, marca y etiquetas sobre sus fondos en ambos modos (todos >= 4.5:1). No se realizó validación visual en navegador en esta sesión.


Actualización 2026-09-22: el enlace de edición de Canva no fue accesible directamente. La implementación usa las definiciones y los assets exportados que están en el repo local; no se verificaron posibles cambios posteriores de la presentación online.

## Actualización 2026-10-18 — paleta única y sistema de botones

- `src/styles.css` se reescribió: se eliminaron colores fuera de la paleta (`#101728`, `#5a63cb`, fondos `white` que rompían el modo oscuro). **Todo color sale de los tokens de `:root`**, tomados de `paleta.md`.
- En oscuro, el relleno del botón primario usa `#9333EA` (5.38:1 con texto blanco) y no `#A855F7`, que con texto blanco no llega a 4.5:1. `#A855F7` queda para texto e íconos de marca sobre fondo oscuro.
- Los bordes de controles usan `#71717A` (≥ 3:1 sobre panel en ambos modos, WCAG 1.4.11).
- Botones: una sola clase base `.btn` (44 px de alto, 14 px, semibold, radio 8 px) con variantes `btn-primary`, `btn-danger`, `btn-ghost` y `btn-icon`. Los botones que comparten fila tienen la misma altura; en pantallas de hasta 760 px reparten el ancho por partes iguales.
- El mapa de calor usa la escala de riesgo de la paleta y el violeta de marca en los marcadores.
- La app móvil (`mobile/App.js`) usa la misma paleta, el logo oficial según el tema (`mobile/assets/`), insignias de riesgo y decisión con forma + color + texto, y un solo componente `Button` (48 unidades de alto) con filas de ancho equitativo.
