"""
Servidor del sitio TSSI: sirve el front estático + API del asistente (RAG) + captura de leads.
Reutiliza el motor RAG de sura-db/app/rag_engine.py.

Uso:
  cd C:\\Users\\mateo\\TSI\\tssi-site
  python -m uvicorn serve:app --port 5173
  # abrir http://localhost:5173
"""
import os, sys, json, datetime
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

HERE = os.path.dirname(os.path.abspath(__file__))

# Carga .env (variables como RESEND_API_KEY) si python-dotenv está disponible.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(HERE, ".env"))
except Exception:
    pass

sys.path.insert(0, os.path.join(HERE, "..", "sura-db", "app"))
import psycopg
import rag_engine as E
import lead_notify

DB = os.environ.get("DATABASE_URL", "postgresql://sura:sura@localhost:5433/sura")
LEADS = os.path.join(HERE, "leads.jsonl")

app = FastAPI(title="TSSI")


@app.get("/")
def index():
    return FileResponse(os.path.join(HERE, "index.html"))


@app.get("/{page}")
def static_page(page: str):
    if page in ("personas", "empresas", "arl"):
        return FileResponse(os.path.join(HERE, f"{page}.html"))
    return JSONResponse({"error": "no encontrado"}, status_code=404)


@app.post("/api/chat")
async def chat(req: Request):
    body = await req.json()
    message = (body.get("message") or "").strip()
    history = body.get("history") or []
    if not message:
        return JSONResponse({"error": "mensaje vacío"}, status_code=400)

    def gen():
        conn = psycopg.connect(DB)
        try:
            for ev in E.chat_stream(conn, message, history):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type':'error','message':str(e)}, ensure_ascii=False)}\n\n"
        finally:
            conn.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _notify_lead(data: dict):
    """Envía la notificación por correo y registra el resultado (no bloquea la respuesta)."""
    ok, detail = lead_notify.send_lead_email(data)
    tag = "lead-email OK" if ok else "lead-email FAIL"
    print(f"[{tag}] {detail}", flush=True)


@app.post("/api/lead")
async def lead(req: Request, background: BackgroundTasks):
    data = await req.json()
    data["recibido"] = datetime.datetime.now().isoformat(timespec="seconds")
    with open(LEADS, "a", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False) + "\n")
    # El correo se manda en segundo plano: si Resend falla, el lead ya quedó guardado.
    background.add_task(_notify_lead, data)
    return {"ok": True}


# estáticos (data, assets) — montados al final para no tapar las rutas /api
app.mount("/data", StaticFiles(directory=os.path.join(HERE, "data")), name="data")
app.mount("/assets", StaticFiles(directory=os.path.join(HERE, "assets")), name="assets")
