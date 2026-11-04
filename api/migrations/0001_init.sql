
PRAGMA foreign_keys = ON;

CREATE TABLE homes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    member_order INTEGER NOT NULL,

    CONSTRAINT fk_members_home
        FOREIGN KEY (home_id)
        REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_members_home_order
        UNIQUE (home_id, member_order),

    CONSTRAINT chk_members_order
        CHECK (member_order >= 0)
);

CREATE TABLE bills (
    id TEXT PRIMARY KEY NOT NULL,
    home_id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    total_cents INTEGER NOT NULL,

    CONSTRAINT fk_bills_home
        FOREIGN KEY (home_id)
        REFERENCES homes(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_bills_total
        CHECK (total_cents > 0)
);

CREATE TABLE shares (
    id TEXT PRIMARY KEY NOT NULL,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT,
    idempotency_key TEXT,

    CONSTRAINT fk_shares_bill
        FOREIGN KEY (bill_id)
        REFERENCES bills(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shares_member
        FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_shares_bill_member
        UNIQUE (bill_id, member_id),

    CONSTRAINT chk_shares_amount
        CHECK (amount_cents > 0),

    CONSTRAINT chk_shares_payment
        CHECK (
            (paid_at IS NULL AND idempotency_key IS NULL)
            OR
            (paid_at IS NOT NULL AND idempotency_key IS NOT NULL)
        )
);

CREATE INDEX idx_members_home_order
    ON members(home_id, member_order);

CREATE INDEX idx_bills_home
    ON bills(home_id);

CREATE INDEX idx_shares_bill
    ON shares(bill_id);

CREATE INDEX idx_shares_member
    ON shares(member_id);
