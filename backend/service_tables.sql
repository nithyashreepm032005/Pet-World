-- PetWorld - Services feature tables (reference / manual alternative)
--
-- You normally DON'T need to run this file: `python setup_services.py`
-- creates these same tables automatically.  Use it only if you prefer SQL.

USE petworld;

CREATE TABLE IF NOT EXISTS employees (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(120) NOT NULL UNIQUE,
    gender        VARCHAR(10)  NOT NULL,            -- Male / Female
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_bookings (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    booking_id      VARCHAR(20) NOT NULL UNIQUE,
    user_id         INT NOT NULL,
    service_id      INT NOT NULL,
    service_name    VARCHAR(100) NOT NULL,
    service_mode    VARCHAR(10)  NOT NULL,          -- store / home
    booking_date    DATE NOT NULL,
    booking_time    TIME NOT NULL,
    duration_hours  DECIMAL(3,1) NOT NULL,
    provider_gender VARCHAR(10),                    -- home only
    number_of_dogs  INT NOT NULL DEFAULT 1,
    price           DECIMAL(10,2) NOT NULL,
    address         TEXT,                           -- home only
    latitude        DECIMAL(10,7),                  -- home only
    longitude       DECIMAL(10,7),                  -- home only
    employee_id     INT,
    booking_status  VARCHAR(30) NOT NULL DEFAULT 'Booking Confirmed',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sb_user (user_id),
    INDEX idx_sb_employee (employee_id),
    FOREIGN KEY (user_id)     REFERENCES users(id),
    FOREIGN KEY (service_id)  REFERENCES services(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS employee_locations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    booking_id  INT NOT NULL UNIQUE,                -- one latest position per booking
    latitude    DECIMAL(10,7) NOT NULL,
    longitude   DECIMAL(10,7) NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (booking_id)  REFERENCES service_bookings(id) ON DELETE CASCADE
);

-- Handy checks while testing:
-- SELECT id, name, email, gender FROM employees;
-- SELECT booking_id, service_mode, booking_status, employee_id FROM service_bookings;
-- SELECT * FROM employee_locations;
