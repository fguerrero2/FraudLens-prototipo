# Evaluación de fraude del prototipo

El experimento compara el motor de reglas corregido, esas mismas reglas con un umbral de revisión seleccionado en validación, un modelo estadístico de anomalías y un control que siempre predice operación legítima. No cambia los umbrales del servidor ni incorpora el modelo experimental a las decisiones de la aplicación.

## Reproducir

Desde Backend:

```sh
npm test
npm run evaluate
```

Genera `evaluation/results/report.json` y `predictions.jsonl`. El conjunto sintético tiene 1.800 eventos, semilla 20260910 y etiquetas asignadas por escenarios antes de calcular los puntajes. El informe incluye hash SHA-256 del conjunto, parámetros del modelo y límites temporales. Dos ejecuciones con los mismos datos y código producen los mismos archivos.

Para promover el modelo estadistico al backend despues de evaluar un dataset anonimizado:

```sh
npm run evaluate -- /ruta/dataset-normalizado.jsonl evaluation/results/credit-card
npm run model:promote -- evaluation/results/credit-card/report.json evaluation/results/fraud-model.json
FRAUD_MODEL_PATH=./evaluation/results/fraud-model.json npm run start:dev
```

El artefacto se entrena con el 60% cronologico, ajusta el umbral con el 20% de validacion y nunca usa las etiquetas del 20% de test. El servidor solo infiere y conserva el motor heuristico como fallback si `FRAUD_MODEL_PATH` no esta configurada.

