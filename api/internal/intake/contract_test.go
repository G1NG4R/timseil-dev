package intake

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for the two internal endpoints.
//
// IT READS THE FILE, NOT httpx.Spec(). Every other contract test in this
// repository parses the served document, because that is the document the
// endpoint it covers appears in. These two do not appear in it: both operations
// are marked x-internal, redocly strips them from the public bundle, and
// tools/check-contract.sh fails the build if one ever survives.
//
// A test written the usual way would therefore find no path, no responses and
// nothing to compare — and pass, because every loop it runs would be empty. It
// would be a green file asserting nothing about the only two write paths with a
// token in front of them. So this one reads the full contract instead, and the
// first thing it checks is that it found the operations at all.
//
// It reads a COPY, under testdata, written by `make gen` and held against the
// original by the drift check — not ../../../contract/openapi.yaml. That was
// the first attempt and it is green on a developer machine and broken in CI:
// `make check-db` mounts only ./api into the container, so the contract is not
// on the path at all there. The Go toolchain ignores testdata, so the copy is
// reachable from a test and cannot end up embedded in the binary.

type specDoc struct {
	Paths map[string]struct {
		Post *struct {
			OperationID string             `yaml:"operationId"`
			XInternal   bool               `yaml:"x-internal"`
			Security    []map[string][]any `yaml:"security"`
			RequestBody struct {
				Required bool `yaml:"required"`
			} `yaml:"requestBody"`
			Responses map[string]struct {
				Ref string `yaml:"$ref"`
			} `yaml:"responses"`
		} `yaml:"post"`
	} `yaml:"paths"`

	Components struct {
		Headers map[string]struct {
			Schema struct {
				Const string `yaml:"const"`
			} `yaml:"schema"`
		} `yaml:"headers"`

		Responses map[string]struct {
			Headers map[string]struct {
				Ref string `yaml:"$ref"`
			} `yaml:"headers"`
		} `yaml:"responses"`

		Schemas map[string]struct {
			Required []string `yaml:"required"`
		} `yaml:"schemas"`
	} `yaml:"components"`
}

// The two operations, next to the handler and the schema each one belongs to.
var operations = []struct {
	path   string
	opID   string
	schema string
}{
	{"/api/internal/probe", "reportProbe", "ProbeReport"},
	{"/api/internal/deploy", "reportDeploy", "DeployReport"},
}

func loadSpec(t *testing.T) specDoc {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "openapi.yaml"))
	if err != nil {
		t.Fatalf("the contract copy is missing — run make gen: %v", err)
	}

	var doc specDoc
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("the contract does not parse: %v", err)
	}
	return doc
}

func refName(ref string) string {
	return ref[strings.LastIndex(ref, "/")+1:]
}

// The guard that keeps every other test in this file from being vacuous.
func TestTheContractStillDescribesBothOperations(t *testing.T) {
	doc := loadSpec(t)

	for _, op := range operations {
		item, ok := doc.Paths[op.path]
		if !ok || item.Post == nil {
			t.Fatalf("the contract describes no POST %s", op.path)
		}
		if item.Post.OperationID != op.opID {
			t.Errorf("%s: operationId = %q, want %q", op.path, item.Post.OperationID, op.opID)
		}
		if !item.Post.RequestBody.Required {
			t.Errorf("%s: the request body is no longer required", op.path)
		}
	}
}

// The marker is what keeps them out of the public bundle. Without it these two
// paths are published on /api/docs, which the build plan forbids in as many
// words — and nothing else in this package would notice, because the handler
// behaves the same either way.
func TestBothOperationsAreStillMarkedInternalAndAuthenticated(t *testing.T) {
	doc := loadSpec(t)

	for _, op := range operations {
		post := doc.Paths[op.path].Post

		if !post.XInternal {
			t.Errorf("%s lost its x-internal marker and would be published", op.path)
		}

		var named bool
		for _, scheme := range post.Security {
			if _, ok := scheme["internalToken"]; ok {
				named = true
			}
		}
		if !named {
			t.Errorf("%s declares no internalToken", op.path)
		}
	}
}

