package contact

import (
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for this phase's endpoint.
//
// The tests next door check that the handler behaves; this one checks that it
// behaves the way the served document says — and it reads the expectation out of
// that document rather than restating it. ADR 0009 puts the cache directive in
// the contract so a handler cannot invent one, and a test that hard-coded the
// value would be a second copy and the exact thing that rule prevents.
//
// It carries two assertions the read endpoints' contract tests do not need. The
// required fields of ContactRequest are held against the fields the validator
// actually demands, so a seventh field added to the schema cannot sit there
// unread. And the five declared statuses are each produced by driving the real
// handler, including the 202 that a refusal returns — which is the one place
// where "the contract is satisfied" and "the message was sent" are deliberately
// different sentences.

type response struct {
	Headers map[string]struct {
		Ref string `yaml:"$ref"`
	} `yaml:"headers"`
	Content map[string]struct{} `yaml:"content"`
	Ref     string              `yaml:"$ref"`
}

type specDoc struct {
	Paths map[string]struct {
		Post *struct {
			Responses map[string]response `yaml:"responses"`
		} `yaml:"post"`
	} `yaml:"paths"`

	Components struct {
		Headers map[string]struct {
			Schema struct {
				Const string `yaml:"const"`
			} `yaml:"schema"`
		} `yaml:"headers"`

		Schemas map[string]struct {
			Required   []string `yaml:"required"`
			Properties map[string]struct {
				MinLength *int `yaml:"minLength"`
				MaxLength *int `yaml:"maxLength"`
				Minimum   *int `yaml:"minimum"`
			} `yaml:"properties"`
		} `yaml:"schemas"`
	} `yaml:"components"`
}

const contactPath = "/api/contact"

func loadSpec(t *testing.T) specDoc {
	t.Helper()

	var doc specDoc
	if err := yaml.Unmarshal(httpx.Spec(), &doc); err != nil {
		t.Fatalf("the served document does not parse: %v", err)
	}
	return doc
}

func operation(t *testing.T, doc specDoc) map[string]response {
	t.Helper()

	item, ok := doc.Paths[contactPath]
	if !ok || item.Post == nil {
		t.Fatalf("the served contract describes no POST %s", contactPath)
	}
	return item.Post.Responses
}

func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	ref := operation(t, doc)["202"].Headers["Cache-Control"].Ref
	name := ref[strings.LastIndex(ref, "/")+1:]
	want := doc.Components.Headers[name].Schema.Const
	if want == "" {
		t.Fatalf("the contract names no cache directive for the 202 (ref %q)", ref)
	}

	if string(cacheControl) != want {
		t.Errorf("this package sends %q, the contract says %q", cacheControl, want)
	}

	w := post(t, newHandler(t, &stubQueries{}, &stubSender{}), body(nil), nil)
	if got := w.Header().Get("Cache-Control"); got != want {
		t.Errorf("the response carries %q, the contract says %q", got, want)
	}
}

func TestTheDeclaredMediaTypeIsWhatIsSent(t *testing.T) {
	doc := loadSpec(t)

	for media := range operation(t, doc)["202"].Content {
		w := post(t, newHandler(t, &stubQueries{}, &stubSender{}), body(nil), nil)
		if got := w.Header().Get("Content-Type"); !strings.HasPrefix(got, media) {
			t.Errorf("the 202 is %q, the contract declares %q", got, media)
		}
	}
}

// Every status the contract declares is reachable, and the ones it does not
// declare are not produced.
//
// The 429 has two halves: the token bucket in front of the route belongs to the
// server package and is asserted there, and the database floor belongs here.
// This drives the floor.
func TestEveryDeclaredResponseIsReachable(t *testing.T) {
	doc := loadSpec(t)
	declared := operation(t, doc)

	for _, status := range []string{"202", "400", "429", "502", "500"} {
		if _, ok := declared[status]; !ok {
			t.Errorf("the contract does not declare a %s for POST %s", status, contactPath)
		}
	}
	for _, status := range []string{"404", "401", "403", "204"} {
		if _, ok := declared[status]; ok {
			t.Errorf("the contract declares a %s this handler never produces", status)
		}
	}
	if len(declared) != 5 {
		t.Errorf("the contract declares %d responses, this test drives 5", len(declared))
	}

	for _, tc := range []struct {
		status int
		drive  func(t *testing.T) *Handler
		body   map[string]any
	}{
		{
			status: http.StatusAccepted,
			drive:  func(t *testing.T) *Handler { return newHandler(t, &stubQueries{}, &stubSender{}) },
			body:   body(nil),
		},
		{
			status: http.StatusBadRequest,
			drive:  func(t *testing.T) *Handler { return newHandler(t, &stubQueries{}, &stubSender{}) },
			body:   body(map[string]any{"message": "kurz"}),
		},
		{
			status: http.StatusTooManyRequests,
			drive: func(t *testing.T) *Handler {
				return newHandler(t, &stubQueries{
					recent: RateLimit, oldest: testNow.Add(-time.Minute),
				}, &stubSender{})
			},
			body: body(nil),
		},
		{
			status: http.StatusBadGateway,
			drive: func(t *testing.T) *Handler {
				return newHandler(t, &stubQueries{},
					&stubSender{err: errors.New("451 the relay was busy")})
			},
			body: body(nil),
		},
		{
			status: http.StatusInternalServerError,
			drive: func(t *testing.T) *Handler {
				return newHandler(t, &stubQueries{insertErr: errors.New("the pool is gone")},
					&stubSender{})
			},
			body: body(nil),
		},
	} {
		w := post(t, tc.drive(t), tc.body, nil)
		if w.Code != tc.status {
			t.Errorf("driving the %d path gave %d\n%s", tc.status, w.Code, w.Body.String())
		}
	}
}

