"""
Notificación de leads por correo vía Resend (https://resend.com).

Diseño:
- Nunca lanza excepción hacia el endpoint: la captura del lead no debe romperse
  si el correo falla. Devuelve (ok, detalle) para registro.
- Sin dependencias externas: usa urllib (igual que rag_engine).
- Configurable por variables de entorno:
    RESEND_API_KEY   clave de API de Resend (obligatoria para enviar)
    LEAD_NOTIFY_TO   destino, por defecto mateopirela08@gmail.com
    LEAD_FROM        remitente, por defecto "TSSI Leads <onboarding@resend.dev>"
"""
import os
import json
import html
import urllib.request
import urllib.error

RESEND_ENDPOINT = "https://api.resend.com/emails"

NOTIFY_TO = os.environ.get("LEAD_NOTIFY_TO", "mateopirela08@gmail.com")
LEAD_FROM = os.environ.get("LEAD_FROM", "TSSI Leads <onboarding@resend.dev>")

# Etiquetas legibles para los campos conocidos del lead.
FIELD_LABELS = {
    "nombre": "Nombre",
    "email": "Correo",
    "tel": "Teléfono / WhatsApp",
    "telefono": "Teléfono",
    "categoria": "Qué quiere proteger",
    "perfil": "Perfil",
    "urgencia": "Urgencia",
    "mensaje": "Mensaje",
    "fuente": "Origen",
    "recibido": "Recibido",
}

SOURCE_LABELS = {"wizard": "Asistente «Diseña tu protección»", "form": "Formulario de contacto"}


def _row(label: str, value: str) -> str:
    return (
        '<tr>'
        f'<td style="padding:8px 14px;color:#6b7280;font:600 13px/1.4 system-ui,sans-serif;'
        'white-space:nowrap;vertical-align:top">' + html.escape(label) + '</td>'
        f'<td style="padding:8px 14px;color:#111827;font:400 15px/1.5 system-ui,sans-serif">'
        + html.escape(value) + '</td>'
        '</tr>'
    )


def build_email(lead: dict) -> tuple[str, str]:
    """Devuelve (asunto, html) a partir del lead."""
    nombre = (lead.get("nombre") or "Sin nombre").strip()
    categoria = (lead.get("categoria") or lead.get("ramo") or "").strip()
    fuente = SOURCE_LABELS.get(lead.get("fuente", ""), lead.get("fuente", "Sitio web"))

    subject = f"Nuevo lead TSSI · {nombre}" + (f" · {categoria}" if categoria else "")

    # Filas en orden conocido primero, luego cualquier extra.
    order = ["nombre", "email", "tel", "telefono", "categoria", "perfil", "urgencia", "mensaje", "fuente", "recibido"]
    seen = set()
    rows = []
    for key in order:
        if key in lead and str(lead[key]).strip():
            rows.append(_row(FIELD_LABELS.get(key, key.title()), str(lead[key])))
            seen.add(key)
    for key, val in lead.items():
        if key not in seen and str(val).strip():
            rows.append(_row(FIELD_LABELS.get(key, key.title()), str(val)))

    body = f"""\
<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <tr><td style="background:#141d33;padding:22px 28px">
      <div style="color:#e7c389;font:700 13px/1 system-ui,sans-serif;letter-spacing:.12em">TENDENCIAS · SEGUROS</div>
      <div style="color:#fff;font:700 20px/1.3 Georgia,serif;margin-top:6px">Nuevo lead recibido</div>
      <div style="color:#9aa3b8;font:400 13px/1.4 system-ui,sans-serif;margin-top:4px">{html.escape(fuente)}</div>
    </td></tr>
    <tr><td style="padding:10px 14px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{''.join(rows)}</table>
    </td></tr>
    <tr><td style="padding:0 28px 24px">
      <div style="color:#9ca3af;font:400 12px/1.5 system-ui,sans-serif;border-top:1px solid #eef0f3;padding-top:14px">
        Responde pronto: el contacto rápido es el mayor factor de conversión.
      </div>
    </td></tr>
  </table>
</body></html>"""
    return subject, body


def send_lead_email(lead: dict) -> tuple[bool, str]:
    """Envía la notificación. Nunca lanza; devuelve (ok, detalle)."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        return False, "RESEND_API_KEY no configurada; lead guardado pero sin correo"

    subject, body = build_email(lead)
    payload = {
        "from": LEAD_FROM,
        "to": [NOTIFY_TO],
        "subject": subject,
        "html": body,
    }
    # Si el lead trae email, facilita responder directamente.
    if lead.get("email"):
        payload["reply_to"] = lead["email"]

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        RESEND_ENDPOINT, data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare delante de Resend bloquea el User-Agent por defecto de urllib (error 1010).
            "User-Agent": "TSSI-LeadNotifier/1.0",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read() or b"{}")
        return True, f"enviado id={resp.get('id', '?')}"
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        return False, f"HTTP {e.code}: {detail}"
    except Exception as e:  # red, DNS, timeout
        return False, f"error: {e}"
