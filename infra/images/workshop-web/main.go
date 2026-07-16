// workshop-web — the workshop's demo HTTP server (US-ENV-8a, proposal §7).
//
// A tiny, dependency-free replacement for the retired nginx demo images:
// it listens on :8080 (unprivileged) and answers every request with the pod
// name, its version (v1/v2/v3), a request counter, and its readiness state —
// so Service load-balancing, rolling updates, and probe drains are visible
// in the response body instead of a static welcome page.
//
// Endpoints:
//
//	GET  /         plain-text status (HTML when the client prefers text/html)
//	GET  /healthz  liveness  — always 200 while the process runs
//	GET  /ready    readiness — 200, or 503 after POST /fail (or FAIL_READY=1)
//	POST /fail     flip readiness to failing (Lab 14 probe demos)
//	POST /recover  flip readiness back to ok
//
// The binary never writes to disk and needs no capabilities, so it runs
// non-root with a read-only root filesystem out of the box (PSA restricted).
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// version is set via the VERSION env var (baked per image tag: v1/v2/v3).
var version = "dev"

// versionColors makes rollouts visible at a glance in a browser.
var versionColors = map[string]string{
	"v1": "#326ce5", // Kubernetes blue
	"v2": "#2ecc71", // green
	"v3": "#e67e22", // orange
}

type server struct {
	podName  string
	requests atomic.Int64
	ready    atomic.Bool
}

func newServer() *server {
	s := &server{}
	s.podName, _ = os.Hostname()
	if s.podName == "" {
		s.podName = "unknown"
	}
	if v := os.Getenv("VERSION"); v != "" {
		version = v
	}
	// FAIL_READY=1 starts the pod not-ready (readiness-gate teaching demos).
	s.ready.Store(os.Getenv("FAIL_READY") != "1")
	return s
}

func (s *server) color() string {
	if c, ok := versionColors[version]; ok {
		return c
	}
	return "#95a5a6" // grey for dev/unknown versions
}

// root answers with pod name, version, request count, and readiness state.
func (s *server) root(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	n := s.requests.Add(1)
	ready := s.ready.Load()
	if strings.Contains(r.Header.Get("Accept"), "text/html") {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!DOCTYPE html>
<html><head><title>workshop-web %[1]s</title></head>
<body style="background:%[2]s;color:#fff;font-family:monospace;padding:2rem">
<h1>workshop-web %[1]s</h1>
<p>pod: %[3]s</p>
<p>requests served: %[4]d</p>
<p>ready: %[5]t</p>
</body></html>
`, version, s.color(), s.podName, n, ready)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprintf(w, "workshop-web %s\npod: %s\nrequests served: %d\nready: %t\n",
		version, s.podName, n, ready)
}

// healthz is the liveness endpoint: 200 for as long as the process serves.
func (s *server) healthz(w http.ResponseWriter, _ *http.Request) {
	fmt.Fprintln(w, "ok")
}

// readyz is the readiness endpoint: 200 normally, 503 after POST /fail.
func (s *server) readyz(w http.ResponseWriter, _ *http.Request) {
	if !s.ready.Load() {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	fmt.Fprintln(w, "ready")
}

// setReady handles POST /fail and POST /recover.
func (s *server) setReady(ready bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "use POST", http.StatusMethodNotAllowed)
			return
		}
		s.ready.Store(ready)
		fmt.Fprintf(w, "ready=%t\n", ready)
	}
}

func (s *server) mux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.root)
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/ready", s.readyz)
	mux.HandleFunc("/fail", s.setReady(false))
	mux.HandleFunc("/recover", s.setReady(true))
	return mux
}

func main() {
	s := newServer()
	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           s.mux(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("workshop-web %s listening on %s (pod %s)", version, addr, s.podName)
	log.Fatal(srv.ListenAndServe())
}
