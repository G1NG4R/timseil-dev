package middleware

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

// dockerNet is what compose.dev.yaml puts in TRUSTED_PROXY_CIDRS.
func dockerNet(t *testing.T) ClientIP {
	t.Helper()
	var prefixes []netip.Prefix
	for _, cidr := range []string{"172.16.0.0/12", "10.0.0.0/8", "127.0.0.1/32", "::1/128"} {
		p, err := netip.ParsePrefix(cidr)
		if err != nil {
			t.Fatalf("parsing %s: %v", cidr, err)
		}
		prefixes = append(prefixes, p.Masked())
	}
	return NewClientIP(prefixes)
}

func from(peer string, forwarded ...string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/systems", nil)
	r.RemoteAddr = peer
	for _, v := range forwarded {
		r.Header.Add(forwardedFor, v)
	}
	return r
}

// The hole this whole type exists to close. Anyone can put anything in
// X-Forwarded-For; if the peer is not a proxy we trust, the header is a
// stranger's opinion and the peer is the fact.
func TestASpoofedHeaderFromAnUntrustedPeerIsIgnored(t *testing.T) {
	c := dockerNet(t)

	addr, ok := c.Resolve(from("203.0.113.7:44321", "1.2.3.4"))
	if !ok {
		t.Fatal("Resolve reported no usable address for a direct connection")
	}
	if addr.String() != "203.0.113.7" {
		t.Errorf("addr = %s, want the peer 203.0.113.7 — the forged header won", addr)
	}
}

// Behind a trusted proxy the chain is read from the right, because each hop
// appends what it saw. The leftmost entry is the one the client wrote itself.
func TestTheChainIsReadFromTheRight(t *testing.T) {
	c := dockerNet(t)

	// A client claiming to be 1.2.3.4, seen by Traefik as 198.51.100.9.
	addr, ok := c.Resolve(from("172.18.0.5:52000", "1.2.3.4, 198.51.100.9"))
	if !ok {
		t.Fatal("Resolve reported no usable address")
	}
	if addr.String() != "198.51.100.9" {
		t.Errorf("addr = %s, want 198.51.100.9 — the client's own claim was believed", addr)
	}
}

// Entries written by hops we trust are skipped, so a second internal proxy does
// not become the client.
func TestTrustedHopsInTheChainAreSkipped(t *testing.T) {
	c := dockerNet(t)

	addr, ok := c.Resolve(from("172.18.0.5:52000", "198.51.100.9, 10.1.2.3, 172.18.0.9"))
	if !ok {
		t.Fatal("Resolve reported no usable address")
	}
	if addr.String() != "198.51.100.9" {
		t.Errorf("addr = %s, want 198.51.100.9", addr)
	}
}

func TestTheChainMayArriveAsSeveralHeaders(t *testing.T) {
	c := dockerNet(t)

	addr, ok := c.Resolve(from("172.18.0.5:52000", "1.2.3.4", "198.51.100.9"))
	if !ok {
		t.Fatal("Resolve reported no usable address")
	}
	if addr.String() != "198.51.100.9" {
		t.Errorf("addr = %s, want 198.51.100.9", addr)
	}
}

// The operational failure worth reporting: a proxy in front of us that forwards
// nothing. Attributing those requests to the proxy would collapse every visitor
// into one client, so the caller has to be told rather than handed a guess.
func TestATrustedProxyWithoutTheHeaderIsReported(t *testing.T) {
	c := dockerNet(t)

	if _, ok := c.Resolve(from("172.18.0.5:52000")); ok {
		t.Error("Resolve claimed a usable address where every visitor would share one bucket")
	}
}

func TestGarbageInTheChainIsSkipped(t *testing.T) {
	c := dockerNet(t)

	addr, ok := c.Resolve(from("172.18.0.5:52000", "198.51.100.9, not-an-address"))
	if !ok {
		t.Fatal("Resolve gave up on a chain with one bad entry")
	}
	if addr.String() != "198.51.100.9" {
		t.Errorf("addr = %s, want 198.51.100.9", addr)
	}
}

// A residential IPv6 customer gets a /64 at the smallest. Counting per address
// would hand one client more buckets than there are seconds in the universe.
func TestIPv6IsCountedPerSixtyFour(t *testing.T) {
	c := dockerNet(t)

	first := netip.MustParseAddr("2001:db8:1234:5678::1")
	second := netip.MustParseAddr("2001:db8:1234:5678:ffff:ffff:ffff:ffff")
	other := netip.MustParseAddr("2001:db8:1234:9999::1")

	if c.Bucket(first) != c.Bucket(second) {
		t.Errorf("two addresses in one /64 landed in different buckets: %s vs %s",
			c.Bucket(first), c.Bucket(second))
	}
	if c.Bucket(first) == c.Bucket(other) {
		t.Error("two different /64s share a bucket")
	}
}

func TestIPv4IsCountedPerAddress(t *testing.T) {
	c := dockerNet(t)

	a := netip.MustParseAddr("198.51.100.9")
	b := netip.MustParseAddr("198.51.100.10")
	if c.Bucket(a) == c.Bucket(b) {
		t.Error("two different IPv4 addresses share a bucket")
	}
	if got := c.Bucket(a).String(); got != "198.51.100.9/32" {
		t.Errorf("bucket = %s, want a /32", got)
	}
}

// Trusting nobody is the default, and it has to actually mean nobody.
func TestAnEmptyTrustListBelievesNoHeader(t *testing.T) {
	c := NewClientIP(nil)

	addr, ok := c.Resolve(from("172.18.0.5:52000", "1.2.3.4"))
	if !ok {
		t.Fatal("Resolve reported no usable address")
	}
	if addr.String() != "172.18.0.5" {
		t.Errorf("addr = %s, want the peer — no proxy is trusted", addr)
	}
}
