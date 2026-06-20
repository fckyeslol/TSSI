"""
Motor RAG del asistente SURA.
- Búsqueda HÍBRIDA: vector (pgvector) + full-text español (tsvector), fusionados con RRF.
- TOOL CALLING nativo (Ollama / qwen2.5): el modelo decide entre buscar, detallar o comparar.
- Generación con grounding y citas.
"""
import os, json, urllib.request, urllib.error

DB = os.environ.get("DATABASE_URL", "postgresql://sura:sura@localhost:5433/sura")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
GEN_MODEL = os.environ.get("GEN_MODEL", "qwen2.5:7b")

SYSTEM = """Eres el asistente virtual de Seguros SURA Colombia. Ayudas a personas y empresas
con información de seguros (personas, empresas) y ARL (riesgos laborales).

USA SIEMPRE una herramienta para fundamentar tu respuesta antes de responder:
- `buscar_seguros`: preguntas generales sobre coberturas, exclusiones, requisitos, trámites.
- `detalle_producto`: cuando preguntan por UN producto concreto (qué cubre, planes, a quién aplica).
- `comparar_productos`: cuando piden comparar planes/productos o ver diferencias.

Reglas:
- Responde SOLO con la información de las herramientas. Si no está, dilo y sugiere un asesor.
- No inventes coberturas, precios ni condiciones.
- Español claro y conciso, con viñetas cuando ayude.
- Termina con "Fuentes:" listando las URLs relevantes.
"""

TOOLS = [
    {"type": "function", "function": {
        "name": "buscar_seguros",
        "description": "Busca información en la base de seguros SURA (coberturas, exclusiones, requisitos, trámites ARL). Úsala para preguntas generales.",
        "parameters": {"type": "object", "properties": {
            "consulta": {"type": "string", "description": "La consulta de búsqueda en español"}},
            "required": ["consulta"]}}},
    {"type": "function", "function": {
        "name": "detalle_producto",
        "description": "Devuelve el detalle estructurado de un producto: descripción, planes, coberturas incluidas/opcionales/excluidas, a quién aplica y canales.",
        "parameters": {"type": "object", "properties": {
            "nombre": {"type": "string", "description": "Nombre del seguro, p.ej. 'seguro de mascotas', 'auto digital', 'responsabilidad civil ambiental'"}},
            "required": ["nombre"]}}},
    {"type": "function", "function": {
        "name": "comparar_productos",
        "description": "Compara productos/planes de un mismo tema mostrando una matriz de coberturas.",
        "parameters": {"type": "object", "properties": {
            "termino": {"type": "string", "description": "Tema o ramo a comparar, p.ej. 'salud', 'autos', 'responsabilidad civil'"}},
            "required": ["termino"]}}},
]


