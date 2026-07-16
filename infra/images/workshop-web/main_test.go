package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testServer(t *testing.T) (*server, *httptest.Server) {
	t.Helper()
	s := newServer()
	ts := httptest.NewServer(s.mux())
	t.Cleanup(ts.Close)
	return s, ts
}

func get(t *testing.T, url string, header ...string) (*http.Response, string) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res, string(body)
}

func post(t *testing.T, url string) *http.Response {
	t.Helper()
	res, err := http.Post(url, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	return res
}

func TestRootShowsPodVersionCountAndReadiness(t *testing.T) {
	s, ts := testServer(t)
	res, body := get(t, ts.URL+"/")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET / = %d, want 200", res.StatusCode)
	}
	for _, want := range []string{
		"workshop-web " + version,
		"pod: " + s.podName,
		"requests served: 1",
		"ready: true",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("GET / body missing %q:\n%s", want, body)
		}
	}
	// The counter increments per request.
	if _, body = get(t, ts.URL+"/"); !strings.Contains(body, "requests served: 2") {
		t.Errorf("request counter did not increment:\n%s", body)
	}
}

func TestRootServesColoredHTMLWhenAccepted(t *testing.T) {
	_, ts := testServer(t)
	res, body := get(t, ts.URL+"/", "Accept", "text/html")
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", ct)
	}
	if !strings.Contains(body, "background:") {
		t.Errorf("HTML body carries no version colour:\n%s", body)
	}
}

func TestUnknownPathIs404(t *testing.T) {
	_, ts := testServer(t)
	if res, _ := get(t, ts.URL+"/nope"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("GET /nope = %d, want 404", res.StatusCode)
	}
}

func TestHealthzAlwaysOK(t *testing.T) {
	_, ts := testServer(t)
	if res, _ := get(t, ts.URL+"/healthz"); res.StatusCode != http.StatusOK {
		t.Fatalf("GET /healthz = %d, want 200", res.StatusCode)
	}
	// Liveness stays green even when readiness fails.
	post(t, ts.URL+"/fail")
	if res, _ := get(t, ts.URL+"/healthz"); res.StatusCode != http.StatusOK {
		t.Fatalf("GET /healthz after /fail = %d, want 200", res.StatusCode)
	}
}

func TestFailAndRecoverFlipReadiness(t *testing.T) {
	_, ts := testServer(t)
	if res, _ := get(t, ts.URL+"/ready"); res.StatusCode != http.StatusOK {
		t.Fatalf("GET /ready = %d, want 200", res.StatusCode)
	}
	if res := post(t, ts.URL+"/fail"); res.StatusCode != http.StatusOK {
		t.Fatalf("POST /fail = %d, want 200", res.StatusCode)
	}
	if res, _ := get(t, ts.URL+"/ready"); res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("GET /ready after /fail = %d, want 503", res.StatusCode)
	}
	// The root page reports the drained state.
	if _, body := get(t, ts.URL+"/"); !strings.Contains(body, "ready: false") {
		t.Errorf("GET / does not report ready: false:\n%s", body)
	}
	if res := post(t, ts.URL+"/recover"); res.StatusCode != http.StatusOK {
		t.Fatalf("POST /recover = %d, want 200", res.StatusCode)
	}
	if res, _ := get(t, ts.URL+"/ready"); res.StatusCode != http.StatusOK {
		t.Fatalf("GET /ready after /recover = %d, want 200", res.StatusCode)
	}
}

func TestFailRequiresPOST(t *testing.T) {
	_, ts := testServer(t)
	if res, _ := get(t, ts.URL+"/fail"); res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("GET /fail = %d, want 405", res.StatusCode)
	}
	// A stray GET must not flip readiness.
	if res, _ := get(t, ts.URL+"/ready"); res.StatusCode != http.StatusOK {
		t.Fatalf("GET /ready after GET /fail = %d, want 200", res.StatusCode)
	}
}

func TestFailReadyEnvStartsNotReady(t *testing.T) {
	t.Setenv("FAIL_READY", "1")
	s := newServer()
	ts := httptest.NewServer(s.mux())
	defer ts.Close()
	if res, _ := get(t, ts.URL+"/ready"); res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("GET /ready with FAIL_READY=1 = %d, want 503", res.StatusCode)
	}
}
