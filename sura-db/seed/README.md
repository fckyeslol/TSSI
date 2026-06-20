# Seed — datos normalizados listos para cargar

Generado por la pasada de normalización (workflow multi-agente sobre 128 páginas)
+ consolidación determinística (`consolidar.js`).

## Contenido

| Archivo | Filas | Carga en |
|---|---|---|
| `productos.json` | 74 | `producto` |
| `planes.json` | 141 | `plan` |
| `coberturas.json` | 817 | `cobertura` (catálogo atómico, dedup por slug) |
| `plan_coberturas.json` | 1052 | `plan_cobertura` |
| `elegibilidad.json` | 74 | `elegibilidad` |
| `canales.json` | 164 | `producto_canal` |
| `documentos.json` | 117 | `documento` |
| `procesos.json` | 25 | `proceso` (ARL) |
| `chunks.json` | 792 | `doc_chunk` (vía embeddings) |
| `load.sql` | — | INSERT idempotentes de todo lo anterior excepto chunks |
| `raw/` | 128 | extracción cruda por página (trazabilidad/re-proceso) |

## Cómo cargar

```bash
# 1. Crear el esquema
psql "$DATABASE_URL" -f ../schema.sql

# 2. Cargar datos estructurados (productos, planes, coberturas, procesos…)
psql "$DATABASE_URL" -f load.sql

# 3. Cargar la capa RAG con embeddings (necesita OPENAI_API_KEY)
pip install "psycopg[binary]" openai
python load_embeddings.py
```

## Notas de calidad

- **Coberturas:** 1052 asignaciones plan↔cobertura colapsan a 817 coberturas únicas
  por slug. La deduplicación es por slug exacto; una segunda pasada opcional puede
  fusionar slugs semánticamente equivalentes usando `cobertura.embedding`.
- **Planes:** los productos sin tiers explícitos reciben un "Plan único" para que
  toda cobertura tenga un plan destino.
- **ARL:** 25 procesos + 5 documentos SST cargados como `referencia` (solo RAG).
- **Re-proceso:** para re-extraer una página, edita su `raw/<slug>.json` y vuelve a
  correr `node consolidar.js`.
