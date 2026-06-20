#!/usr/bin/env python3
"""
Chatbot RAG sobre la base de seguros SURA — 100% local (Ollama + Postgres/pgvector).

Recupera los chunks más relevantes por similitud vectorial, arma el contexto y
genera la respuesta con llama3, citando las fuentes. Responde SOLO con la info
recuperada (grounding) para evitar alucinaciones.

Uso:
  python chatbot.py                      # modo interactivo
  python chatbot.py "¿que cubre el seguro de mascotas?"   # pregunta única

Vars (defaults para el setup local):
  DATABASE_URL=postgresql://sura:sura@localhost:5433/sura
  OLLAMA_URL=http://localhost:11434
  EMBED_MODEL=nomic-embed-text   GEN_MODEL=llama3
"""
import os, sys, json, urllib.request
import psycopg

try:  # Windows: asegurar salida UTF-8 (acentos/ñ)
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DB = os.environ.get("DATABASE_URL", "postgresql://sura:sura@localhost:5433/sura")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
GEN_MODEL = os.environ.get("GEN_MODEL", "llama3")
TOP_K = int(os.environ.get("TOP_K", "6"))

SYSTEM = """Eres el asistente virtual de Seguros SURA Colombia. Respondes preguntas
sobre seguros (personas y empresas) y ARL usando EXCLUSIVAMENTE el CONTEXTO que se te entrega.
Reglas:
- Si la respuesta no está en el contexto, dilo claramente y sugiere consultar con un asesor.
- No inventes coberturas, precios, ni condiciones.
- Responde en español, claro y conciso. Usa viñetas cuando ayude.
- Al final incluye "Fuentes:" con las URLs citadas relevantes.
"""


def embed(text):
    req = urllib.request.Request(
        f"{OLLAMA}/api/embeddings",
        data=json.dumps({"model": EMBED_MODEL, "prompt": text}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["embedding"]


def retrieve(conn, query, k=TOP_K):
    vec = "[" + ",".join(map(str, embed(query))) + "]"
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT dc.seccion, dc.contenido, dc.url,
                   COALESCE(pr.nombre, pc.nombre) AS fuente,
                   1 - (dc.embedding <=> %(v)s::vector) AS score
            FROM doc_chunk dc
            LEFT JOIN producto pr ON pr.id = dc.producto_id
            LEFT JOIN proceso  pc ON pc.id = dc.proceso_id
            ORDER BY dc.embedding <=> %(v)s::vector
            LIMIT %(k)s
            """, {"v": vec, "k": k})
        return cur.fetchall()


def build_context(rows):
    out = []
    for i, (sec, cont, url, fuente, score) in enumerate(rows, 1):
        out.append(f"[{i}] ({fuente or 'SURA'} — {sec}) {cont}\nURL: {url}")
    return "\n\n".join(out)


def generate(question, context):
    prompt = f"CONTEXTO:\n{context}\n\nPREGUNTA DEL USUARIO: {question}\n\nRespuesta:"
    req = urllib.request.Request(
        f"{OLLAMA}/api/chat",
        data=json.dumps({
            "model": GEN_MODEL,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": prompt}],
            "stream": True,
        }).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        for line in r:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("message", {}).get("content"):
                sys.stdout.write(obj["message"]["content"])
                sys.stdout.flush()
            if obj.get("done"):
                break
    print()


def answer(conn, question):
    rows = retrieve(conn, question)
    if not rows:
        print("No encontré información relevante."); return
    ctx = build_context(rows)
    print(f"\n\033[90m[recuperados {len(rows)} fragmentos; top: {rows[0][3]} ({rows[0][4]:.2f})]\033[0m\n")
    generate(question, ctx)


def main():
    conn = psycopg.connect(DB)
    if len(sys.argv) > 1:
        answer(conn, " ".join(sys.argv[1:])); conn.close(); return
    print("🛡️  Asistente Seguros SURA (RAG local). Escribe tu pregunta (o 'salir').\n")
    try:
        while True:
            q = input("\033[1m❓ \033[0m").strip()
            if q.lower() in ("salir", "exit", "quit", ""):
                break
            answer(conn, q)
            print()
    except (EOFError, KeyboardInterrupt):
        pass
    finally:
        conn.close()
        print("\n¡Hasta luego!")


if __name__ == "__main__":
    main()
