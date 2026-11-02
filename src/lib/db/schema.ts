export const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  );

  CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    category TEXT NOT NULL CHECK (length(trim(category)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    opening_hours TEXT NOT NULL CHECK (length(trim(opening_hours)) > 0)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating INTEGER NOT NULL
      CHECK (typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5),
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at TEXT NOT NULL
      CHECK (length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z'),
    UNIQUE (place_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tour_slots (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
    starts_at TEXT NOT NULL
      CHECK (length(starts_at) = 24 AND starts_at GLOB '????-??-??T??:??:??.???Z'),
    capacity INTEGER NOT NULL
      CHECK (typeof(capacity) = 'integer' AND capacity > 0)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    slot_id TEXT NOT NULL REFERENCES tour_slots(id) ON DELETE RESTRICT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    seats INTEGER NOT NULL CHECK (typeof(seats) = 'integer' AND seats > 0),
    created_at TEXT NOT NULL
      CHECK (length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z')
  );
`;
