package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCSPAllowsIssuerSubpaths(t *testing.T) {
	p := csp("https://kc.example.com/realms/gjallar")
	if !strings.Contains(p, "connect-src 'self' https://kc.example.com/realms/gjallar/;") {
		t.Fatalf("issuer must be a path prefix (trailing /): %s", p)
	}
	if p := csp(""); !strings.Contains(p, "connect-src 'self';") {
		t.Fatalf("no issuer: %s", p)
	}
}

func TestServesUIConfigAndProxiesAPI(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "api:"+r.URL.Path) }))
	defer api.Close()
	h, err := handler(api.URL, "https://kc.example.com/realms/gjallar", "gjallar-web", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(h)
	defer srv.Close()
	get := func(p string) (*http.Response, string) {
		r, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		b, _ := io.ReadAll(r.Body)
		return r, string(b)
	}
	if r, b := get("/"); r.StatusCode != 200 || !strings.Contains(b, "<html") || !strings.Contains(r.Header.Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatalf("index: %d csp=%q", r.StatusCode, r.Header.Get("Content-Security-Policy"))
	}
	if _, b := get("/config.json"); !strings.Contains(b, `"issuer":"https://kc.example.com/realms/gjallar"`) {
		t.Fatalf("config: %s", b)
	}
	if _, b := get("/api/v1/images"); b != "api:/api/v1/images" {
		t.Fatalf("proxy: %s", b)
	}
	if _, err := handler("not a url", "", "", nil); err == nil {
		t.Fatal("bad API URL must fail")
	}
}
