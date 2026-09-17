# Identidad visual del frontend

Implementación basada en la copia local de `facMolina/FraudLens`:

- `docs/05-producto/identidad/propuesta-canva.md`: decisión final del 2026-09-09, opción B (anomalía en grilla).
- `docs/05-producto/identidad/paleta.md`: colores y requisitos de contraste.
- `docs/05-producto/identidad-visual.md`: interfaz en inglés, modos claro y oscuro, cifras tabulares y diferenciación de riesgos.

El isotipo SVG reproduce la grilla 3×3 con ocho círculos de radio 8 y la anomalía de radio 12 en (78,22). El wordmark se compone como texto `FraudLens`; la fuente exacta del wordmark del board no está especificada en los archivos locales.

Se usa Inter para la interfaz e IBM Plex Mono para IDs, como elección de implementación entre las candidatas documentadas, pendiente de la definición tipográfica del equipo. Las fuentes se cargan desde Google Fonts con alternativas locales sans-serif y monospace.

Los tokens están en `src/styles.css`. La preferencia de tema se guarda en `localStorage`; sin preferencia guardada se toma el modo del sistema. Marca: #9333EA claro y #A855F7 oscuro. En oscuro, el rojo de texto se aclara a #F87171 y el verde a #22C55E para mantener contraste sobre los paneles y chips reales. Los cuatro niveles incluyen una forma y su etiqueta.

Los textos propios de la interfaz están en inglés. Los datos, razones y errores devueltos por la API se muestran en su idioma original. Los contratos y valores de la API no se traducen.

Validación: `npm run build`, `git diff --check` y cálculo WCAG de texto, marca y etiquetas sobre sus fondos en ambos modos (todos >= 4.5:1). No se realizó validación visual en navegador en esta sesión.
