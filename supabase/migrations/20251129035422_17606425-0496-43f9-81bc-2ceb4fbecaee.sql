-- Create producer stock table
CREATE TABLE IF NOT EXISTS public.producer_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  company_name TEXT NOT NULL,
  is_perishable BOOLEAN NOT NULL DEFAULT false,
  shelf_life_days INTEGER NOT NULL,
  storage_temperature TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  stock_batch_quantity INTEGER NOT NULL,
  quantity_stocked INTEGER NOT NULL,
  manufacturing_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create supermarket stock table
CREATE TABLE IF NOT EXISTS public.supermarket_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  company_name TEXT NOT NULL,
  is_perishable BOOLEAN NOT NULL DEFAULT false,
  shelf_life_days INTEGER NOT NULL,
  storage_temperature TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  manufacturing_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL,
  source_producer TEXT,
  transfer_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create local market stock table
CREATE TABLE IF NOT EXISTS public.localmarket_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  company_name TEXT NOT NULL,
  is_perishable BOOLEAN NOT NULL DEFAULT false,
  shelf_life_days INTEGER NOT NULL,
  storage_temperature TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  manufacturing_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL,
  source_supermarket TEXT,
  transfer_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create historical sales table (for ML predictions)
CREATE TABLE IF NOT EXISTS public.historical_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity_sold INTEGER NOT NULL,
  revenue DECIMAL(10,2) NOT NULL,
  wastage_units INTEGER DEFAULT 0,
  supermarket_branch TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.producer_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supermarket_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localmarket_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_sales ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth for this demo)
CREATE POLICY "Enable read access for all users" ON public.producer_stock FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.producer_stock FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.producer_stock FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.producer_stock FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.supermarket_stock FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.supermarket_stock FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.supermarket_stock FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.supermarket_stock FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.localmarket_stock FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.localmarket_stock FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.localmarket_stock FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.localmarket_stock FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.historical_sales FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.historical_sales FOR INSERT WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_producer_stock_product ON public.producer_stock(product_name);
CREATE INDEX idx_producer_stock_expiry ON public.producer_stock(expiry_date);
CREATE INDEX idx_supermarket_stock_product ON public.supermarket_stock(product_name);
CREATE INDEX idx_supermarket_stock_expiry ON public.supermarket_stock(expiry_date);
CREATE INDEX idx_localmarket_stock_product ON public.localmarket_stock(product_name);
CREATE INDEX idx_historical_sales_product_date ON public.historical_sales(product_name, date);