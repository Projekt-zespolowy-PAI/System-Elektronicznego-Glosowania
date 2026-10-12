# 🗳️ System E-Głosowania

Bezpieczny system elektronicznego głosowania wykorzystujący szyfrowanie homomorficzne Pailliera oraz **Cloudflare Pages** z bazą danych D1.

🌐 **Demo online:** [https://e-glosowanie.pages.dev/](https://e-glosowanie.pages.dev/)

## 📋 Opis Projektu

System zapewnia bezpieczne, anonimowe głosowanie elektroniczne z wykorzystaniem zaawansowanych technik kryptograficznych:
- **Szyfrowanie homomorficzne Pailliera** - umożliwia agregację głosów bez ich odszyfrowania
- **Shamir's Secret Sharing** - rozproszenie klucza deszyfrującego między członków komisji
- **Iteracyjne hashowanie SHA-256** - bezpieczna identyfikacja użytkowników
- **Cloudflare Workers + D1** - serverless backend z bazą SQLite

## 🎯 Funkcjonalności

### 👤 Dla Wyborców
- **Generator Hash** - generowanie unikalnego identyfikatora z danych osobowych
- **Bezpieczne logowanie** - hash użytkownika + hasło
- **Anonimowe głosowanie** - szyfrowanie zapewnia pełną prywatność
- **Weryfikacja statusu** - sprawdzenie czy głos został oddany

### 👥 Dla Komisji Wyborczej (5 członków, próg 3/5)
- **Tworzenie głosowań** - konfiguracja kandydatów, dat rozpoczęcia/zakończenia
- **Automatyczny podział kluczy** - każdy członek otrzymuje fragment klucza deszyfrującego
- **Finalizacja głosowania** - wymaga zgody minimum 3 członków komisji
- **Odszyfrowanie wyników** - rekonstrukcja klucza i ujawnienie wyników

## 🏗️ Struktura Projektu

```
System-Elektronicznego-Glosowania/
├── index.html              # 🏠 Strona główna (głosowanie + wyniki)
├── commission.html         # 👥 Panel komisji wyborczej
├── hash-generator.html     # ⚡ Generator hash (standalone)
├── simulation.html         # 🧪 Symulacja szyfrowania Pailliera
├── wrangler.toml           # ⚙️ Konfiguracja Cloudflare (wypełnij własnymi wartościami)
├── package.json            # 📦 Zależności npm
├── _routes.json            # 🔀 Routing API
│
├── css/                    # 🎨 Style CSS
│   ├── common.css          # Wspólne style (navbar, buttons, etc.)
│   ├── home.css            # Style dla strony głównej
│   └── commission.css      # Style dla panelu komisji
│
├── js/                     # 📜 JavaScript
│   ├── common.js           # Wspólne funkcje (sesja, API, nawigacja)
│   ├── home.js             # Logika strony głównej
│   └── commission.js       # Logika panelu komisji
│
├── sql/                    # 🗄️ Pliki SQL
│   ├── 01-create-tables.sql  # Schema bazy danych
│   └── 02-insert-users.sql   # Przykładowe dane testowe (anonimowe hashe)
│
├── functions/              # ⚡ Cloudflare Functions (API)
│   └── api/
│       └── [[path]].js     # Główny router API
│
└── utils/                  # 🔐 Narzędzia kryptograficzne
    └── paillier.js         # Paillier + Shamir implementation
```

## 📦 Technologie

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Cloudflare Pages + Functions (Serverless)
- **Baza danych**: Cloudflare D1 (SQLite)
- **Biblioteki**: big-integer (operacje na dużych liczbach w Paillier)
- **Kryptografia**:
  - Paillier Homomorphic Encryption
  - SHA-256 (iteracyjne hashowanie)
  - Shamir's Secret Sharing (threshold 3/5)

## 🚀 Uruchomienie lokalne

### Wymagania
- Node.js 18+
- Konto Cloudflare

### Instalacja

```powershell
# 1. Sklonuj repozytorium
git clone https://github.com/Projekt-zespolowy-PAI/System-Elektronicznego-Glosowania.git
cd System-Elektronicznego-Glosowania

# 2. Zainstaluj zależności
npm install

# 3. Zaloguj się do Cloudflare
wrangler login

# 4. Utwórz bazę danych D1
wrangler d1 create e-voting-db
# Skopiuj database_id i wklej do wrangler.toml

# 5. Zainicjalizuj schemat bazy
wrangler d1 execute e-voting-db --file=./sql/01-create-tables.sql

# 6. (Opcjonalnie) Dodaj przykładowych użytkowników
wrangler d1 execute e-voting-db --file=./sql/02-insert-users.sql

# 7. Uruchom lokalnie
npm run dev
```

Otwórz: http://localhost:8788

### Konfiguracja `wrangler.toml`

Uzupełnij `wrangler.toml` swoimi wartościami po utworzeniu bazy:

```toml
name = "YOUR_WORKER_NAME"

[[d1_databases]]
binding = "DB"
database_name = "YOUR_DATABASE_NAME"
database_id = "YOUR_DATABASE_ID"  # z: wrangler d1 create <nazwa>
```

## 🔐 Architektura Bezpieczeństwa

### Szyfrowanie Homomorficzne Pailliera
- **Homomorficzność addytywna**: `E(m1) × E(m2) = E(m1 + m2)`
- Umożliwia agregację głosów bez ich deszyfracji
- Każdy głos to zaszyfrowany wektor z kodowaniem pozycyjnym
- Suma wszystkich głosów obliczana bez ujawniania indywidualnych głosów

### Shamir's Secret Sharing (Threshold 3/5)
- Klucz prywatny dzielony na **5 części** (po jednej dla każdego członka komisji)
- Do odszyfrowania wymagane minimum **3 części**
- Niemożliwe odszyfrowanie przez pojedynczego członka
- Odporność na kompromitację do 2 członków

### Bezpieczna Identyfikacja
- **Hash użytkownika**: SHA-256^n(Imię|Nazwisko|PESEL) — n iteracji indywidualnych dla każdego użytkownika
- Jednokierunkowa funkcja — niemożliwe odtworzenie danych osobowych
- **Hash hasła**: SHA-256(hasło) — przechowywany w bazie

## 🔄 Przepływ Aplikacji

### 1️⃣ Konfiguracja Użytkownika
```
hash-generator.html → generuje user_hash
Administrator dodaje użytkownika do bazy (user_hash + password_hash)
```

### 2️⃣ Tworzenie Głosowania (Komisja)
```
commission.html → Logowanie członka komisji
↓
Wypełnienie formularza (nazwa, kandydaci, daty)
↓
Automatyczna generacja kluczy Pailliera
↓
Podział klucza prywatnego (5 części, threshold=3)
↓
Każdy członek komisji otrzymuje 1 fragment
```

### 3️⃣ Głosowanie (Wyborca)
```
index.html → Logowanie (user_hash + hasło)
↓
Wybór kandydata z listy aktywnych głosowań
↓
Tworzenie wektora: [0, 1, 0, ...]
↓
Kodowanie pozycyjne + szyfrowanie Pailliera
↓
Wysłanie do API → agregacja homomorficzna
```

### 4️⃣ Finalizacja i Wyniki (Komisja)
```
Minimum 3 członków komisji głosuje za finalizacją
↓
Członkowie wprowadzają swoje fragmenty klucza (min. 3)
↓
Rekonstrukcja klucza prywatnego (Shamir)
↓
Odszyfrowanie zagregowanych wyników
↓
Wyświetlenie liczby głosów dla każdego kandydata
```

## 📊 Schema Bazy Danych (D1/SQLite)

Szczegółowy schemat: [`sql/01-create-tables.sql`](sql/01-create-tables.sql)

**Główne tabele:**
- `users` — użytkownicy (wyborcy i komisja)
- `elections` — głosowania
- `candidates` — kandydaci w głosowaniach
- `votes` — zaszyfrowane głosy
- `key_shares` — fragmenty klucza prywatnego dla komisji
- `sessions` — sesje użytkowników
- `finalization_votes` — głosy członków komisji za finalizacją

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` — Logowanie użytkownika
- `GET /api/auth/verify` — Weryfikacja sesji

### Elections
- `GET /api/elections` — Lista wszystkich głosowań (aktywne + zakończone)
- `GET /api/elections/active` — Tylko aktywne głosowania
- `GET /api/elections/closed` — Zakończone głosowania
- `GET /api/elections/:id` — Szczegóły głosowania
- `POST /api/elections/create` — Utworzenie głosowania (komisja)
- `POST /api/elections/:id/close` — Zamknięcie głosowania (komisja)

### Voting
- `POST /api/votes/cast` — Oddanie zaszyfrowanego głosu
- `GET /api/votes/check` — Sprawdzenie czy użytkownik już głosował

### Commission
- `GET /api/key-shares/my-fragments` — Fragmenty klucza zalogowanego członka komisji
- `POST /api/elections/:id/vote-finalize` — Głosowanie za finalizacją
- `POST /api/elections/:id/save-results` — Zapis odszyfrowanych wyników

### Results
- `GET /api/results/:id` — Publiczne wyniki zakończonego głosowania

## 🤝 Autorzy

Projekt zespołowy PAI — Politechnika (2025)
Jakub Ujma
Rafał Pawłowski
Jakub Mazela
Kamil Pułka
## 📄 Licencja

MIT License

