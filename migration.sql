-- ═══════════════════════════════════════════════════════════════════════════
-- TanzRaum – Migration: Demo-Daten löschen + courses.price hinzufügen
-- Im Supabase SQL Editor ausführen
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Demo-Daten komplett löschen (Reihenfolge wegen Foreign Keys)
delete from booking_requests;
delete from slots;
delete from courses;
delete from rooms;
delete from teachers;
delete from locations;

-- 2. Preis-Spalte zu courses hinzufügen (falls noch nicht vorhanden)
alter table courses
  add column if not exists price numeric(10,2) default 0;

-- 3. once_date-Spalte zu courses hinzufügen (für einmalige Termine)
alter table courses
  add column if not exists once_date date;

-- Fertig! Die App startet jetzt mit leerer Datenbank.
-- Alle Daten werden über den Admin-Bereich angelegt.
