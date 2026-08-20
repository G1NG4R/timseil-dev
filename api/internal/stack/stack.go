// Package stack reads the curated manifest at stack.yaml and resolves every
// entry's version out of the file it points at — web/package.json, api/go.mod,
// compose.dev.yaml, .nvmrc.
//
// The point is not to have a manifest. The point is that a version can only
// enter the site by being read from the thing that actually declares it. Bump
// next in package.json and the stack line on the page moves with it; type a
// version into stack.yaml by hand and make check-stack refuses.
//
// Resolution happens at `make gen` time, not at run time: in D2 the seed runs
// from an image that contains neither stack.yaml nor go.mod nor package.json.
// ADR 0012 carries that decision.
package stack

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// FileName is the manifest's name at the repository root.
const FileName = "stack.yaml"

// Entry is one curated line. Either From is set and the version is read from
// that file, or nothing is set and the entry is a bare name.
type Entry struct {
	Name string `yaml:"name"`
	From string `yaml:"from"`
	Key  string `yaml:"key"`

	// Version exists so that a literal version in stack.yaml produces a named
	// error instead of being ignored. It is never allowed to be set. Without
	// the field, KnownFields would reject it with a parser message that does
	// not explain why the rule exists.
	Version string `yaml:"version"`
}

// Manifest is stack.yaml as written.
type Manifest struct {
	Systems map[string][]Entry `yaml:"systems"`
}

// Resolved is one entry with its version looked up. Version is empty for a
// bare entry, and that is a valid result, not a failure — Err is what a failure
// looks like. Both are carried per entry so that one run can print the whole
// table instead of sending you back for the next broken line.
type Resolved struct {
	System  string
	Name    string
	Version string
	From    string
	Key     string
	Err     error
}

// Display is what lands in systems.stack and on the page: "Next.js 16.3", or
// just "Python" when the entry carries no source.
func (r Resolved) Display() string {
	if r.Version == "" {
		return r.Name
	}
	return r.Name + " " + r.Version
}

// Origin describes where the version came from, for the check-stack table.
func (r Resolved) Origin() string {
	if r.From == "" {
		return "no source in this repo"
	}
	if r.Key == "" {
		return r.From
	}
	return fmt.Sprintf("%s (%s)", r.From, r.Key)
}

// Bundle is the generated artefact: the resolved display strings per system,
// ready for systems.stack. api/internal/seed embeds it.
type Bundle struct {
	Comment string              `json:"comment"`
	Source  string              `json:"source"`
	Systems map[string][]string `json:"systems"`
}

const bundleComment = "Generated from stack.yaml by api/cmd/genstack — do not edit by hand."

// Parse decodes the manifest strictly: an unknown key is an error, because a
// typo in `form:` instead of `from:` would otherwise resolve to a bare name and
// silently drop a version from the page.
func Parse(data []byte) (*Manifest, error) {
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)

	var m Manifest
	if err := dec.Decode(&m); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", FileName, err)
	}
	if len(m.Systems) == 0 {
		return nil, fmt.Errorf("%s has no systems", FileName)
	}
	for system, entries := range m.Systems {
		if len(entries) == 0 {
			return nil, fmt.Errorf("system %q has no entries", system)
		}
		for i, e := range entries {
			if err := e.validate(system, i); err != nil {
				return nil, err
			}
		}
	}
	return &m, nil
}

// Load reads root/stack.yaml.
//
// G304 flags the constructed path. It is a build-time tool reading a fixed
// file name under a root the operator typed on the command line; there is no
// request, no user and no untrusted input anywhere in this program.
func Load(root string) (*Manifest, error) {
	data, err := os.ReadFile(filepath.Join(root, FileName)) //nolint:gosec // G304: build-time tool, see above
	if err != nil {
		return nil, err
	}
	return Parse(data)
}

