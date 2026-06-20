-- =============================================================================
-- Base de datos de Seguros SURA — Esquema PostgreSQL + pgvector
-- Soporta: (1) Chatbot/RAG  (2) Cotización  (3) Comparador  (4) Recomendador
-- =============================================================================
-- Principio rector: la unidad atómica reutilizable es la COBERTURA, no el producto.
-- Lo estructurado vive en tablas relacionales; el texto libre vive en doc_chunk
-- como embeddings para búsqueda semántica (RAG). Un solo Postgres para todo.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector (embeddings)
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- búsqueda fuzzy por texto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- ENUMS -------------------------------------------------------------
CREATE TYPE linea_negocio   AS ENUM ('personas', 'empresas', 'arl');
CREATE TYPE tipo_persona    AS ENUM ('natural', 'juridica', 'ambas');
CREATE TYPE tipo_cobertura  AS ENUM ('incluida', 'opcional', 'excluida');
CREATE TYPE estado_producto AS ENUM ('activo', 'descontinuado', 'borrador');
CREATE TYPE canal_venta     AS ENUM ('digital', 'asesor', 'presencial', 'bancaseguros',
                                     'corredores', 'affinity', 'retail', 'call_center');
CREATE TYPE tipo_documento  AS ENUM ('condicionado', 'formato', 'clausulado', 'anexo', 'certificado');
CREATE TYPE tipo_proceso    AS ENUM ('afiliacion', 'reclamacion', 'certificado',
                                     'tramite', 'reporte', 'pago', 'cotizacion');

-- ---------- TAXONOMÍA ---------------------------------------------------------
-- Ramo = clasificación técnica del seguro (Salud, Vida, Autos, RC, Cumplimiento…)
CREATE TABLE ramo (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,        -- 'salud', 'vida', 'autos', 'rc-empresas'
  nombre      TEXT NOT NULL,
  linea       linea_negocio NOT NULL,
  descripcion TEXT
);

-- ---------- PRODUCTO ----------------------------------------------------------
CREATE TABLE producto (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,       -- 'plan-salud-clasico'
  nombre        TEXT NOT NULL,              -- 'Plan Salud Clásico'
  ramo_id       INT REFERENCES ramo(id),
  linea         linea_negocio NOT NULL,
  tipo_persona  tipo_persona NOT NULL DEFAULT 'natural',
  descripcion   TEXT,                       -- copy de marketing
  resumen       TEXT,                       -- 1 frase para recomendador/cards
  url           TEXT,
  cotizador_url TEXT,                       -- link al motor de cotización si existe
  es_digital    BOOLEAN DEFAULT FALSE,      -- ¿se contrata 100% online?
  estado        estado_producto DEFAULT 'activo',
  version       INT DEFAULT 1,              -- los productos cambian: versionar
  fuente_scrape TEXT,                       -- path al .md original (trazabilidad)
  scrapeado_en  TIMESTAMPTZ DEFAULT now(),
  metadata      JSONB DEFAULT '{}'          -- campos flexibles sin migrar
);
CREATE INDEX idx_producto_ramo  ON producto(ramo_id);
CREATE INDEX idx_producto_linea ON producto(linea);
CREATE INDEX idx_producto_nombre_trgm ON producto USING gin (nombre gin_trgm_ops);

-- ---------- PLAN (variantes/tiers de un producto) ----------------------------
-- Ej. Autos: Clásico | Básico | Global.  Salud: Clásico | Global | Evoluciona.
CREATE TABLE plan (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id   UUID NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  orden         INT DEFAULT 0,             -- para ordenar tiers de menor a mayor
  precio_desde  NUMERIC(14,2),             -- si está publicado
  moneda        CHAR(3) DEFAULT 'COP',
  notas         TEXT,
  UNIQUE (producto_id, slug)
);

-- ---------- CATÁLOGO DE COBERTURAS (atómico, reutilizable) -------------------
-- El corazón del sistema. Una cobertura se define UNA vez y se reusa.
CREATE TABLE cobertura (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT UNIQUE NOT NULL,     -- 'rc-extracontractual', 'asistencia-juridica'
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  categoria       TEXT,                     -- agrupador: 'patrimonial','salud','asistencia'
  embedding       vector(1536)              -- OpenAI text-embedding-3-small (1536 dims)
);
CREATE INDEX idx_cobertura_nombre_trgm ON cobertura USING gin (nombre gin_trgm_ops);

-- ---------- RELACIÓN PLAN ↔ COBERTURA (incluida/opcional/excluida) -----------
-- Aquí vive el detalle real: límites, sublímites, deducibles por plan.
CREATE TABLE plan_cobertura (
  plan_id       UUID NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  cobertura_id  UUID NOT NULL REFERENCES cobertura(id),
  tipo          tipo_cobertura NOT NULL,    -- incluida | opcional | excluida
  limite        TEXT,                       -- '$50.000.000', 'ilimitado', 'hasta 70 años'
  limite_valor  NUMERIC(16,2),              -- versión numérica para comparar/filtrar
  sublimite     TEXT,
  deducible     TEXT,
  notas         TEXT,
  PRIMARY KEY (plan_id, cobertura_id)
);
CREATE INDEX idx_plancob_cobertura ON plan_cobertura(cobertura_id);

