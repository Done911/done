-- PostgreSQL schema proposal for production
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('general_manager','hr','finance','supervisor')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE couriers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT,
  contract_end_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE courier_documents (
  id BIGSERIAL PRIMARY KEY,
  courier_id BIGINT REFERENCES couriers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_operations (
  id BIGSERIAL PRIMARY KEY,
  courier_id BIGINT REFERENCES couriers(id),
  op_date DATE NOT NULL,
  shift TEXT NOT NULL,
  orders_count INT NOT NULL,
  target_count INT NOT NULL,
  commission NUMERIC(12,2) NOT NULL,
  advances NUMERIC(12,2) DEFAULT 0,
  debt NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE finance_transactions (
  id BIGSERIAL PRIMARY KEY,
  courier_id BIGINT REFERENCES couriers(id),
  tx_date DATE NOT NULL,
  tx_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
