-- E-Voting System Database Schema for Cloudflare D1
-- Plik: 01-create-tables.sql
-- Opis: Tworzenie wszystkich tabel w bazie danych

-- ============================================================================
-- TABELA: users
-- Przechowuje użytkowników (wyborców i członków komisji)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of name|surname|pesel with iterations
    password_hash TEXT NOT NULL, -- SHA-256 hash of the password
    is_commission BOOLEAN DEFAULT 0, -- Whether user is a commission member
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABELA: elections
-- Przechowuje informacje o głosowaniach
-- ============================================================================
CREATE TABLE IF NOT EXISTS elections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, active, closed, finalized
    public_key_n TEXT NOT NULL, -- Paillier public key n
    public_key_g TEXT NOT NULL, -- Paillier public key g
    threshold INTEGER NOT NULL, -- Minimum number of key shares needed to decrypt
    total_shares INTEGER NOT NULL, -- Total number of key shares
    encrypted_result TEXT, -- Encrypted vote tally (JSON array)
    decrypted_result TEXT, -- Final decrypted results (JSON array)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABELA: candidates
-- Przechowuje kandydatów w głosowaniach
-- ============================================================================
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    election_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    candidate_index INTEGER NOT NULL, -- Index in the vote vector
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    UNIQUE(election_id, candidate_index)
);

-- ============================================================================
-- TABELA: votes
-- Przechowuje zaszyfrowane głosy
-- ============================================================================
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    election_id INTEGER NOT NULL,
    user_hash TEXT NOT NULL,
    encrypted_vote TEXT NOT NULL, -- JSON array of encrypted vote vector
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    UNIQUE(election_id, user_hash) -- One vote per user per election
);

-- ============================================================================
-- TABELA: key_shares
-- Przechowuje fragmenty klucza prywatnego dla członków komisji
-- ============================================================================
CREATE TABLE IF NOT EXISTS key_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    election_id INTEGER NOT NULL,
    user_hash TEXT NOT NULL, -- Commission member who owns this share
    share_index INTEGER NOT NULL, -- Index of the key share (1 to 5)
    share_value TEXT NOT NULL, -- Private key share
    is_used BOOLEAN DEFAULT 0, -- Whether this share has been used for decryption
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    FOREIGN KEY (user_hash) REFERENCES users(user_hash) ON DELETE CASCADE,
    UNIQUE(election_id, user_hash)
);

-- ============================================================================
-- TABELA: sessions
-- Przechowuje sesje użytkowników (opcjonalne)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, -- Session token (random UUID)
    user_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_hash) REFERENCES users(user_hash) ON DELETE CASCADE
);

-- ============================================================================
-- TABELA: finalization_votes
-- Przechowuje głosy finalizacyjne członków komisji
-- ============================================================================
CREATE TABLE IF NOT EXISTS finalization_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    election_id INTEGER NOT NULL,
    user_hash TEXT NOT NULL, -- Commission member casting finalization vote
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    FOREIGN KEY (user_hash) REFERENCES users(user_hash) ON DELETE CASCADE,
    UNIQUE(election_id, user_hash) -- One finalization vote per member per election
);

-- ============================================================================
-- INDEKSY dla lepszej wydajności zapytań
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
CREATE INDEX IF NOT EXISTS idx_votes_election_id ON votes(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_hash ON votes(user_hash);
CREATE INDEX IF NOT EXISTS idx_candidates_election_id ON candidates(election_id);
CREATE INDEX IF NOT EXISTS idx_key_shares_election_id ON key_shares(election_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_finalization_votes_election_id ON finalization_votes(election_id);