func TestTheRequiredFieldsArePresentInTheAnswer(t *testing.T) {
	doc := loadSpec(t)

	required := doc.Components.Schemas["ContactAccepted"].Required
	if len(required) == 0 {
		t.Fatal("the contract lists no required fields for ContactAccepted")
	}

	receipt := receiptOf(t, post(t, newHandler(t, &stubQueries{}, &stubSender{}), body(nil), nil))
	for _, field := range required {
		switch field {
		case "ok":
			if !bool(receipt.Ok) {
				t.Error("ok is false, and the contract says it is const true")
			}
		case "id":
			if receipt.Id == "" {
				t.Error("id is empty")
			}
		default:
			t.Errorf("the contract requires %q and this test does not check it", field)
		}
	}
}

// The other direction, and the one that catches a contract change nobody
// implemented: every field ContactRequest requires has to be one the validator
// actually reads.
func TestTheValidatorReadsEveryRequiredField(t *testing.T) {
	doc := loadSpec(t)

	required := doc.Components.Schemas["ContactRequest"].Required
	read := []string{"name", "email", "message", "company", "dwellMs", "ts"}

	for _, field := range required {
		if !slices.Contains(read, field) {
			t.Errorf("the contract requires %q and nothing in validate looks at it", field)
		}
	}
	for _, field := range read {
		if !slices.Contains(required, field) {
			t.Errorf("validate reads %q and the contract does not require it", field)
		}
	}
}

// The bounds live in the contract and are restated as constants here, because a
// handler cannot read a minLength at runtime. This is what keeps the two honest.
func TestTheFieldBoundsAreTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)
	properties := doc.Components.Schemas["ContactRequest"].Properties

	for _, tc := range []struct {
		field string
		got   int
		want  *int
		which string
	}{
		{"name", minName, properties["name"].MinLength, "minLength"},
		{"name", maxName, properties["name"].MaxLength, "maxLength"},
		{"email", maxEmail, properties["email"].MaxLength, "maxLength"},
		{"message", minMessage, properties["message"].MinLength, "minLength"},
		{"message", maxMessage, properties["message"].MaxLength, "maxLength"},
		{"dwellMs", minDwell, properties["dwellMs"].Minimum, "minimum"},
	} {
		if tc.want == nil {
			t.Errorf("the contract states no %s for %s", tc.which, tc.field)
			continue
		}
		if tc.got != *tc.want {
			t.Errorf("%s %s is %d here and %d in the contract",
				tc.field, tc.which, tc.got, *tc.want)
		}
	}

	// The honeypot's bound is the rule: maxLength 0 is "must be empty".
	if got := properties["company"].MaxLength; got == nil || *got != 0 {
		t.Errorf("company maxLength is %v, want 0 — that is what makes it a honeypot", got)
	}
}

// ADR 0009 registers the type this endpoint's 502 uses. It is the one problem
// type in the registry that names its upstream, and ADR 0020 §6 cites it as the
// reason not to mint another — so it is used here rather than quietly replaced.
func TestThe502UsesTheRegisteredMailProblemType(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{err: errors.New("451 busy")})
	p := problem(t, post(t, h, body(nil), nil), http.StatusBadGateway)

	if p.Type != httpx.TypeMailProviderUnavailable {
		t.Errorf("type = %q, want %q", p.Type, httpx.TypeMailProviderUnavailable)
	}
	if !strings.HasPrefix(p.Type, "https://timseil.dev/problems/") {
		t.Errorf("type %q is outside the registry's namespace", p.Type)
	}
}
