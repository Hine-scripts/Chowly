-- ============================================
-- CHOWLY DATABASE SCHEMA
-- ============================================

-- ============================================
-- USERS
-- Customers and staff members
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- RESTAURANTS
-- Each restaurant using Chowly
-- ============================================
CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- RESTAURANT STAFF
-- ============================================
CREATE TABLE IF NOT EXISTS restaurant_staff (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    restaurant_id INTEGER NOT NULL
        REFERENCES restaurants(id) ON DELETE CASCADE,

    role VARCHAR(20) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, restaurant_id)
);


-- ============================================
-- CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,

    restaurant_id INTEGER NOT NULL
        REFERENCES restaurants(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    parent_category_id INTEGER
        REFERENCES categories(id) ON DELETE CASCADE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- MENU ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,

    restaurant_id INTEGER NOT NULL
        REFERENCES restaurants(id) ON DELETE CASCADE,

    category_id INTEGER NOT NULL
        REFERENCES categories(id) ON DELETE CASCADE,

    name VARCHAR(150) NOT NULL,

    description TEXT,

    price DECIMAL(10, 2) NOT NULL,

    preparation_time INTEGER NOT NULL,

    item_type VARCHAR(20) NOT NULL,

    available BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- MENU OPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS menu_options (
    id SERIAL PRIMARY KEY,

    restaurant_id INTEGER NOT NULL
        REFERENCES restaurants(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    option_type VARCHAR(30) NOT NULL,

    price DECIMAL(10, 2),

    preparation_time INTEGER,

    available BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- MENU ITEM OPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS menu_item_options (
    id SERIAL PRIMARY KEY,

    menu_item_id INTEGER NOT NULL
        REFERENCES menu_items(id) ON DELETE CASCADE,

    menu_option_id INTEGER NOT NULL
        REFERENCES menu_options(id) ON DELETE CASCADE,

    required BOOLEAN DEFAULT FALSE,

    max_quantity INTEGER DEFAULT 1,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(menu_item_id, menu_option_id)
);


-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,

    restaurant_id INTEGER NOT NULL
        REFERENCES restaurants(id),

    customer_id INTEGER NOT NULL
        REFERENCES users(id),

    customer_name VARCHAR(100) NOT NULL,

    customer_phone VARCHAR(30) NOT NULL,

    table_number VARCHAR(30) NOT NULL,

    special_request TEXT,

    waiter_id INTEGER
        REFERENCES restaurant_staff(id),

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    estimated_wait_minutes INTEGER,

    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- ADD ORDER CUSTOMER DETAILS TO EXISTING DATABASES
-- ============================================
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS table_number VARCHAR(30);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS special_request TEXT;


-- ============================================
-- ORDER ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL
        REFERENCES orders(id) ON DELETE CASCADE,

    menu_item_id INTEGER NOT NULL
        REFERENCES menu_items(id),

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    unit_price DECIMAL(10, 2) NOT NULL,

    chef_id INTEGER
        REFERENCES restaurant_staff(id),

    bartender_id INTEGER
        REFERENCES restaurant_staff(id),

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PENDING';


-- ============================================
-- ORDER ITEM OPTIONS
-- Chosen customization options for an order item
-- ============================================
CREATE TABLE IF NOT EXISTS order_item_options (
    id SERIAL PRIMARY KEY,

    order_item_id INTEGER NOT NULL
        REFERENCES order_items(id) ON DELETE CASCADE,

    menu_option_id INTEGER NOT NULL
        REFERENCES menu_options(id),

    quantity INTEGER NOT NULL DEFAULT 1
        CHECK (quantity > 0),

    unit_price DECIMAL(10, 2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- COMPLAINTS
-- ============================================
CREATE TABLE IF NOT EXISTS complaints (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL
        REFERENCES orders(id) ON DELETE CASCADE,

    customer_id INTEGER NOT NULL
        REFERENCES users(id),

    description TEXT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- RATINGS
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL
        REFERENCES orders(id) ON DELETE CASCADE,

    customer_id INTEGER NOT NULL
        REFERENCES users(id),

    rating INTEGER NOT NULL
        CHECK (rating BETWEEN 1 AND 5),

    comment TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(order_id, customer_id)
);


-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL
        REFERENCES orders(id) ON DELETE CASCADE,

    amount DECIMAL(10, 2) NOT NULL,

    payment_method VARCHAR(30) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    transaction_reference VARCHAR(100) UNIQUE,

    paid_at TIMESTAMP
);