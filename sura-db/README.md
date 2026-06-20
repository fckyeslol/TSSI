# Base de datos de Seguros SURA

Cómo organizar los datos scrapeados de `sura.co/seguros` + `sura.co/arl` para
automatizar procesos en una aseguradora: **chatbot, cotización, comparador y recomendador**.

## Arquitectura: híbrido SQL + Vector (un solo PostgreSQL)

```
  Scrape (markdown limpio)            Normalización (LLM)            Postgres + pgvector
 ┌───────────────────────┐         ┌──────────────────────┐       ┌──────────────────────┐
 │ seguros-sura/paginas/  │  ───►   │ extrae a JSON con el  │ ───►  │ RELACIONAL            │
 │ seguros-sura/paginas-arl│        │ schema (coberturas,   │       │  producto/plan/       │
 │ 128 páginas .md         │        │ planes, elegibilidad, │       │  cobertura/plan_cob…  │
 └───────────────────────┘         │ procesos)             │       │ + VECTOR (doc_chunk)  │
                                    └──────────────────────┘       └──────────────────────┘
```

- **Relacional** → decisiones determinísticas (cotizar, comparar, reglas de elegibilidad).
- **Vector (pgvector)** → preguntas en lenguaje natural (chatbot/RAG) y similitud (recomendador).
- **Una sola base** = menos operación. `pgvector` + `pg_trgm` cubren todo a este volumen.

## El principio que hace que esto funcione

La unidad atómica es la **cobertura**, no el producto. "Responsabilidad Civil" se
define una vez en `cobertura` y se enlaza vía `plan_cobertura` a Autos, Hogar y RC.
Eso es lo que habilita comparar, cotizar y detectar vacíos de cobertura
automáticamente. Si guardas "qué cubrimos" como texto plano, nada de eso es posible.

## Tablas (ver `schema.sql`)

| Tabla | Rol |
|---|---|
| `ramo` | Taxonomía técnica (Salud, Vida, Autos, RC, Cumplimiento, ARL…) |
| `producto` | El seguro (Plan Salud Clásico, Auto Digital…) + versión + trazabilidad |
| `plan` | Variantes/tiers (Clásico, Básico, Global) |
| `cobertura` | **Catálogo atómico reutilizable** de coberturas |
| `plan_cobertura` | M:N — incluida/opcional/excluida + límites + deducibles |
| `elegibilidad` | Reglas de suscripción (edad, tipo persona, condiciones) |
| `producto_canal` | Canales de venta (digital, asesor, bancaseguros…) |
| `documento` | Condicionados PDF, formatos, clausulados (con versión) |
| `proceso` | Trámites/flujos — **clave para ARL** (afiliación, certificados, incapacidad) |
| `doc_chunk` | Trozos de texto + embeddings (RAG / chatbot) |

## Por qué ARL se modela distinto

- **Seguros comerciales** = productos → `producto` / `plan` / `cobertura`.
- **ARL** = ramo obligatorio operativo → casi todo es `proceso` (afiliación empresa
  vs. independiente, certificados, radicar incapacidad, reporte de accidente, SST).
  Esto separa "personas naturales" (independiente) de "jurídicas" (empresa) vía
  `proceso.dirigido_a`.

## Cómo cada automatización usa el modelo

1. **Chatbot/RAG** → `doc_chunk` (búsqueda por embedding) citando `producto`/`proceso`.
2. **Cotización** → `plan` + `plan_cobertura` (incluidas/opcionales) + `elegibilidad`.
3. **Comparador** → vista `v_comparador` (matriz plan × cobertura).
4. **Recomendador** → `elegibilidad` (filtro duro) + similitud vectorial (ranking blando).

Ejemplos de query SQL para cada caso están al final de `schema.sql`.

## Siguiente paso: la pasada de normalización (ETL)

El scrape entregó markdown limpio. Falta **extraer lo estructurado** con un LLM:
leer cada `.md` → producir JSON que matchee el schema → cargar a Postgres + generar
embeddings. Es un trabajo paralelizable sobre 128 páginas (agente por página/lote).

Entregables de esa pasada:
- `seed/productos.json`, `seed/coberturas.json`, `seed/planes.json`, `seed/procesos.json`
- `load.sql` / script de carga + generación de embeddings (`doc_chunk`)

## Inventario de fuentes ya scrapeadas

- `seguros-sura/paginas/` — 98 páginas de seguros (74 productos + soporte)
- `seguros-sura/paginas-arl/` — 30 páginas de ARL
- `seguros-sura/catalogo.json` + `catalogo-arl.json` — índices estructurados base
- `seguros-sura/CATALOGO.md` — catálogo legible
