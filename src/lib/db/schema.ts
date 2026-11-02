export const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
  );

  CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    category TEXT NOT NULL CHECK (length(trim(category)) > 0),
    city TEXT NOT NULL CHECK (length(trim(city)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    address TEXT NOT NULL CHECK (length(trim(address)) > 0)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating INTEGER NOT NULL
      CHECK (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    created_at TEXT NOT NULL
      CHECK (length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z'),
    updated_at TEXT NOT NULL
      CHECK (length(updated_at) = 24 AND updated_at GLOB '????-??-??T??:??:??.???Z'),
    UNIQUE (place_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tour_slots (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
    start_time TEXT NOT NULL
      CHECK (length(start_time) = 24 AND start_time GLOB '????-??-??T??:??:??.???Z'),
    seat_capacity INTEGER NOT NULL
      CHECK (typeof(seat_capacity) = 'integer' AND seat_capacity > 0)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    tour_slot_id TEXT NOT NULL REFERENCES tour_slots(id) ON DELETE RESTRICT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    seats INTEGER NOT NULL CHECK (typeof(seats) = 'integer' AND seats > 0),
    created_at TEXT NOT NULL
      CHECK (length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z')
  );
`;
