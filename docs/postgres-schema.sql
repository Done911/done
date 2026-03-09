-- PostgreSQL production schema for Delivery Company Management System

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('general_manager', 'hr', 'finance', 'supervisor')),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE drivers (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  iqama_number TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  nationality TEXT,
  date_of_birth DATE,
  join_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'vacation', 'suspended'))
);

CREATE TABLE driver_documents (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  iqama_copy TEXT,
  license_copy TEXT,
  contract_copy TEXT,
  personal_photo TEXT,
  iqama_expiry DATE,
  license_expiry DATE
);

CREATE TABLE vehicles (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ownership_type TEXT NOT NULL CHECK (ownership_type IN ('company_owned', 'driver_owned')),
  car_brand TEXT,
  car_model TEXT,
  plate_number TEXT UNIQUE NOT NULL,
  registration_expiry DATE,
  insurance_expiry DATE,
  status TEXT DEFAULT 'active'
);

CREATE TABLE applications (
  id BIGSERIAL PRIMARY KEY,
  app_name TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN ('orders', 'revenue')),
  target_value NUMERIC(12,2) NOT NULL
);

CREATE TABLE accounts (
  id BIGSERIAL PRIMARY KEY,
  app_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  real_user_name TEXT NOT NULL,
  real_user_iqama TEXT NOT NULL,
  real_user_phone TEXT NOT NULL,
  account_status TEXT NOT NULL CHECK (account_status IN ('available', 'rented', 'inactive'))
);

CREATE TABLE account_rentals (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  renter_name TEXT NOT NULL,
  renter_iqama TEXT,
  renter_phone TEXT,
  rent_start_date DATE NOT NULL,
  rent_end_date DATE,
  rent_price NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE daily_operations (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  driver_id BIGINT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  app_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  orders_count INT NOT NULL,
  total_revenue NUMERIC(12,2) NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  shift_hours NUMERIC(6,2) NOT NULL,
  target_progress_percentage NUMERIC(5,2) DEFAULT 0
);

CREATE TABLE finance_transactions (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT REFERENCES drivers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('salary', 'advance', 'debt', 'bonus', 'deduction', 'user_rent')),
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT
);

CREATE INDEX idx_daily_operations_driver_date ON daily_operations(driver_id, date);
CREATE INDEX idx_finance_transactions_driver_date ON finance_transactions(driver_id, date);
CREATE INDEX idx_accounts_app_status ON accounts(app_id, account_status);
