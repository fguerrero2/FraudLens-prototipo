# Usabilidad de FraudLens

Se aplican las [10 heurísticas de Jakob Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/) como criterios de revisión, junto con la identidad de VISUAL_IDENTITY.md. Las decisiones y ejemplos siguientes corresponden a los flujos de este proyecto.

| Criterio | Aplicación en FraudLens |
| --- | --- |
| 1. Estado visible | Organización persistente, carga y guardado visibles, última actualización web, resultados anunciados. |
| 2. Lenguaje familiar | Acciones con verbo y objeto; recomendación automática y revisión humana diferenciadas; el score no se presenta como probabilidad. |
| 3. Control del usuario | Cancelación, vuelta al listado, protección de evidencia sin guardar y corrección mediante nueva revisión. |
| 4. Consistencia | Violeta de marca, Inter para interfaz e IBM Plex Mono para IDs; temas claro y oscuro y jerarquía de botones. |
| 5. Prevención de errores | Confirmación de suspensión y revocación web y resolución de alerta móvil; controles deshabilitados durante solicitudes y evidencia obligatoria. |
| 6. Reconocimiento | Permisos mediante casillas en web; organización visible y resultados de revisión seleccionables en móvil. |
| 7. Eficiencia | Filtros persistentes al refrescar, ordenación por teclado, atajo / para búsqueda web y navegación inferior por permisos móvil. |
| 8. Diseño simple | Campos PaySim plegables; tarjetas móviles y secciones de resumen, transacciones, alertas y ayuda. |
| 9. Recuperación | Errores visibles, reintento de carga, conservación de datos cuando falla el envío; regreso al acceso al expirar sesión móvil. |
| 10. Ayuda | Ayuda dentro de ambas interfaces: cambio de organización, revisión, significado del score y recuperación. |

## Controles e identidad

Objetivo de tamaño: 44 px web y 48 unidades lógicas móvil. Foco visible y ordenación accesible por teclado. Botones primarios violetas; secundarios neutros. Texto propio en inglés y datos de API conservados en su idioma. No se cambian los valores de contratos ni los logos. Las fuentes móviles se incluyen en el bundle y usan las mismas candidatas tipográficas de la web.

La protección web cubre edición de formularios, cierre, navegación principal, salida y cambio de organización. El navegador confirma el descarte. Un guardado exitoso limpia la marca de borrador; un error conserva el formulario. La protección móvil cubre evidencia escrita al salir, cambiar de pantalla u organización.

Estas mejoras no equivalen a una certificación de accesibilidad ni reemplazan las pruebas con usuarios. Validar en dispositivos reales, con lector de pantalla, texto ampliado y flujos de cada rol antes de publicar.

## Verificación realizada

Build de Vite y exportación Hermes Android/iOS correctos. Prueba de navegador con API simulada: organización visible, descarte cancelado conserva borrador, Escape también solicita confirmación, Tab queda dentro del diálogo, ayuda abre/cierra y cambio de tema en pantalla de 390 px. Docker web reconstruido. No se modificaron datos reales con estas pruebas.

## Revisión 2026-10-18

| Heurística | Cambio |
|---|---|
| 1. Estado visible | Paginación con "Page N of M" en texto (antes un botón que no hacía nada); el botón Refresh mantiene su texto y gira el ícono mientras carga. |
| 4. Consistencia | Un solo sistema de botones en web y móvil. El cambio de tema y la ayuda están en la barra de sesión en todas las pantallas (antes el tema sólo aparecía en el dashboard). Textos que habían quedado en español en la interfaz se pasaron a inglés; el estado de la transacción en el detalle usa la misma etiqueta que la tabla. |
| 5. Prevención de errores | Confirmación también para resolver alertas en web (ya existía en móvil). Los botones destructivos (Suspend, Deactivate, Revoke) usan la variante `btn-danger`. |
| 6. Reconocimiento | Administración con etiquetas visibles en todos los selectores, descripciones por sección y listas con nombre, detalle y estado separados. |
| 7. Eficiencia | Botón Copy para la credencial de API. Indicador `/` visible en la búsqueda. |
| 8. Diseño simple | La grilla de "Allowed actions" tenía el texto partido letra por letra: la regla `.admin-section input { flex: 1; min-width: 180px }` también se aplicaba a las casillas. Ahora la casilla mide 20 px y la etiqueta ocupa el resto de la celda. |
| 10. Ayuda | Help pasó de un botón suelto al pie de la página a la barra de sesión y a la pantalla de acceso. |

Verificación: build de Vite y capturas con Chrome headless contra una API simulada, a 1440 px y 390 px, en claro y oscuro (acceso, dashboard, detalle y administración). Medición en 390 px: todos los botones de la barra y del encabezado miden 44 px de alto y los que comparten fila tienen el mismo ancho. Móvil: exportación Hermes Android e iOS correcta; **no se probó en dispositivo ni en emulador**.
