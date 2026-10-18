# Datasets activos

El proyecto mantiene dos dominios independientes. No se mezclan durante entrenamiento, validacion ni test.

Las carpetas antiguas (`entrenamiento`, `validacion`, `test`) se conservaron en `legacy/` como respaldo y ya no forman parte del pipeline activo.

## Tarjetas: ULB Credit Card Fraud Detection

Origen: https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud

- `raw/creditcard.csv`: fuente original.
- `train.jsonl`: 60% cronologico.
- `validation.jsonl`: 20% siguiente, usado solo para elegir umbral.
- `test.jsonl`: 20% final, intocable hasta la medicion.

## Transferencias: PaySim

Origen: https://www.kaggle.com/datasets/ealaxi/paysim1

- `raw/PS_20174392719_1491204439457_log.csv`: fuente original.
- `train.jsonl`: 60% cronologico.
- `validation.jsonl`: 20% siguiente, usado solo para elegir umbral.
- `test.jsonl`: 20% final, intocable hasta la medicion.

Los manifiestos de cada dominio registran conteos y fraude por particion. Para regenerar las particiones desde `Backend`:

```sh
NODE_OPTIONS=--max-old-space-size=8192 npm run split:open-datasets -- ../Datasets/tarjetas/raw/creditcard.csv ../Datasets/transferencias/raw/PS_20174392719_1491204439457_log.csv ../Datasets
```

El backend debe entrenar y evaluar un modelo por dominio. No se debe combinar ULB con PaySim en un mismo artefacto.
