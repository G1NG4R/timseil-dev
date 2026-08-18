package main

import (
	"context"
	"net/http"
	"os"
	"time"
)

// The container's health probe, and the reason it lives in the binary at all.
//
// compose.dev.yaml knocks on /healthz with busybox wget, which works because the
// development image is Alpine. The production image is distroless/static: no
// shell, no wget, nothing to run a command with. A healthcheck copied across
// would report a perfectly healthy container as unhealthy, and D2 wires a
// startup order that waits on exactly that answer.
//
// So the binary answers for itself: `/api -healthcheck` dials the server this
// same binary is running, and its exit code is the whole message.
const (
	// /readyz and not /healthz. /healthz says the process exists, which is
	// something Docker already knows. /readyz says it can reach Postgres and is
	// still accepting work — and it answers 503 while draining, which is
	// precisely what a container that should stop receiving traffic looks like.
	healthcheckPath = "/readyz"

	// Under the --timeout the HEALTHCHECK line sets, so the answer is this
	// function's and not Docker's. A probe killed from outside is indistinguishable
	// from a hung server, and the two want different reactions.
	healthcheckTimeout = 2 * time.Second
)

// wantsHealthcheck reports whether this invocation is the probe rather than the
// server.
//
// Scanned rather than parsed with flag, and that is deliberate. flag.Parse would
// have to run before config.Load — before the process knows anything — and it
// would claim a command-line surface this program does not have: one flag, no
// arguments, no subcommands. Both spellings are accepted because a HEALTHCHECK
// line is written once and read never, and `--healthcheck` failing silently
// there would look exactly like a broken server.
func wantsHealthcheck(args []string) bool {
	for _, a := range args {
		if a == "-healthcheck" || a == "--healthcheck" {
			return true
		}
	}
	return false
}

// healthcheck dials url and reports the exit code the probe should end with.
//
// It reads no configuration and opens no pool. That is the whole design: a
// broken GITHUB_TOKEN or an unreachable database at probe time would otherwise
// make a running container report unhealthy for a reason that has nothing to do
// with whether it is serving — and the container would be restarted for it.
//
// Nothing is printed. The exit code is the answer, and the reason behind a 503
// is already in the process's own log, where it is one line rather than one line
// every five seconds.
func healthcheck(url string) int {
	ctx, cancel := context.WithTimeout(context.Background(), healthcheckTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 1
	}

	// Proxy: nil, explicitly. http.DefaultTransport reads HTTP_PROXY from the
	// environment, and a deployment that sets one for outbound traffic would
	// send this loopback request through it. DisableKeepAlives because the
	// process makes one request and exits.
	client := &http.Client{Transport: &http.Transport{
		Proxy:             nil,
		DisableKeepAlives: true,
	}}

	resp, err := client.Do(req)
	if err != nil {
		return 1
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

// probeURL is where the probe knocks: this process, on the port it fixed for
// itself. listenAddr rather than a second "8080" — two places to type a port is
// one place for them to disagree.
func probeURL() string { return "http://127.0.0.1" + listenAddr + healthcheckPath }

// runHealthcheck is the branch main takes before it does anything else.
func runHealthcheck() { os.Exit(healthcheck(probeURL())) }
