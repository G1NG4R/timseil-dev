// Package buildinfo answers "which build is this" without anybody having to
// type an answer.
//
// The contract requires a version and a commit on /api/health, the deploy gate
// reads the commit back to confirm that what was merged is what runs, and the
// release notes key on the same value. A number written by hand into a
// constant would be wrong on the first release somebody forgot to bump — which
// is the failure this repository spends a whole manifest avoiding elsewhere.
//
// Two sources, in order. Go stamps the VCS revision into the binary when it is
// built from a git working tree, which covers every local build for free. The
// production image has no .git, so D1 sets Version and SHA through -ldflags -X.
// When neither has spoken the answer is "dev" and "unknown" — honest, and
// distinguishable at a glance from a real release.
package buildinfo

import (
	"runtime/debug"
	"sync"
)

// Set by the linker in the production build:
//
//	-ldflags "-X github.com/G1NG4R/timseil-dev/api/internal/buildinfo.version=1.4.0
//	          -X github.com/G1NG4R/timseil-dev/api/internal/buildinfo.sha=a41f9c2"
var (
	version string
	sha     string
)

const (
	unknownVersion = "dev"
	unknownSHA     = "unknown"
)

// shaLength matches the contract's example and what the deploy pipeline tags
// images with. A full forty characters would be correct and unreadable.
const shaLength = 7

type Info struct {
	Version string
	SHA     string
}

var read = sync.OnceValue(func() Info {
	info := Info{Version: version, SHA: sha}

	if info.Version == "" {
		info.Version = unknownVersion
	}
	if info.SHA != "" {
		return info
	}

	// Nothing from the linker: ask the binary about itself.
	info.SHA = unknownSHA
	build, ok := debug.ReadBuildInfo()
	if !ok {
		return info
	}

	var revision, modified string
	for _, setting := range build.Settings {
		switch setting.Key {
		case "vcs.revision":
			revision = setting.Value
		case "vcs.modified":
			modified = setting.Value
		}
	}
	if revision == "" {
		return info
	}

	if len(revision) > shaLength {
		revision = revision[:shaLength]
	}
	// A build from a dirty tree is not the commit it names, and saying so is
	// cheaper than wondering later why the deployed sha does not reproduce.
	if modified == "true" {
		revision += "-dirty"
	}
	info.SHA = revision

	return info
})

// Read returns the identity of this binary. Computed once: it cannot change
// while the process runs, and /api/health is polled often enough that walking
// the build settings per request would be waste with no upside.
func Read() Info { return read() }
