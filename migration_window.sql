-- TanzRaum – Migration: Zeitfenster-Support
-- Im Supabase SQL Editor ausführen

-- Nichts zu ändern am Schema — der type 'window' wird einfach als neuer
-- Wert in der bestehenden slots.type Spalte verwendet.
-- Optional: Kommentar zur Dokumentation
comment on column slots.type is 'free | booked | blocked | pending | window';
