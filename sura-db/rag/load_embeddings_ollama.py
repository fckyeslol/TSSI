#!/usr/bin/env python3
"""
Carga seed/chunks.json en doc_chunk generando embeddings con OLLAMA (local).
Modelo: nomic-embed-text (768 dims). Resuelve producto_id/proceso_id por slug.

Uso:
  python load_embeddings_ollama.py
Variables (con defaults para el docker-compose local):
  DATABASE_URL = postgresql://sura:sura@localhost:5433/sura
  OLLAMA_URL   = http://localhost:11434
  EMBED_MODEL  = nomic-embed-text
"""
import os, json, sys, urllib.request
import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.normpath(os.path.join(HERE, "..", "seed"))
DB = os.environ.get("DATABASE_URL", "postgresql://sura:sura@localhost:5433/sura")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")


BATCH = int(os.environ.get("EMBED_BATCH", "32"))


def embed_batch(texts):
    """Usa /api/embed (batch). Devuelve lista de vectores en el mismo orden."""
    req = urllib.request.Request(
        f"{OLLAMA}/api/embed",
        data=json.dumps({"model": MODEL, "input": texts}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["embeddings"]


def main():
    with open(os.path.join(SEED, "chunks.json"), encoding="utf-8") as f:
        chunks = [c for c in json.load(f) if (c.get("contenido") or "").strip()]
    print(f"Chunks a embeber: {len(chunks)} (modelo {MODEL}, batch {BATCH})", flush=True)

    conn = psycopg.connect(DB)
    with conn.cursor() as cur:
        cur.execute("TRUNCATE doc_chunk")  # recarga limpia
        done = 0
        for i in range(0, len(chunks), BATCH):
            batch = chunks[i:i + BATCH]
            vecs = embed_batch([c["contenido"] for c in batch])
            for c, vec in zip(batch, vecs):
                cur.execute(
                    """
                    INSERT INTO doc_chunk (producto_id, proceso_id, seccion, contenido, url, embedding, tokens)
                    VALUES (
                      (SELECT id FROM producto WHERE slug = %(ps)s),
                      (SELECT id FROM proceso  WHERE slug = %(qs)s),
                      %(sec)s, %(cont)s, %(url)s, %(emb)s::vector, %(tok)s
                    )
                    """,
                    {"ps": c.get("producto_slug"), "qs": c.get("proceso_slug"),
                     "sec": c.get("seccion"), "cont": c["contenido"], "url": c.get("url"),
                     "emb": "[" + ",".join(map(str, vec)) + "]", "tok": len(c["contenido"].split())},
                )
            conn.commit()
            done += len(batch)
            print(f"  {done}/{len(chunks)}", flush=True)
    conn.close()
    print("Listo. doc_chunk poblada con embeddings de Ollama.", flush=True)


if __name__ == "__main__":
    main()
