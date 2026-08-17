package middleware

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/netip"
)

// IPHasher turns a client address into a stable, non-reversible label.
//
// A bare SHA-256 would not do. IPv4 is 2^32 addresses, so an unkeyed digest is
// a dictionary anyone can build in seconds — the hash would be a spelling of
// the address, not a replacement for it. The key makes that impossible.
//
// The key is random per process and never leaves it. That is deliberately not a
// configured secret: nothing needs to correlate these labels across a restart
// (the rate limiter's memory is ten minutes and the logs are read by request
// id), so a value nobody can leak is better than a value somebody has to
// manage. The contact form's stored ip_hash in C6 is a different problem with a
// different answer — that one persists, so it needs a configured pepper.
type IPHasher struct {
	key [32]byte
}

// NewIPHasher draws a fresh key.
func NewIPHasher() IPHasher {
	var h IPHasher
	rand.Read(h.key[:]) //nolint:errcheck // documented never to fail; it panics instead
	return h
}

// Hash labels a client bucket. Sixteen hex characters: enough that two active
// clients colliding is not worth reasoning about, short enough to read in a log
// line.
func (h IPHasher) Hash(bucket netip.Prefix) string {
	mac := hmac.New(sha256.New, h.key[:])
	_, _ = mac.Write([]byte(bucket.String()))
	return hex.EncodeToString(mac.Sum(nil)[:8])
}
