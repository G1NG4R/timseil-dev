package httpx

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

	// CacheControlMedium — /api/systems, /api/systems/{slug}, /api/training.
	// These change when a measurement lands or a system moves state, not on
	// every deploy.
	CacheControlMedium = "public, s-maxage=300, stale-while-revalidate=1800"

	// CacheControlHour — /api/contributions and the three documentation routes.
	// GitHub's calendar is fetched hourly (C5), and the rendered contract
	// changes only with a release.
	CacheControlHour = "public, s-maxage=3600, stale-while-revalidate=7200"

	// CacheControlNone — /api/contact. An accepted submission is not a
	// representation anybody may keep.
	CacheControlNone = "no-store"
)
