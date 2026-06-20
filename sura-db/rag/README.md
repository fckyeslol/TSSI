# RAG local — Chatbot de Seguros SURA (Ollama + Postgres/pgvector)

Sistema de preguntas y respuestas 100% local sobre la base de seguros: recupera los
fragmentos más relevantes por similitud vectorial y genera la respuesta con un LLM
local, citando las fuentes y respondiendo solo con información recuperada (grounding).

## Componentes

| Pieza | Tecnología |
|---|---|
| Base de datos | PostgreSQL 17 + pgvector (Docker) |
| Embeddings | Ollama `nomic-embed-text` (768 dims) |
| Generación | Ollama `llama3` |
| Orquestación | Python (`psycopg`, `urllib`) |

## Puesta en marcha (desde cero)

```bash
# Requisitos: Docker, Ollama, Python 3
ollama pull nomic-embed-text
ollama pull llama3
pip install "psycopg[binary]"

# 1. Levantar Postgres
cd sura-db/rag
docker compose up -d

# 2. Crear esquema y cargar datos
docker exec -i sura-pg psql -U sura -d sura < ../schema.sql
docker exec -i sura-pg psql -U sura -d sura < ../seed/load.sql

# 3. Generar embeddings (Ollama -> doc_chunk)
python load_embeddings_ollama.py

# 4. Chatear
python chatbot.py
# o pregunta directa:
python chatbot.py "¿que cubre el seguro de mascotas?"
```

## Conexión

`postgresql://sura:sura@localhost:5433/sura` (puerto host 5433 para no chocar con un
Postgres local en 5432). Configurable vía `DATABASE_URL`, `OLLAMA_URL`, `EMBED_MODEL`,
`GEN_MODEL`, `TOP_K`.

## Cómo funciona el retrieval

1. La pregunta se embede con `nomic-embed-text`.
2. Búsqueda ANN por distancia coseno (`embedding <=> query`) sobre `doc_chunk`,
   con `JOIN` a `producto`/`proceso` para nombrar la fuente.
3. Los top-K fragmentos forman el CONTEXTO.
4. `llama3` responde solo con ese contexto y lista las URLs como fuentes.

## Mejoras siguientes (opcionales)

- **Búsqueda híbrida:** combinar vector + full-text (`pg_trgm`) para términos exactos.
- **Re-ranking:** reordenar los top-20 con un cross-encoder antes de generar.
- **Tool calling:** dar al chatbot consultas SQL estructuradas (cotización, comparador)
  además del RAG, enrutando según la intención.
- **Modelo más fuerte:** `llama3.1`/`qwen2.5` para respuestas más precisas en español.

## Parar / limpiar

```bash
docker compose down          # detener (conserva datos en el volumen)
docker compose down -v       # detener y BORRAR datos
```