-- ---------- ELEGIBILIDAD / REGLAS DE SUSCRIPCIÓN ----------------------------
-- Para cotización (¿aplica?) y recomendador (¿le sirve a este perfil?).
CREATE TABLE elegibilidad (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id  UUID NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  tipo_persona tipo_persona DEFAULT 'ambas',
  edad_min     INT,
  edad_max     INT,
  condiciones  JSONB DEFAULT '{}',          -- reglas flexibles: {"sin_enfermedad_grave":true}
  descripcion  TEXT                          -- texto original "¿A quién aseguramos?"
);
CREATE INDEX idx_elegibilidad_producto ON elegibilidad(producto_id);

-- ---------- CANALES DE VENTA -------------------------------------------------
CREATE TABLE producto_canal (
  producto_id UUID NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  canal       canal_venta NOT NULL,
  PRIMARY KEY (producto_id, canal)
);

-- ---------- DOCUMENTOS (condicionados PDF, formatos, clausulados) -----------
CREATE TABLE documento (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID REFERENCES producto(id) ON DELETE CASCADE,
  tipo        tipo_documento NOT NULL,
  titulo      TEXT,
  pdf_url     TEXT NOT NULL,
  version     TEXT,
  vigente_desde DATE
);
CREATE INDEX idx_documento_producto ON documento(producto_id);

-- ---------- PROCESOS / TRÁMITES (clave para ARL) ----------------------------
-- ARL no es un producto comercial: es operación (afiliación, certificados,
-- radicar incapacidad, reporte de accidente). Se modela como flujos.
CREATE TABLE proceso (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT UNIQUE NOT NULL,
  nombre       TEXT NOT NULL,
  linea        linea_negocio NOT NULL,
  tipo         tipo_proceso NOT NULL,
  dirigido_a   tipo_persona DEFAULT 'ambas',  -- natural (independiente) | juridica (empresa)
  pasos        JSONB DEFAULT '[]',            -- [{"orden":1,"titulo":"...","detalle":"..."}]
  url          TEXT,
  descripcion  TEXT,
  fuente_scrape TEXT
);
CREATE INDEX idx_proceso_linea ON proceso(linea);
CREATE INDEX idx_proceso_tipo  ON proceso(tipo);

-- =============================================================================
-- CAPA SEMÁNTICA / RAG  (uso de chatbot y recomendador por similitud)
-- =============================================================================
-- Cada sección del markdown limpio se trocea, se embebe y se enlaza a su origen.
-- Permite responder en lenguaje natural CITANDO la fuente estructurada.
CREATE TABLE doc_chunk (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- enlaces polimórficos al origen (cualquiera puede ser null):
  producto_id  UUID REFERENCES producto(id) ON DELETE CASCADE,
  proceso_id   UUID REFERENCES proceso(id)  ON DELETE CASCADE,
  seccion      TEXT,                         -- 'que_cubrimos','exclusiones','afiliacion'...
  contenido    TEXT NOT NULL,                -- el chunk de texto
  url          TEXT,
  embedding    vector(1536) NOT NULL,        -- OpenAI text-embedding-3-small (1536 dims)
  tokens       INT,
  metadata     JSONB DEFAULT '{}'
);
-- Índice ANN para búsqueda por similitud coseno (HNSW = rápido y preciso).
CREATE INDEX idx_chunk_embedding ON doc_chunk
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunk_producto  ON doc_chunk(producto_id);
CREATE INDEX idx_chunk_seccion   ON doc_chunk(seccion);

-- =============================================================================
-- VISTAS DE APOYO
-- =============================================================================
-- Comparador: matriz plan × cobertura lista para pintar tablas.
CREATE VIEW v_comparador AS
SELECT pr.nombre AS producto, pr.ramo_id, pl.nombre AS plan,
       c.nombre AS cobertura, pc.tipo, pc.limite, pc.deducible
FROM plan_cobertura pc
JOIN plan pl     ON pl.id = pc.plan_id
JOIN producto pr ON pr.id = pl.producto_id
JOIN cobertura c ON c.id = pc.cobertura_id;

-- Catálogo plano para recomendador / export.
CREATE VIEW v_catalogo AS
SELECT pr.id, pr.nombre, r.nombre AS ramo, pr.linea, pr.tipo_persona,
       pr.resumen, pr.es_digital, pr.url, pr.cotizador_url
FROM producto pr LEFT JOIN ramo r ON r.id = pr.ramo_id
WHERE pr.estado = 'activo';

-- =============================================================================
-- EJEMPLOS DE CONSULTA POR CASO DE USO
-- =============================================================================
-- (1) CHATBOT/RAG — top-5 chunks más relevantes a la pregunta del usuario:
--   SELECT contenido, url, seccion
--   FROM doc_chunk
--   ORDER BY embedding <=> $1::vector   -- $1 = embedding de la pregunta
--   LIMIT 5;
--
-- (2) COTIZACIÓN — coberturas incluidas + opcionales de un plan:
--   SELECT c.nombre, pc.tipo, pc.limite
--   FROM plan_cobertura pc JOIN cobertura c ON c.id = pc.cobertura_id
--   WHERE pc.plan_id = $1 AND pc.tipo IN ('incluida','opcional');
--
-- (3) COMPARADOR — qué planes de un ramo cubren cierta cobertura:
--   SELECT producto, plan, tipo, limite FROM v_comparador
--   WHERE cobertura ILIKE '%responsabilidad civil%';
--
-- (4) RECOMENDADOR — productos elegibles para un perfil (persona natural, 35 años):
--   SELECT DISTINCT pr.nombre, pr.resumen
--   FROM producto pr JOIN elegibilidad e ON e.producto_id = pr.id
--   WHERE pr.tipo_persona IN ('natural','ambas')
--     AND (e.edad_min IS NULL OR e.edad_min <= 35)
--     AND (e.edad_max IS NULL OR e.edad_max >= 35);
