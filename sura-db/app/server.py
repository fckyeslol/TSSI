"""
Servidor FastAPI del asistente SURA.
- GET  /                -> UI web
- POST /api/chat        -> respuesta en streaming (SSE) con tool calling + RAG híbrido
- GET  /api/stats       -> conteos para el dashboard
- GET  /api/suggestions -> productos destacados para chips de ejemplo
"""
import os, json
import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import rag_engine as E

DB = os.environ.get("DATABASE_URL", "postgresql://sura:sura@localhost:5433/sura")
HERE = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Asistente Seguros SURA")


def get_conn():
    return psycopg.connect(DB)


@app.get("/")
def index():
    return FileResponse(os.path.join(HERE, "static", "index.html"))


@app.get("/api/stats")
def stats():
    with get_conn() as conn, conn.cursor() as cur:
        out = {}
        for label, sql in {
            "productos": "SELECT count(*) FROM producto",
            "coberturas": "SELECT count(*) FROM cobertura",
            "procesos": "SELECT count(*) FROM proceso",
            "fragmentos": "SELECT count(*) FROM doc_chunk",
        }.items():
            cur.execute(sql); out[label] = cur.fetchone()[0]
    return out


@app.get("/api/suggestions")
def suggestions():
    return {"items": [
        "¿Qué cubre el seguro de mascotas?",
        "Compara los planes de salud",
        "¿Qué responsabilidad civil hay para empresas?",
        "¿Cómo afilio mi empresa a la ARL?",
        "Seguro de auto digital: ¿qué incluye?",
        "¿Qué seguros de vida ofrecen?",
    ]}


@app.post("/api/chat")
async def chat(req: Request):
    body = await req.json()
    message = (body.get("message") or "").strip()
    history = body.get("history") or []
    if not message:
        return JSONResponse({"error": "mensaje vacío"}, status_code=400)

    def gen():
        conn = get_conn()
        try:
            for ev in E.chat_stream(conn, message, history):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            conn.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


app.mount("/static", StaticFiles(directory=os.path.join(HERE, "static")), name="static")
