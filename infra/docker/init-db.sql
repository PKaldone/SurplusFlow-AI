-- Initial database setup for SurplusFlow AI
-- This runs automatically when the postgres container is first created

-- Create app role with restricted permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'surplusflow_app') THEN
        CREATE ROLE surplusflow_app WITH LOGIN PASSWORD 'sfapp_local_dev';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE surplusflow TO surplusflow_app;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
