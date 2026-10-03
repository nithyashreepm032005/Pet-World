-- PetWorld MySQL Schema
-- You do NOT have to run this manually: `db.create_all()` (invoked by
-- seed.py) will create these tables for you automatically. This file
-- is provided for reference / manual setup if preferred.

CREATE DATABASE IF NOT EXISTS petworld;
USE petworld;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'customer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dog_breeds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    breed_name VARCHAR(100) NOT NULL,
    image VARCHAR(255),
    gender VARCHAR(20),
    color VARCHAR(50),
    vaccination_status VARCHAR(50),
    health_information TEXT,
    availability BOOLEAN DEFAULT TRUE
);

CREATE TABLE dog_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    breed_id INT NOT NULL,
    age_months INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    availability BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (breed_id) REFERENCES dog_breeds(id) ON DELETE CASCADE
);

CREATE TABLE food_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand VARCHAR(50) DEFAULT 'MBN',
    product_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    image VARCHAR(255)
);

CREATE TABLE food_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    food_id INT NOT NULL,
    weight_kg DECIMAL(5,2) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 100,
    FOREIGN KEY (food_id) REFERENCES food_products(id) ON DELETE CASCADE
);

CREATE TABLE services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    description TEXT,
    image VARCHAR(255),
    availability BOOLEAN DEFAULT TRUE
);

CREATE TABLE service_packages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,
    package_name VARCHAR(100) NOT NULL,
    duration VARCHAR(50),
    price DECIMAL(10,2) NOT NULL,
    availability BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE favourites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    item_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE cart (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cart_id INT NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    item_id INT NOT NULL,
    variant_id INT,
    quantity INT DEFAULT 1,
    selected_date VARCHAR(20),
    selected_time VARCHAR(20),
    price DECIMAL(10,2) NOT NULL,
    details JSON,
    FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE
);

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(30) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    delivery_address VARCHAR(500),
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Pending',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    item_id INT NOT NULL,
    quantity INT DEFAULT 1,
    selected_age INT,
    selected_weight DECIMAL(5,2),
    price DECIMAL(10,2) NOT NULL,
    details JSON,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id VARCHAR(30) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    package_id INT NOT NULL,
    booking_date VARCHAR(20),
    booking_time VARCHAR(20),
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (package_id) REFERENCES service_packages(id)
);

CREATE TABLE password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    expiry DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
