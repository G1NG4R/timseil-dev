-- contact_messages — the only table holding personal data, and the only one the
-- public API never reads. Handbook ch. 16.
--
-- Two things are stored as hashes and never as themselves: the visitor's IP and
-- the message body used for the idempotency key. The honeypot field `company`
-- is not stored at all — a non-empty value means the submission is discarded,
-- so there is nothing to keep.

-- +goose Up

CREATE TABLE contact_messages (
    -- The receipt the sender can quote back. Handed out by the handler (C6),
    -- not by a sequence, because it appears in the 202 response body.
    id                text        PRIMARY KEY
                      CONSTRAINT contact_messages_id_present_ck CHECK (btrim(id) <> ''),

    received_at       timestamptz NOT NULL DEFAULT now(),

    -- ContactRequest.ts — the timestamp the form put in the payload. Part of
    -- the idempotency key, so it is the client's clock on purpose.
    client_ts         timestamptz NOT NULL,

    name              text        NOT NULL
                      CONSTRAINT contact_messages_name_length_ck CHECK (char_length(name) BETWEEN 1 AND 80),

    -- The second line of defence against mail header injection. The first is
    -- the validator in C6. Reply-To is built from this address; a \r or \n in
    -- it lets an attacker append their own headers and turn the form into a
    -- spam relay on this domain, with the reputation SPF and DKIM just built.
    -- Two lines of constraint for a finding the build plan (11.3) and the
    -- handbook (ch. 16) both raise independently.
    email             text        NOT NULL
                      CONSTRAINT contact_messages_email_length_ck CHECK (char_length(email) <= 254)
                      CONSTRAINT contact_messages_email_no_crlf_ck
                          CHECK (position(E'\r' IN email) = 0 AND position(E'\n' IN email) = 0),

    -- Upper bounds only. minLength (2 for name, 20 for message) is a UX rule and
    -- belongs in the handler; maxLength protects the database and belongs here.
    -- Duplicating the contract is kept to what the storage itself needs.
    message           text        NOT NULL
                      CONSTRAINT contact_messages_message_length_ck CHECK (char_length(message) <= 4000),

    -- SHA-256, 32 bytes. Part of the idempotency key so a resend of the same
    -- text is recognised without comparing four kilobytes.
    message_hash      bytea       NOT NULL
                      CONSTRAINT contact_messages_message_hash_size_ck CHECK (octet_length(message_hash) = 32),

    -- The IP, never in the clear. NOTE for C6: a bare SHA-256 of an IPv4 is
    -- reversible in seconds — the whole address space is 2^32 — so this has to
    -- be salted with a server-side pepper to be worth anything.
    ip_hash           bytea       NOT NULL
                      CONSTRAINT contact_messages_ip_hash_size_ck CHECK (octet_length(ip_hash) = 32),

    dwell_ms          integer     NOT NULL
                      CONSTRAINT contact_messages_dwell_ck CHECK (dwell_ms >= 0),

    delivery_status   text        NOT NULL DEFAULT 'queued'
                      CONSTRAINT contact_messages_delivery_status_ck
                          CHECK (delivery_status IN ('queued', 'sent', 'failed')),
    delivery_attempts integer     NOT NULL DEFAULT 0
                      CONSTRAINT contact_messages_attempts_ck CHECK (delivery_attempts >= 0),
    delivered_at      timestamptz,
    last_error        text,
    mail_message_id   text,

    -- 'sent' and a delivery time are the same fact stated twice; they may not
    -- disagree.
    CONSTRAINT contact_messages_delivered_iff_sent_ck
        CHECK ((delivery_status = 'sent') = (delivered_at IS NOT NULL))
);

COMMENT ON TABLE contact_messages IS
    'The only table with personal data, and the only one the public API never reads.';

-- Idempotency, literally handbook ch. 16: ts + email + message hash. A double
-- click sends once. lower(email) so the same address in different case does not
-- slip through as a second message, which is why this is an expression index
-- and not a table constraint.
--   SELECT id FROM contact_messages
--    WHERE client_ts = $1 AND lower(email) = lower($2) AND message_hash = $3
CREATE UNIQUE INDEX contact_messages_idempotency_idx
    ON contact_messages (client_ts, lower(email), message_hash);

COMMENT ON INDEX contact_messages_idempotency_idx IS
    'C6: SELECT id FROM contact_messages WHERE client_ts = $1 AND lower(email) = lower($2) AND message_hash = $3';

-- No index on received_at. The query that wants it is the retention purge from
-- L7 (DELETE ... WHERE received_at < now() - interval '...'), and that job does
-- not exist yet. It arrives with the job, not before it.

-- +goose Down

DROP TABLE contact_messages;