# ---------------------------------------------------------------- Ollama helpers
def _post(path, payload, timeout=300):
    req = urllib.request.Request(f"{OLLAMA}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout)


def embed(text):
    with _post("/api/embed", {"model": EMBED_MODEL, "input": [text]}) as r:
        return json.loads(r.read())["embeddings"][0]


# ---------------------------------------------------------------- Retrieval
def hybrid_search(conn, query, k=6, pool=20):
    """RRF de búsqueda vectorial + full-text. Devuelve lista de dicts."""
    vec = "[" + ",".join(map(str, embed(query))) + "]"
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM doc_chunk ORDER BY embedding <=> %(v)s::vector LIMIT %(p)s
        """, {"v": vec, "p": pool})
        vec_ids = [r[0] for r in cur.fetchall()]
        cur.execute("""
            SELECT id FROM doc_chunk
            WHERE contenido_tsv @@ websearch_to_tsquery('spanish', %(q)s)
            ORDER BY ts_rank(contenido_tsv, websearch_to_tsquery('spanish', %(q)s)) DESC
            LIMIT %(p)s
        """, {"q": query, "p": pool})
        lex_ids = [r[0] for r in cur.fetchall()]

    # Reciprocal Rank Fusion
    K = 60
    scores = {}
    for rank, i in enumerate(vec_ids):
        scores[i] = scores.get(i, 0) + 1.0 / (K + rank)
    for rank, i in enumerate(lex_ids):
        scores[i] = scores.get(i, 0) + 1.0 / (K + rank)
    top = sorted(scores, key=scores.get, reverse=True)[:k]
    if not top:
        return []
    with conn.cursor() as cur:
        cur.execute("""
            SELECT dc.id, dc.seccion, dc.contenido, dc.url,
                   COALESCE(pr.nombre, pc.nombre) AS fuente
            FROM doc_chunk dc
            LEFT JOIN producto pr ON pr.id = dc.producto_id
            LEFT JOIN proceso  pc ON pc.id = dc.proceso_id
            WHERE dc.id = ANY(%(ids)s)
        """, {"ids": top})
        byid = {r[0]: r for r in cur.fetchall()}
    out = []
    for i in top:
        if i in byid:
            _, sec, cont, url, fuente = byid[i]
            out.append({"seccion": sec, "contenido": cont, "url": url,
                        "fuente": fuente, "score": round(scores[i], 4)})
    return out


# ---------------------------------------------------------------- Tools (SQL)
def tool_buscar_seguros(conn, consulta):
    rows = hybrid_search(conn, consulta, k=6)
    text = "\n\n".join(f"[{i+1}] ({r['fuente'] or 'SURA'} — {r['seccion']}) {r['contenido']}\nURL: {r['url']}"
                       for i, r in enumerate(rows))
    sources = _dedup_sources([{"nombre": r["fuente"], "url": r["url"]} for r in rows])
    return text or "Sin resultados.", sources


def tool_detalle_producto(conn, nombre):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, nombre, descripcion, url, tipo_persona, es_digital, cotizador_url
            FROM producto
            ORDER BY GREATEST(similarity(nombre, %(n)s), similarity(slug, %(n)s)) DESC
            LIMIT 1
        """, {"n": nombre})
        p = cur.fetchone()
        if not p:
            return f"No encontré un producto para '{nombre}'.", []
        pid, pnombre, desc, url, tp, dig, cot = p
        cur.execute("""
            SELECT c.nombre, pc.tipo, pc.limite
            FROM plan_cobertura pc
            JOIN plan pl ON pl.id = pc.plan_id
            JOIN cobertura c ON c.id = pc.cobertura_id
            WHERE pl.producto_id = %(id)s
            ORDER BY pc.tipo, c.nombre
        """, {"id": pid})
        cobs = cur.fetchall()
        cur.execute("SELECT descripcion, edad_min, edad_max, tipo_persona FROM elegibilidad WHERE producto_id=%(id)s LIMIT 1", {"id": pid})
        eleg = cur.fetchone()
        cur.execute("SELECT canal FROM producto_canal WHERE producto_id=%(id)s", {"id": pid})
        canales = [r[0] for r in cur.fetchall()]

    def grupo(t):
        items = [f"{n}" + (f" (límite: {lim})" if lim else "") for n, tt, lim in cobs if tt == t]
        return items

    parts = [f"PRODUCTO: {pnombre}", f"Descripción: {desc}",
             f"Tipo de persona: {tp} | Digital: {'sí' if dig else 'no'}" + (f" | Cotizador: {cot}" if cot else "")]
    inc, opc, exc = grupo("incluida"), grupo("opcional"), grupo("excluida")
    if inc: parts.append("CUBRE (incluidas):\n- " + "\n- ".join(inc))
    if opc: parts.append("OPCIONALES:\n- " + "\n- ".join(opc))
    if exc: parts.append("NO CUBRE (exclusiones):\n- " + "\n- ".join(exc))
    if eleg and eleg[0]: parts.append(f"A QUIÉN APLICA: {eleg[0]}")
    if canales: parts.append("CANALES: " + ", ".join(canales))
    parts.append(f"URL: {url}")
    return "\n\n".join(parts), [{"nombre": pnombre, "url": url}]


