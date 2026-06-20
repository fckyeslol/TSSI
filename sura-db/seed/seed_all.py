#!/usr/bin/env python3
"""
Sembrado completo de la base SURA en un solo paso (Windows / Railway / local).

Ejecuta, en orden, contra $DATABASE_URL:
  1. schema.sql        -> tablas, tipos, extensiones (vector, pg_trgm, uuid-ossp)
  2. seed/load.sql     -> catálogo (ramos, coberturas, productos, planes, procesos)
  3. seed/load_embeddings.py (import) -> doc_chunk con embeddings de OpenAI

No requiere el binario `psql`: usa psycopg. Idempotente (los INSERT usan ON CONFLICT
y los chunks se omiten si ya existen por (url, seccion, contenido)).

Uso:
  pip install -r requirements.txt
  export DATABASE_URL=postgresql://...      # Railway: la URL pública del Postgres
  export OPENAI_API_KEY=sk-...
  python sura-db/seed/seed_all.py
"""
import os
import sys

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
SURA_DB = os.path.dirname(HERE)            # .../sura-db
SCHEMA = os.path.join(SURA_DB, "schema.sql")
LOAD_SQL = os.path.join(HERE, "load.sql")


def run_sql_file(conn, path: str) -> None:
    with open(path, encoding="utf-8") as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print(f"OK: {os.path.relpath(path, SURA_DB)}")


def main() -> None:
    db = os.environ.get("DATABASE_URL")
    if not db:
        sys.exit("Falta DATABASE_URL")
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("Falta OPENAI_API_KEY (necesaria para los embeddings)")

    print("1/3  Aplicando schema.sql ...")
    with psycopg.connect(db) as conn:
        run_sql_file(conn, SCHEMA)

    print("2/3  Cargando catálogo (load.sql) ...")
    with psycopg.connect(db) as conn:
        run_sql_file(conn, LOAD_SQL)

    print("3/3  Generando embeddings (OpenAI) -> doc_chunk ...")
    sys.path.insert(0, HERE)
    import load_embeddings  # reutiliza la lógica existente
    load_embeddings.main()

    print("\nListo. Base SURA sembrada y lista para el asistente.")


if __name__ == "__main__":
    main()