func (e Entry) validate(system string, i int) error {
	where := fmt.Sprintf("%s entry %d", system, i+1)

	if strings.TrimSpace(e.Name) == "" {
		return fmt.Errorf("%s has no name", where)
	}
	where = fmt.Sprintf("%s entry %q", system, e.Name)

	if e.Version != "" {
		return fmt.Errorf(
			"%s declares version %q — stack.yaml carries names, never versions; "+
				"point it at the file that declares the version with from/key, or drop the version entirely",
			where, e.Version)
	}
	if e.From == "" && e.Key != "" {
		return fmt.Errorf("%s has key %q without from", where, e.Key)
	}
	return nil
}

// Resolve looks every entry up against the tree at root. Systems come back in
// sorted order so the generated bundle is stable; entries keep the order they
// have in stack.yaml, because that is the order they render in.
func (m *Manifest) Resolve(root string) ([]Resolved, error) {
	systems := make([]string, 0, len(m.Systems))
	for system := range m.Systems {
		systems = append(systems, system)
	}
	sort.Strings(systems)

	var (
		out  []Resolved
		errs []error
	)
	for _, system := range systems {
		for _, e := range m.Systems[system] {
			r := Resolved{System: system, Name: e.Name, From: e.From, Key: e.Key}
			if e.From != "" {
				version, err := readVersion(root, e)
				if err != nil {
					r.Err = err
					errs = append(errs, fmt.Errorf("%s %q: %w", system, e.Name, err))
				}
				r.Version = version
			}
			out = append(out, r)
		}
	}
	return out, errors.Join(errs...)
}

// Bundle resolves and folds the result into the generated artefact.
func (m *Manifest) Bundle(root string) (*Bundle, error) {
	resolved, err := m.Resolve(root)
	if err != nil {
		return nil, err
	}
	b := &Bundle{
		Comment: bundleComment,
		Source:  FileName,
		Systems: make(map[string][]string, len(m.Systems)),
	}
	for _, r := range resolved {
		b.Systems[r.System] = append(b.Systems[r.System], r.Display())
	}
	return b, nil
}

// ---------------------------------------------------------------- sources

// readVersion dispatches on the file's name rather than on a declared type.
// Four kinds cover every entry the manifest has; a fifth arrives with a real
// entry that needs it, not before.
func readVersion(root string, e Entry) (string, error) {
	// G304: e.From comes from stack.yaml, a file in this repository that a
	// reviewer read before it was committed. Same argument as Load above.
	path := filepath.Join(root, e.From)
	data, err := os.ReadFile(path) //nolint:gosec // G304: build-time tool, see above
	if err != nil {
		return "", fmt.Errorf("reading %s: %w", e.From, err)
	}

	base := filepath.Base(e.From)
	switch {
	case base == ".nvmrc":
		return normalize(string(data))

	case base == "go.mod":
		return fromGoMod(data, e)

	case strings.HasSuffix(base, ".json"):
		return fromJSON(data, e)

	case strings.HasSuffix(base, ".yaml"), strings.HasSuffix(base, ".yml"):
		return fromCompose(data, e)

	default:
		return "", fmt.Errorf("unsupported source %s — known kinds are .nvmrc, go.mod, *.json, *.yaml", e.From)
	}
}

// fromGoMod handles both the `go` directive and a module path. It parses by
// hand because the alternative is promoting golang.org/x/mod from indirect to
// direct, and a dependency needs asking about; this is nine lines.
func fromGoMod(data []byte, e Entry) (string, error) {
	if e.Key == "" {
		return "", errors.New("go.mod needs a key: either `go` or a module path")
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if i := strings.Index(line, "//"); i >= 0 {
			line = strings.TrimSpace(line[:i]) // drops the `// indirect` marker
		}
		fields := strings.Fields(line)
		// `require github.com/x v1.2.3` and `github.com/x v1.2.3` both end with
		// the pair we want, so match on the last two fields.
		if len(fields) < 2 {
			continue
		}
		if fields[len(fields)-2] == e.Key {
			return normalize(fields[len(fields)-1])
		}
	}
	return "", fmt.Errorf("no %q in %s", e.Key, e.From)
}

