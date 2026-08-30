// The package three gates read from, and until #144 the one with no test file.
//
// /api/health publishes what Read() returns as `version` and `sha`,
// tools/verify-deploy.sh reads the sha back to confirm that what was merged is
// what runs, and `make check-deployed` compares it against main. A wrong answer
// here does not fail loudly — it makes a deploy gate agree with the wrong build.
//
// The good case is one line. What the rest of this file is for is the other
// half of the definition of done: every path where an input is missing,
// truncated, or lying about the tree it came from.
package buildinfo

import (
	"runtime/debug"
	"testing"
)

// withSettings is a stand-in for the binary's own build settings.
func withSettings(kv ...string) func() (*debug.BuildInfo, bool) {
	settings := make([]debug.BuildSetting, 0, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		settings = append(settings, debug.BuildSetting{Key: kv[i], Value: kv[i+1]})
	}
	return func() (*debug.BuildInfo, bool) {
		return &debug.BuildInfo{Settings: settings}, true
	}
}

// noBuildInfo is a binary that cannot answer — what debug.ReadBuildInfo returns
// for a program not built by the go command.
func noBuildInfo() (*debug.BuildInfo, bool) { return nil, false }

// The full sha the linker would see. Truncation is the interesting half, so the
// fixture has to be longer than shaLength rather than exactly it.
const fullSHA = "a41f9c2d8e3b5170fa9c26d4e8b13f7a5c092461"

func TestResolve(t *testing.T) {
	cases := []struct {
		name        string
		version     string
		sha         string
		buildInfo   func() (*debug.BuildInfo, bool)
		wantVersion string
		wantSHA     string
	}{
		{
			name:      "the linker spoke, and nothing else is consulted",
			version:   "1.4.0",
			sha:       "a41f9c2",
			buildInfo: withSettings("vcs.revision", "0000000deadbeef", "vcs.modified", "true"),
			// The production image has no .git, so the linker is the only source
			// there. If the build settings could override it, a stray vcs setting
			// in a base image would rename the release.
			wantVersion: "1.4.0", wantSHA: "a41f9c2",
		},
		{
			name:      "a local build takes the revision from the binary",
			buildInfo: withSettings("vcs.revision", fullSHA, "vcs.modified", "false"),
			// Seven characters, matching the contract's example and the image tag.
			wantVersion: "dev", wantSHA: "a41f9c2",
		},
		{
			name:        "a dirty tree says so, after the truncation and not before",
			buildInfo:   withSettings("vcs.revision", fullSHA, "vcs.modified", "true"),
			wantVersion: "dev", wantSHA: "a41f9c2-dirty",
			// The order matters and is easy to get wrong the other way round:
			// truncating "a41f9c2d…-dirty" to seven characters would produce
			// "a41f9c2" and silently drop the warning the suffix exists to carry.
		},
		{
			name:        "a version without a sha still falls back for the sha alone",
			version:     "1.4.0",
			buildInfo:   noBuildInfo,
			wantVersion: "1.4.0", wantSHA: unknownSHA,
		},
		{
			name:        "a sha without a version fills in the version alone",
			sha:         "a41f9c2",
			buildInfo:   withSettings("vcs.revision", fullSHA),
			wantVersion: unknownVersion, wantSHA: "a41f9c2",
		},

		// ---------------------------------------------------- the broken cases

		{
			name:        "nothing anywhere is dev and unknown, never empty",
			buildInfo:   noBuildInfo,
			wantVersion: unknownVersion, wantSHA: unknownSHA,
		},
		{
			name:        "build settings that carry no revision",
			buildInfo:   withSettings("GOARCH", "amd64", "vcs.modified", "true"),
			wantVersion: unknownVersion, wantSHA: unknownSHA,
			// vcs.modified without vcs.revision must not produce a bare "-dirty".
		},
		{
			name:        "an empty settings list",
			buildInfo:   withSettings(),
			wantVersion: unknownVersion, wantSHA: unknownSHA,
		},
		{
			name:        "an empty revision value is not a revision",
			buildInfo:   withSettings("vcs.revision", ""),
			wantVersion: unknownVersion, wantSHA: unknownSHA,
		},
		{
			name: "build info that reports ok with a nil pointer",
			buildInfo: func() (*debug.BuildInfo, bool) {
				return nil, true
			},
			wantVersion: unknownVersion, wantSHA: unknownSHA,
			// Not a shape the runtime produces today. It is here because the
			// alternative to the nil guard is a panic in the one package whose
			// job is to answer a health endpoint.
		},
		{
			name:        "a revision shorter than the cut is used whole, not padded",
			buildInfo:   withSettings("vcs.revision", "a41"),
			wantVersion: unknownVersion, wantSHA: "a41",
		},
		{
			name:        "a revision of exactly the cut keeps every character",
			buildInfo:   withSettings("vcs.revision", "a41f9c2"),
			wantVersion: unknownVersion, wantSHA: "a41f9c2",
			// The boundary, from the side where an off-by-one would take a
			// character off a sha that was already the right length.
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := resolve(c.version, c.sha, c.buildInfo)

			if got.Version != c.wantVersion {
				t.Errorf("Version is %q, want %q", got.Version, c.wantVersion)
			}
			if got.SHA != c.wantSHA {
				t.Errorf("SHA is %q, want %q", got.SHA, c.wantSHA)
			}
		})
	}
}

// The property every caller leans on and none of them checks: neither field is
// ever empty. /api/health publishes both, and the contract has no room for a
// blank — "dev" and "unknown" are the answer for "nobody said", and an empty
// string would render as a version that exists and is called nothing.
func TestNeitherFieldIsEverEmpty(t *testing.T) {
	for _, c := range []struct {
		name      string
		buildInfo func() (*debug.BuildInfo, bool)
	}{
		{"no build info", noBuildInfo},
		{"no settings", withSettings()},
		{"no revision", withSettings("GOARCH", "amd64")},
		{"an empty revision", withSettings("vcs.revision", "")},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := resolve("", "", c.buildInfo)

			if got.Version == "" || got.SHA == "" {
				t.Errorf("resolve returned %+v — /api/health would publish a blank", got)
			}
		})
	}
}

// Read() is the real thing, computed once from this test binary's own build
// settings. It cannot assert a value — the sha depends on the tree it runs in —
// so it asserts the contract every caller relies on and the once-ness that is
// the reason sync.OnceValue is there.
func TestReadAnswersTheSameThingEveryTime(t *testing.T) {
	first := Read()

	if first.Version == "" || first.SHA == "" {
		t.Fatalf("Read returned %+v, and both fields reach /api/health", first)
	}
	if second := Read(); second != first {
		t.Errorf("Read returned %+v and then %+v — the identity of a binary "+
			"cannot change while it runs", first, second)
	}
}
