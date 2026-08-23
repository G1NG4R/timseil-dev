package middleware

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// idleTTL is how long a bucket outlives its last request.
//
// Ten minutes is not a tuning choice. The privacy page says the rate-limit
// address is kept for ten minutes, in memory, as a hash — L7 automates that
// promise, and this is the line where the code keeps it rather than the text
// claiming it.
const idleTTL = 10 * time.Minute

// sweepEvery is how often the janitor runs. Frequent enough that the map
// tracks reality, rare enough to be free.
const sweepEvery = time.Minute

// misconfigWarnEvery bounds the "no forwarded header" warning. It fires on
// every request when it fires at all, and a log line per request is how an
// operational problem becomes an outage of its own.
const misconfigWarnEvery = time.Minute

// RateLimiter is a token bucket per client, held in memory.
//
// No Redis and no golang.org/x/time/rate. The build plan puts a shared limiter
// behind Redis in P3, after launch; until then one process holds the state, and
// what this needs beyond a bucket is eviction — which x/time/rate does not do,
// so the dependency would buy the easy half and leave the half that matters.
//
// Two of these exist. The broad one wraps every /api/ path at 120 a minute; the
// strict one wraps POST /api/contact alone at three per ten minutes, which is a
// rate no whole number of tokens per minute can express. That is why the refill
// is a float and why NewRateLimiterPer takes a window.
type RateLimiter struct {
	// refillPerSecond rather than a per-minute count: three per ten minutes is
	// 0.005 a second, and an int would round it to nothing or to six an hour.
	refillPerSecond float64

	burst float64

	client ClientIP
	hasher IPHasher
	log    *slog.Logger

	// now is injected so the tests can move time instead of sleeping through
	// it. A limiter tested with real sleeps is a limiter tested once.
	now func() time.Time

	mu      sync.Mutex
	buckets map[string]*bucket

	lastWarn time.Time

	stop chan struct{}
	done chan struct{}
}

type bucket struct {
	tokens float64
	seen   time.Time
}

// NewRateLimiter starts the janitor. Call Stop when the server has drained.
func NewRateLimiter(perMinute, burst int, client ClientIP, hasher IPHasher, log *slog.Logger) *RateLimiter {
	return NewRateLimiterPer(perMinute, time.Minute, burst, client, hasher, log)
}

// NewRateLimiterPer is the same limiter with the window spelled out: n requests
// per window, with burst tokens to spend at once.
//
// It exists for the contact form's three per ten minutes. Expressed as a
// per-minute integer that rate is 0, which would refuse everybody forever — a
// rounding error that turns the only conversion point on the site off.
func NewRateLimiterPer(n int, window time.Duration, burst int,
	client ClientIP, hasher IPHasher, log *slog.Logger,
) *RateLimiter {
	rl := &RateLimiter{
		refillPerSecond: float64(n) / window.Seconds(),
		burst:           float64(burst),
		client:          client,
		hasher:          hasher,
		log:             log,
		now:             time.Now,
		buckets:         make(map[string]*bucket),
		stop:            make(chan struct{}),
		done:            make(chan struct{}),
	}

	go rl.sweep()
	return rl
}

// Stop ends the janitor. Idempotent, because the shutdown path should not have
// to reason about whether it has already run.
func (rl *RateLimiter) Stop() {
	select {
	case <-rl.stop:
		return
	default:
	}
	close(rl.stop)
	<-rl.done
}

func (rl *RateLimiter) sweep() {
	defer close(rl.done)

	ticker := time.NewTicker(sweepEvery)
	defer ticker.Stop()

	for {
		select {
		case <-rl.stop:
			return
		case <-ticker.C:
			rl.evict(rl.now())
		}
	}
}

func (rl *RateLimiter) evict(now time.Time) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	for key, b := range rl.buckets {
		if now.Sub(b.seen) > idleTTL {
			delete(rl.buckets, key)
		}
	}
}

// Middleware applies the limit to /api/* and to nothing else.
//
// /healthz and /readyz stay out: the container's own healthcheck knocks every
// few seconds, and a liveness probe that runs out of tokens is a deploy that
// fails for no reason.
func (rl *RateLimiter) Middleware() Func {
	return func(next http.Handler) http.Handler {
		gated := rl.Gate(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isAPI(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			gated.ServeHTTP(w, r)
		})
	}
}

// Gate applies the limit to whatever it wraps and makes no decision about which
// paths that is.
//
// Middleware sits in the chain and has to choose; this one is wrapped around a
// single route at its mux.Handle line, which is how POST /api/contact gets a
// second, stricter limiter without the chain growing a path test for it. The
// route is the statement of scope, so there is nowhere for the scope and the
// mounting to disagree.
func (rl *RateLimiter) Gate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		{
			addr, ok := rl.client.Resolve(r)
			if !ok {
				// A trusted proxy that sent no usable X-Forwarded-For. Every
				// request would otherwise be attributed to the proxy, one
				// bucket for the whole internet, and the site would look down
				// after the first hundred visitors in a minute.
				//
				// So it fails open, loudly. A rate limit is a courtesy control,
				// Traefik has its own in L5, and taking the site down to
				// protect it is not protection.
				rl.warnMisconfigured(r)
				next.ServeHTTP(w, r)
				return
			}

			allowed, retryAfter := rl.take(rl.hasher.Hash(rl.client.Bucket(addr)))
			if !allowed {
				rl.log.WarnContext(r.Context(), "rate limit exceeded",
					"path", r.URL.Path,
					"retry_after", retryAfter.String(),
				)
				httpx.WriteRateLimitProblem(w, r, retryAfter)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// take spends a token and reports how long to wait when there is none.
//
// The bucket refills lazily, on access, rather than from a ticker per key: a
// goroutine per client is how a rate limiter becomes the thing that needs rate
// limiting.
func (rl *RateLimiter) take(key string) (allowed bool, retryAfter time.Duration) {
	now := rl.now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		b = &bucket{tokens: rl.burst, seen: now}
		rl.buckets[key] = b
	} else {
		elapsed := now.Sub(b.seen).Seconds()
		if elapsed > 0 {
			b.tokens = min(rl.burst, b.tokens+elapsed*rl.refillPerSecond)
		}
		b.seen = now
	}

	if b.tokens < 1 {
		missing := 1 - b.tokens
		return false, time.Duration(missing / rl.refillPerSecond * float64(time.Second))
	}

	b.tokens--
	return true, 0
}

func (rl *RateLimiter) warnMisconfigured(r *http.Request) {
	now := rl.now()

	rl.mu.Lock()
	quiet := now.Sub(rl.lastWarn) < misconfigWarnEvery
	if !quiet {
		rl.lastWarn = now
	}
	rl.mu.Unlock()

	if quiet {
		return
	}
	// The peer is labelled, not named. This is the one line in the service that
	// used to print an address in the clear, and "it is only the proxy" is not
	// an exception the operations sheet makes — it says no IP, and a log line
	// cannot know whose address it is holding.
	//
	// The same hash the access line uses for `client`, so the two are the same
	// value for the same machine and a misconfiguration is still recognisable
	// across lines. Whoever needs the real address reads TRUSTED_PROXY_CIDRS.
	peer := "unknown"
	if addr, err := peerAddr(r); err == nil {
		peer = rl.hasher.Hash(rl.client.Bucket(addr))
	}

	rl.log.WarnContext(r.Context(),
		"a trusted proxy sent no usable X-Forwarded-For — "+
			"requests are not being rate limited, because attributing them all to the "+
			"proxy would put every visitor in one bucket",
		"peer", peer,
		"path", r.URL.Path,
	)
}
