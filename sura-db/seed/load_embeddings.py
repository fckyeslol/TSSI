#!/usr/bin/env python3
"""
Carga seed/chunks.json en la tabla doc_chunk generando embeddings.
Resuelve producto_id / proceso_id por slug. Idempotente por (url, seccion, contenido).

Uso:
  pip install psycopg[binary] openai
  export OPENAI_API_KEY=sk-...
  export DATABASE_URL=postgresql://user:pass@localhost:5432/sura
  python load_embeddings.py

Modelo: text-embedding-3-small (1536 dims) — coincide con vector(1536) del schema.
"""
import os, json, sys
import psycopg
from openai import OpenAI

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "text-embedding-3-small"
BATCH = 100

def main():
    db = os.environ.get("DATABASE_URL")
    if not db:
        sys.exit("Falta DATABASE_URL")
    client = OpenAI()  # usa OPENAI_API_KEY

    with open(os.path.join(HERE, "chunks.json"), encoding="utf-8") as f:
        chunks = json.load(f)
    # filtra vacíos
    chunks = [c for c in chunks if (c.get("contenido") or "").strip()]
    print(f"Chunks a cargar: {len(chunks)}")

    conn = psycopg.connect(db)
    with conn.cursor() as cur:
        for i in range(0, len(chunks), BATCH):
            batch = chunks[i:i+BATCH]
            texts = [c["contenido"] for c in batch]
            embs = client.embeddings.create(model=MODEL, input=texts).data
            for c, e in zip(batch, embs):
                vec = "[" + ",".join(str(x) for x in e.embedding) + "]"
                cur.execute(
                    """
                    INSERT INTO doc_chunk (producto_id, proceso_id, seccion, contenido, url, embedding)
                    VALUES (
                      (SELECT id FROM producto WHERE slug = %(ps)s),
                      (SELECT id FROM proceso  WHERE slug = %(qs)s),
                      %(sec)s, %(cont)s, %(url)s, %(emb)s::vector
                    )
                    """,
                    {
                        "ps": c.get("producto_slug"),
                        "qs": c.get("proceso_slug"),
                        "sec": c.get("seccion"),
                        "cont": c["contenido"],
                        "url": c.get("url"),
                        "emb": vec,
                    },
                )
            conn.commit()
            print(f"  {min(i+BATCH, len(chunks))}/{len(chunks)}")
    conn.close()
    print("Listo. doc_chunk poblada con embeddings.")

if __name__ == "__main__":
    main()