Los CSV descargados de Kaggle deben convertirse a JSONL normalizado antes de evaluar. En los archivos presentes, entrenamiento usa `id`, `Amount` y `Class`; validacion usa `transaction_id`, `amount` y `is_fraud`; test usa `trans_num`, `amt` e `is_fraud`. Los timestamps se generan de forma monotona por particion porque entrenamiento y validacion no incluyen fecha utilizable en el esquema actual. Los campos de contexto que no existan se dejan vacios o con un valor constante, sin inventar historial. Los tres enlaces de referencia son: [entrenamiento](https://www.kaggle.com/datasets/nelgiriyewithana/credit-card-fraud-detection-dataset-2023), [validacion](https://www.kaggle.com/datasets/miadul/credit-card-fraud-detection-dataset) y [test](https://www.kaggle.com/datasets/kartik2112/fraud-detection).

En este repositorio, el comando reproducible es:

```sh
npm run prepare:datasets -- ../Datasets/entrenamiento/creditcard_2023.csv ../Datasets/validacion/credit_card_fraud_10k.csv ../Datasets/test/fraudTest.csv evaluation/results/real-datasets
NODE_OPTIONS=--max-old-space-size=8192 npm run evaluate:datasets -- evaluation/results/real-datasets/train.jsonl evaluation/results/real-datasets/validation.jsonl evaluation/results/real-datasets/test.jsonl evaluation/results/real-datasets/report.json
```

La corrida actual produjo F1 de prueba `0.0113` y no debe promoverse al backend. Las variables compartidas entre los tres CSV pierden demasiada señal (pais/dispositivo son constantes en entrenamiento y test); antes de desplegar hay que entrenar con features compatibles entre particiones o mantener el fallback heuristico.

Para evaluar otro conjunto:

```sh
npm run evaluate -- /ruta/dataset.jsonl /ruta/resultados
```

Cada línea es un objeto JSON con `transactionId`, `userId`, `timestamp` ISO, `amount`, `currency`, `category`, `merchant`, `country`, `isFraud` (true, false o null). Opcionales: `deviceId`, `operationType`, `oldBalanceOrig`, `newBalanceOrig`, `oldBalanceDest`, `newBalanceDest`.

`null` significa sin resolución: el evento aporta historial, pero nunca se considera legítimo por defecto ni se incluye en las métricas. Los IDs deben ser únicos. Se requieren al menos 30 eventos y ambas clases entre los casos etiquetados de validación y prueba. Cada moneda necesita al menos dos eventos de entrenamiento. Se rechazan conjuntos insuficientes en vez de presentar métricas engañosas.

Para extraer eventos y sus últimas revisiones de la base configurada en DATABASE_URL:

```sh
EVALUATION_TENANT_ID=<uuid> npm run evaluation:export -- /ruta/dataset.jsonl
```

La exportación es de solo lectura, incluye los eventos pendientes para reconstruir el historial y no sobrescribe un archivo existente. Contiene identificadores y datos de transacciones: usar datos sintéticos o anonimizados para publicar el trabajo. Las revisiones no constituyen verdad infalible y los casos que decide revisar un analista pueden sesgar la muestra.

## Protocolo

- Separación cronológica 60% entrenamiento / 20% validación / 20% prueba por timestamps únicos. Los eventos simultáneos quedan en la misma partición y no se usan como pasado entre sí.
- Historial de cada usuario y moneda limitado a los últimos 200 eventos estrictamente anteriores. Frecuencia calculada sobre toda la ventana previa de 60 minutos.
- El modelo de anomalías aprende por moneda la media y desviación de cinco variables exclusivamente del entrenamiento, sin etiquetas: logaritmo del monto, relación con el promedio del usuario, frecuencia, país nuevo y dispositivo nuevo. Su salida es distancia estandarizada, no probabilidad de fraude. Es una referencia sencilla; no es Isolation Forest.
- El umbral del modelo y un umbral alternativo de revisión de las reglas se seleccionan por F1 en validación. El umbral de bloqueo permanece en 85 y la excepción de monto mínimo se conserva con su control de frecuencia. Empates favorecen el umbral más alto.
- La prueba se puntúa con parámetros fijos. Su historial puede incorporar eventos anteriores de prueba, sin usar sus etiquetas: reproduce un flujo de eventos. No se reentrena el modelo con ellos.
- Positivo significa que el sistema recomienda revisar o bloquear; no que haya fraude confirmado. Se reportan TP, FP, TN, FN, precisión, recall, F1, tasa de falsos positivos y proporción de alertas.

## Resultado sintético inicial

Prueba: 360 eventos, 48 etiquetados como fraude.

| Variante | Precisión | Recall | F1 | Falsas alarmas |
| --- | ---: | ---: | ---: | ---: |
| Reglas, revisión desde 60 | 19,35% | 12,50% | 0,152 | 25 |
| Reglas, revisión desde 7 (seleccionado en validación) | 37,50% | 87,50% | 0,525 | 70 |
| Anomalías estadísticas | 60,53% | 47,92% | 0,535 | 15 |

El resultado muestra el compromiso entre detección y falsas alarmas. No justifica bajar el umbral del servidor a 7: el conjunto es sintético y su distribución fue diseñada para escenarios del experimento. No demuestra rendimiento sobre clientes reales ni sobre PaySim. El siguiente paso académico es congelar un conjunto etiquetado independiente, adaptar sus campos sin inventar datos ausentes y repetir el protocolo. Si se ajusta el desarrollo mirando la prueba, debe reservarse una nueva prueba.

## Cambios del motor y revisión humana

Se eliminó el ruido derivado del ID. El historial se filtra por moneda y fecha anterior. Antes de omitir el análisis por monto mínimo, se cuentan las operaciones previas en la ventana: con cinco o más, la operación actual se analiza y como mínimo se deriva a revisión. No sustituye controles de concurrencia: solicitudes simultáneas aún pueden leer el mismo historial; tampoco agrega monedas diferentes ni eventos con idéntico timestamp.

`PUT /api/v1/transactions/:id/review` acepta `outcome` (`fraud`, `legitimate`, `pending`), `analyst` y `comment`. Requiere rol de analista o administrador. Crea un registro nuevo; no modifica el puntaje, decisión ni umbrales de la evaluación original. `GET /transactions/:id` devuelve `review` y `review_history`. El formulario está en el detalle de la transacción.

La migración `20260910000000_transaction_reviews` es aditiva. Los registros anteriores se conservan, sin revisión humana hasta que se agregue una. El nombre del analista es declarado por el usuario: las API keys del prototipo autentican un rol, no una identidad individual.

Inspiración conceptual: módulos de evaluación, feedback y riesgo de [YobieBen/FraudLens](https://github.com/YobieBen/FraudLens). Implementación propia para nuestro backend; no se incorporaron sus modelos ni sus cifras anunciadas de rendimiento.

Prueba de integración en los contenedores actualizados:

```sh
docker compose exec -T backend node < test/docker-integration.cjs
```

Verifica persistencia real y autorizaciones HTTP. Los eventos y revisiones de prueba se ejecutan dentro de una transacción que se revierte.
