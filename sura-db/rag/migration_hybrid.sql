-- Búsqueda híbrida: añade full-text en español + índices para lexical search.
-- Idempotente. Ejecutar una vez sobre la base ya cargada.

-- tsvector generado a partir del contenido (config 'spanish' = stemming + stopwords ES)
ALTER TABLE doc_chunk
  ADD COLUMN IF NOT EXISTS contenido_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('spanish', contenido)) STORED;

CREATE INDEX IF NOT EXISTS idx_chunk_tsv ON doc_chunk USING gin (contenido_tsv);

-- trigram sobre nombre de producto/cobertura para acierto exacto por nombre
CREATE INDEX IF NOT EXISTS idx_producto_nombre_trgm2 ON producto USING gin (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cobertura_nombre_trgm2 ON cobertura USING gin (nombre gin_trgm_ops);
