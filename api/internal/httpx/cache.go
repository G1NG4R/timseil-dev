package httpx

import (
	"strconv"
	"strings"
)

// The four cache directives the contract declares, one constant per
// components/headers entry, named after the entry.
//
// They live here rather than in each handler package because the generated
// response objects take the header as a value: every endpoint has to state its
// own directive, and by the third package that was three copies of two strings
// with nothing holding them together. ADR 0009 puts these values in the contract
// precisely so that a handler cannot invent one — three restatements of them is
// the same drift one level down.
//
// One source, and it is checked: TestCacheDirectivesMatchTheContract reads
// components/headers/<Name>/schema/const out of the served document and holds
// each constant against it. A directive that changes in the contract fails there
// instead of in a reader's cache.
//
// Not generated, deliberately. oapi-codegen emits no constant for a header
// `const`, and a generator written for four strings would be more machinery than
// the thing it replaces.
const (
	// CacheControlShort — /api/health. Sixty seconds: the deploy gate polls it
	// and a stale answer there is a rollback decision made on old news.
	CacheControlShort = "public, s-maxage=60, stale-while-revalidate=600"

	// CacheControlMedium — /api/systems, /api/systems/{slug}, /api/training and
	// the three badges. These change when a measurement lands or a system moves
	// state, not on every deploy.
	CacheControlMedium = "public, s-maxage=300, stale-while-revalidate=1800"

	// CacheControlHour — /api/contributions and the three documentation routes.
	// GitHub's calendar is fetched hourly (C5), and the rendered contract
	// changes only with a release.
	CacheControlHour = "public, s-maxage=3600, stale-while-revalidate=7200"

	// CacheControlNone — /api/contact. An accepted submission is not a
	// representation anybody may keep.
	CacheControlNone = "no-store"
)

// SharedMaxAge reads the s-maxage out of one of the directives above.
//
// It exists for the badges and nothing else. A Shields.io payload carries its
// own cacheSeconds next to the Cache-Control header, and writing 300 in both
// places would be two statements of one fact — the kind that agree on the day
// they are written and not afterwards. Here the number is read from the string
// that is actually sent.
//
// A directive without an s-maxage (CacheControlNone) has no shared lifetime, so
// the second return is false and the caller has to say what it means. It is not
// zero: zero seconds is a real instruction to a cache, and "do not store" is a
// different one.
func SharedMaxAge(directive string) (int, bool) {
	const key = "s-maxage="

	for _, part := range strings.Split(directive, ",") {
		part = strings.TrimSpace(part)
		if !strings.HasPrefix(part, key) {
			continue
		}
		n, err := strconv.Atoi(strings.TrimPrefix(part, key))
		if err != nil || n < 0 {
			return 0, false
		}
		return n, true
	}
	return 0, false
}
