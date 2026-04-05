-- Enable vector extension in both schemas
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
-- Make vector type available in public schema
ALTER EXTENSION vector SET SCHEMA public;
