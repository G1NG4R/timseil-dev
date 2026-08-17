// Package middleware holds the chain every request passes through:
// request id, structured log, panic recovery, timeout, CORS and rate limit.
//
// The order is fixed and each piece says why it sits where it does. What they
// share is the request id: it is set first so that everything after it — a log
// line, a panic, a 429 — can be tied back to one request in two services.
package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// forwardedFor is the only forwarded header this service reads.
//
// X-Real-IP is deliberately ignored: it carries a single address with no chain,
// so there is no way to tell which hop wrote it and therefore no way to
// validate it. A header that cannot be validated is a header that can be
// forged, and one that looks authoritative is worse than none.
const forwardedFor = "X-Forwarded-For"

// ClientIP resolves which address a request should be attributed to.
//
// Behind a reverse proxy every request arrives from the proxy, so attributing
// by peer address would put the whole world in one bucket. Believing
// X-Forwarded-For unconditionally is the opposite mistake: then every client
// picks its own identity, and the rate limiter becomes decorative.
type ClientIP struct {
	trusted []netip.Prefix
}

// NewClientIP takes the networks whose forwarded headers may be believed. An
// empty list means none, which is the default: whether a proxy stands in front
// of this process is a fact about the deployment, not about the program.
func NewClientIP(trusted []netip.Prefix) ClientIP {
	return ClientIP{trusted: trusted}
}

// PeerIsTrusted reports whether the TCP peer sits in one of the trusted
// networks. The peer address comes from the connection and cannot be forged,
// which is what makes every decision below it safe.
func (c ClientIP) PeerIsTrusted(r *http.Request) bool {
	peer, err := peerAddr(r)
	if err != nil {
		return false
	}
	return c.isTrusted(peer)
}

// Resolve returns the address to attribute the request to.
//
// The second return value is false in exactly one situation: the request came
// through a trusted proxy that sent no usable X-Forwarded-For. That is a
// misconfiguration, and it matters enough to be reported rather than guessed
// at — attributing those requests to the proxy would collapse every visitor
// into a single client.
func (c ClientIP) Resolve(r *http.Request) (netip.Addr, bool) {
	peer, err := peerAddr(r)
	if err != nil {
		return netip.Addr{}, false
	}

	// Not behind a trusted proxy: the peer is the client, and the forwarded
	// header is whatever the client felt like sending. Ignore it entirely.
	if !c.isTrusted(peer) {
		return peer, true
	}

	// Behind a trusted proxy: walk the chain from the right. Each proxy appends
	// the address it saw, so the rightmost entry was written by the hop closest
	// to us. Skipping the entries that are themselves trusted lands on the
	// first address a trusted hop actually observed — and therefore the first
	// one an attacker could not have prepended.
	//
	// Taking the leftmost entry is the usual version of this code and the usual
	// hole: anyone can send `X-Forwarded-For: 1.2.3.4` and get a fresh bucket
	// for every request.
	chain := r.Header.Values(forwardedFor)
	for i := len(chain) - 1; i >= 0; i-- {
		parts := strings.Split(chain[i], ",")
		for j := len(parts) - 1; j >= 0; j-- {
			addr, err := parseAddr(strings.TrimSpace(parts[j]))
			if err != nil {
				continue
			}
			if !c.isTrusted(addr) {
				return addr, true
			}
		}
	}

	return peer, false
}

// Bucket is the unit a rate limit counts against.
//
// A single IPv6 address means nothing: the smallest allocation a residential
// customer gets is a /64, so counting per address would hand one client
// eighteen quintillion free buckets. IPv4 is counted per address.
func (c ClientIP) Bucket(addr netip.Addr) netip.Prefix {
	if addr.Is4() || addr.Is4In6() {
		return netip.PrefixFrom(addr.Unmap(), 32)
	}
	return netip.PrefixFrom(addr, 64).Masked()
}

func (c ClientIP) isTrusted(addr netip.Addr) bool {
	addr = addr.Unmap()
	for _, prefix := range c.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

func peerAddr(r *http.Request) (netip.Addr, error) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// httptest and unix sockets hand over an address without a port.
		host = r.RemoteAddr
	}
	return parseAddr(host)
}

// parseAddr drops the zone, which is meaningless once an address has left the
// machine that wrote it and would otherwise split one client into two buckets.
func parseAddr(s string) (netip.Addr, error) {
	addr, err := netip.ParseAddr(s)
	if err != nil {
		return netip.Addr{}, err
	}
	return addr.Unmap().WithZone(""), nil
}