def tool_comparar_productos(conn, termino):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT pr.id, pr.nombre, pr.url
            FROM producto pr LEFT JOIN ramo r ON r.id = pr.ramo_id
            WHERE pr.nombre ILIKE %(t)s OR r.nombre ILIKE %(t)s OR pr.descripcion ILIKE %(t)s
            ORDER BY pr.nombre LIMIT 5
        """, {"t": f"%{termino}%"})
        prods = cur.fetchall()
        if not prods:
            return f"No encontré productos para comparar sobre '{termino}'.", []
        ids = [p[0] for p in prods]
        cur.execute("""
            SELECT pr.nombre, c.nombre, pc.tipo
            FROM plan_cobertura pc
            JOIN plan pl ON pl.id = pc.plan_id
            JOIN producto pr ON pr.id = pl.producto_id
            JOIN cobertura c ON c.id = pc.cobertura_id
            WHERE pr.id = ANY(%(ids)s) AND pc.tipo IN ('incluida','opcional')
            ORDER BY pr.nombre
        """, {"ids": ids})
        rows = cur.fetchall()
    byprod = {}
    for pn, cn, tt in rows:
        byprod.setdefault(pn, []).append(f"{cn}{' (opc)' if tt=='opcional' else ''}")
    parts = [f"COMPARACIÓN sobre '{termino}':"]
    for pn, items in byprod.items():
        parts.append(f"\n### {pn}\nCubre: " + ", ".join(items[:25]))
    sources = _dedup_sources([{"nombre": p[1], "url": p[2]} for p in prods])
    return "\n".join(parts), sources


def _dedup_sources(srcs):
    seen, out = set(), []
    for s in srcs:
        key = s.get("url")
        if key and key not in seen:
            seen.add(key); out.append(s)
    return out


TOOL_FNS = {
    "buscar_seguros": lambda conn, a: tool_buscar_seguros(conn, a.get("consulta", "")),
    "detalle_producto": lambda conn, a: tool_detalle_producto(conn, a.get("nombre", "")),
    "comparar_productos": lambda conn, a: tool_comparar_productos(conn, a.get("termino", "")),
}


# ---------------------------------------------------------------- Chat (stream + tools)
def chat_stream(conn, message, history=None):
    """Generador: produce dicts {type, ...} para SSE."""
    history = history or []
    messages = [{"role": "system", "content": SYSTEM}]
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    # 1) Primera pasada: ¿el modelo quiere una herramienta?
    #    Si el modelo no soporta tools (HTTP 400), caemos a RAG híbrido directo.
    tool_calls, msg = [], {}
    try:
        with _post("/api/chat", {"model": GEN_MODEL, "messages": messages,
                                 "tools": TOOLS, "stream": False}) as r:
            first = json.loads(r.read())
        msg = first.get("message", {})
        tool_calls = msg.get("tool_calls") or []
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise  # otro error real
        # modelo sin soporte de tools -> fallback silencioso

    sources, used_tool = [], None
    if tool_calls:
        messages.append(msg)
        for tc in tool_calls:
            fn = tc["function"]["name"]
            args = tc["function"].get("arguments", {})
            if isinstance(args, str):
                try: args = json.loads(args)
                except Exception: args = {}
            used_tool = fn
            if fn in TOOL_FNS:
                text, srcs = TOOL_FNS[fn](conn, args)
                sources.extend(srcs)
                messages.append({"role": "tool", "content": text})
        yield {"type": "meta", "tool": used_tool, "sources": _dedup_sources(sources)}
    else:
        # fallback: búsqueda híbrida directa
        text, srcs = tool_buscar_seguros(conn, message)
        sources.extend(srcs)
        messages.append({"role": "tool", "content": text})
        used_tool = "buscar_seguros"
        yield {"type": "meta", "tool": used_tool, "sources": _dedup_sources(sources)}

    # 2) Segunda pasada: respuesta final en streaming
    with _post("/api/chat", {"model": GEN_MODEL, "messages": messages, "stream": True}) as r:
        for line in r:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            tok = obj.get("message", {}).get("content")
            if tok:
                yield {"type": "token", "text": tok}
            if obj.get("done"):
                break
    yield {"type": "done"}