func fromJSON(data []byte, e Entry) (string, error) {
	if e.Key == "" {
		return "", fmt.Errorf("%s needs a key, e.g. dependencies.next", e.From)
	}
	var doc any
	if err := json.Unmarshal(data, &doc); err != nil {
		return "", fmt.Errorf("parsing %s: %w", e.From, err)
	}
	raw, err := walk(doc, e.Key, e.From)
	if err != nil {
		return "", err
	}
	return normalize(raw)
}

// fromCompose reads a dotted path and, when the value is an image reference,
// takes its tag. `postgres:18.6-alpine` is the version the site claims.
func fromCompose(data []byte, e Entry) (string, error) {
	if e.Key == "" {
		return "", fmt.Errorf("%s needs a key, e.g. services.db.image", e.From)
	}
	var doc any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return "", fmt.Errorf("parsing %s: %w", e.From, err)
	}
	raw, err := walk(doc, e.Key, e.From)
	if err != nil {
		return "", err
	}
	if strings.HasSuffix(e.Key, ".image") {
		raw, err = imageTag(raw, e.From)
		if err != nil {
			return "", err
		}
	}
	return normalize(raw)
}

// imageTag pulls the tag out of an image reference, and it exists because the
// obvious version of it — everything after the last colon — reads the wrong
// half of two forms this repository writes.
//
// `postgres:18.6-alpine@sha256:…` is the one that cost something. ADR 0027 left
// the db image on a bare tag for exactly this reason: the last colon is the one
// inside the digest, so the page showed a `sha256:…` where a version belongs,
// and db stayed the only unpinned image in the system. The digest is cut off
// first, so `name:tag@digest` and `name:tag` answer the same thing.
//
// `registry:5000/postgres` is the other: a registry port is a colon that is not
// a tag separator. A tag can only follow the last slash, so a colon before it is
// not one — and an image with no tag at all is still refused, because a digest
// alone is not a version anybody can read.
func imageTag(ref, file string) (string, error) {
	if at := strings.Index(ref, "@"); at >= 0 {
		ref = ref[:at]
	}
	colon := strings.LastIndex(ref, ":")
	if colon < 0 || colon < strings.LastIndex(ref, "/") {
		return "", fmt.Errorf("%s: image %q has no tag — pin it", file, ref)
	}
	return ref[colon+1:], nil
}

// walk follows a dotted path through decoded JSON or YAML. yaml.v3 gives
// map[string]any for string-keyed mappings, so one walker serves both.
func walk(doc any, key, file string) (string, error) {
	node := doc
	for _, part := range strings.Split(key, ".") {
		m, ok := node.(map[string]any)
		if !ok {
			return "", fmt.Errorf("%s: %q is not a path into this file", file, key)
		}
		node, ok = m[part]
		if !ok {
			return "", fmt.Errorf("%s: no key %q", file, key)
		}
	}
	s, ok := node.(string)
	if !ok {
		return "", fmt.Errorf("%s: %q is not a string", file, key)
	}
	return s, nil
}

// ------------------------------------------------------------- normalize

// version matches the leading major[.minor] of whatever the source declares.
var version = regexp.MustCompile(`^([0-9]+)(\.[0-9]+)?`)

// normalize turns what a manifest declares into what a page shows. Two
// components at most, and uniformly so: the contract's own examples are
// "Next.js 16.3", "Go 1.26", "PostgreSQL 18.6". A patch level on a portfolio
// page is noise that also guarantees the page is stale by Tuesday.
//
// `24` stays `24` — .nvmrc pins a major and pretending otherwise would invent
// a digit, which is the one thing this repo does not do.
func normalize(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	s = strings.TrimLeft(s, "^~=<> v\t")

	m := version.FindString(s)
	if m == "" {
		return "", fmt.Errorf("no version in %q — a range like \"latest\" or \"*\" cannot be shown as a number", strings.TrimSpace(raw))
	}
	return m, nil
}
