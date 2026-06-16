# GrundRiss by Dittrich

Facility- & Genehmigungsmanagement für Industriekunden.

## Setup

### 1. Supabase – Datenbank einrichten

Im Supabase SQL Editor folgendes ausführen:

```sql
-- Lagepläne
create table plaene (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  name text not null,
  file_name text,
  file_url text
);

-- Genehmigungen
create table genehmigungen (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  name text not null,
  objekt text,
  behoerde text,
  frist date,
  status text default 'Offen'
);

-- Row Level Security aktivieren
alter table plaene enable row level security;
alter table genehmigungen enable row level security;

-- Nur eingeloggte User dürfen lesen/schreiben
create policy "Authenticated users only" on plaene for all using (auth.role() = 'authenticated');
create policy "Authenticated users only" on genehmigungen for all using (auth.role() = 'authenticated');
```

### 2. Supabase – Storage einrichten

In Supabase unter Storage: neuen Bucket `plaene` anlegen (public: true).

### 3. Lokale Entwicklung

```bash
npm install
npm start
```

### 4. Deployment auf Vercel

1. Code auf GitHub hochladen
2. Auf vercel.com: "New Project" → GitHub Repo auswählen
3. Environment Variables setzen:
   - REACT_APP_SUPABASE_URL
   - REACT_APP_SUPABASE_ANON_KEY
4. Deploy klicken

## Erster Nutzer anlegen

In Supabase unter Authentication → Users → "Invite user" oder "Add user".
