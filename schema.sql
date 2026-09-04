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
-- Connects users to restaurants and gives them
-- roles such as WAITER, CHEF or BARTENDER
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
-- Supports parent/child menu categories
--
-- Example:
-- Main Meals
--   ├── Local
--   └── Continental
--
-- Drinks
--   ├── Alcoholic
--   └── Non-Alcoholic
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
-- Actual food and drink items sold by restaurants
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
-- Reusable customization/add-on options
--
-- Examples:
-- Chicken
-- Beef
-- Turkey
-- Ponmo
-- Egg
-- Ewedu
-- Gbegiri
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
-- Connects menu items to their available
-- customization options
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
-- Customer orders placed at a restaurant
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,

    restaurant_id INTEGER NOT NULL
        REFERENCES restaurants(id),

    customer_id INTEGER NOT NULL
        REFERENCES users(id),

    waiter_id INTEGER
        REFERENCES restaurant_staff(id),

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    estimated_wait_minutes INTEGER,

    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- ORDER ITEMS
-- Individual items within an order
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
        REFERENCES restaurant_staff(id)
);


-- ============================================
-- COMPLAINTS
-- Customer complaints related to orders
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
-- Customer ratings for completed orders
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
-- Records customer payments
--
-- Pretend payments are allowed by the assignment,
-- but the application must clearly label them
-- as pretend/demo payments.
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