// The counterpart of the above, from the other side: the document that is
// actually served must not contain them. tools/check-contract.sh greps for this
// too; here it is asserted against the bytes the binary embeds.
func TestNeitherOperationIsInTheServedDocument(t *testing.T) {
	served := string(httpx.Spec())

	for _, op := range operations {
		if strings.Contains(served, op.path) {
			t.Errorf("%s is in the document /api/docs renders", op.path)
		}
		if strings.Contains(served, op.schema) {
			t.Errorf("%s is in the document /api/docs renders", op.schema)
		}
	}
	if strings.Contains(served, "internalToken") {
		t.Error("the internal security scheme is in the served document")
	}
}

// The 204 declares a Cache-Control and the handler has to send that one.
func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	for _, op := range operations {
		response := doc.Components.Responses[refName(doc.Paths[op.path].Post.Responses["204"].Ref)]
		declared := doc.Components.Headers[refName(response.Headers["Cache-Control"].Ref)].Schema.Const

		if declared == "" {
			t.Fatalf("%s: the contract declares no constant Cache-Control on its 204", op.path)
		}
		if declared != cacheControl {
			t.Errorf("%s: the handler sends %q, the contract declares %q",
				op.path, cacheControl, declared)
		}
	}
}

// RFC 9110 requires WWW-Authenticate on a 401. The header is written by
// middleware.Bearer rather than by this package, so what is asserted here is
// that the contract still declares it — the value going out is asserted in
// middleware's own tests and against the assembled router in internal/server.
func TestTheUnauthorisedAnswerDeclaresItsScheme(t *testing.T) {
	doc := loadSpec(t)

	unauthorized := doc.Components.Responses["Unauthorized"]
	ref := unauthorized.Headers["WWW-Authenticate"].Ref
	if ref == "" {
		t.Fatal("the Unauthorized response declares no WWW-Authenticate")
	}
	if got := doc.Components.Headers[refName(ref)].Schema.Const; got != "Bearer" {
		t.Errorf("the declared scheme is %q, want %q", got, "Bearer")
	}
}

// A status in the document the handler can never produce is a promise to a
// client that will never be kept.
func TestEveryDeclaredResponseIsReachable(t *testing.T) {
	doc := loadSpec(t)

	for _, op := range operations {
		declared := doc.Paths[op.path].Post.Responses
		for _, want := range []string{"204", "400", "401", "429", "500"} {
			if _, ok := declared[want]; !ok {
				t.Errorf("the contract no longer declares %s for %s", want, op.path)
			}
		}
		if len(declared) != 5 {
			t.Errorf("%s declares %d responses; this test knows about 5", op.path, len(declared))
		}
	}

	// 204 and 400 and 500 come from this handler. The 401 belongs to
	// middleware.Bearer and the 429 to the rate limiter, so both are asserted
	// against the assembled router in internal/server instead.
	q := working()
	if rec := post(t, newHandler(t, q), "/api/internal/probe", probeBody(nil)); rec.Code != http.StatusNoContent {
		t.Errorf("204 is unreachable: got %d", rec.Code)
	}

	bad := post(t, newHandler(t, working()), "/api/internal/probe",
		probeBody(map[string]any{"reason": "x"}))
	if bad.Code != http.StatusBadRequest {
		t.Errorf("400 is unreachable: got %d", bad.Code)
	}

	broken := working()
	broken.checkErr = errUnreachable
	if rec := post(t, newHandler(t, broken), "/api/internal/probe", probeBody(nil)); rec.Code != http.StatusInternalServerError {
		t.Errorf("500 is unreachable: got %d", rec.Code)
	}
}

// The validator has to read exactly the fields the contract calls required —
// both directions, so a field that quietly stops being checked shows up here.
func TestTheRequiredFieldsAreTheOnesTheValidatorInsistsOn(t *testing.T) {
	doc := loadSpec(t)

	if got := doc.Components.Schemas["ProbeReport"].Required; !sameSet(got, []string{"at", "up"}) {
		t.Errorf("ProbeReport requires %v; this package validates at and up", got)
	}
	if got := doc.Components.Schemas["DeployReport"].Required; !sameSet(got,
		[]string{"sha", "durationSec", "result", "at"}) {
		t.Errorf("DeployReport requires %v; this package validates all four", got)
	}
}

func sameSet(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	seen := make(map[string]bool, len(got))
	for _, g := range got {
		seen[g] = true
	}
	for _, w := range want {
		if !seen[w] {
			return false
		}
	}
	return true
}
