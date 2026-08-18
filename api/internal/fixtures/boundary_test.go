package fixtures_test

import (
	"os/exec"
	"strings"
	"testing"
)

// The one rule this package has, and it is checked rather than written down in a
// comment: no command can reach the fixtures.
//
// incident.sql invents probes, an outage and two deploys. That is fine in a test
// database and it is the exact lie the site is built against anywhere else —
// docs/runbooks/migrations.md said so before this package existed: those rows
// "never become a B4 fixture", and by the same argument a B4 fixture never
// becomes a production row.
//
// A comment cannot hold that. `go list -deps` can, and transitively: an import
// three packages deep is caught just as well as a direct one, which is the case a
// hand-written import scan would miss.
//
// It runs untagged, so it is part of `make check` and needs no database.
func TestNoCommandCanReachTheFixtures(t *testing.T) {
	const self = "github.com/G1NG4R/timseil-dev/api/internal/fixtures"

	// From api/internal/fixtures up to the module root, where ./cmd/... resolves.
	cmd := exec.Command("go", "list", "-deps", "./cmd/...")
	cmd.Dir = "../.."

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go list -deps ./cmd/...: %v\n%s", err, out)
	}

	for _, dep := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if strings.TrimSpace(dep) == self {
			t.Fatalf("a command depends on %s — invented operational data must not be "+
				"reachable from any binary that talks to a real database", self)
		}
	}
}

// And the seed is the other half of the same rule: it carries content, no
// measurements, and it is meant to be in a production binary. If this ever fails,
// the two packages have been confused for each other.
//
// The command is ./cmd/api and not ./cmd/seed, because D2 folded the seed and the
// migration into the binary the production image already ships — three separately
// linked Go binaries were 32 MiB against a 20 MiB ceiling (ADR 0027). Which means
// this assertion now carries a second one: the binary that serves the internet is
// the binary that reaches internal/seed, and the test above is what keeps that
// from also making it reach internal/fixtures.
func TestCommandsDoReachTheSeed(t *testing.T) {
	const target = "github.com/G1NG4R/timseil-dev/api/internal/seed"

	cmd := exec.Command("go", "list", "-deps", "./cmd/api")
	cmd.Dir = "../.."

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go list -deps ./cmd/api: %v\n%s", err, out)
	}
	if !strings.Contains(string(out), target) {
		t.Fatalf("cmd/api does not depend on %s — then what is `api seed` seeding?", target)
	}
}
