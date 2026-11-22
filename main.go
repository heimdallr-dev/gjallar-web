// gjallar-web serves the single-page UI and reverse-proxies /api to the
// Gjallar API so the browser stays same-origin. Login is OIDC Authorization
// Code + PKCE in the browser, against any OIDC provider; this server holds no
// secrets. Standard library only, so the whole server is easy to audit.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

var version = "dev"

//go:embed ui
var ui embed.FS

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "gjallar-web", "version", version)
	h, err := handler(env("GJALLAR_API_URL", "http://gjallar-api:8080"), os.Getenv("GJALLAR_OIDC_ISSUER"), env("GJALLAR_OIDC_WEB_CLIENT_ID", "gjallar-web"), log)
	if err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	srv := &http.Server{Addr: env("GJALLAR_HTTP_ADDR", ":8083"), Handler: h, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shut, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shut)
	}()
	log.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func handler(api, issuer, clientID string, log *slog.Logger) (http.Handler, error) {
	apiURL, err := url.Parse(api)
	if err != nil || apiURL.Host == "" {
		return nil, errors.New("bad GJALLAR_API_URL: " + api)
	}
	sub, _ := fs.Sub(ui, "ui")
	cfg, _ := json.Marshal(map[string]string{"issuer": issuer, "clientId": clientID, "version": version})

	mux := http.NewServeMux()
	mux.Handle("/api/", httputil.NewSingleHostReverseProxy(apiURL))
	mux.HandleFunc("GET /config.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(cfg)
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	files := http.FileServer(http.FS(sub))
	policy := csp(issuer)
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", policy)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		files.ServeHTTP(w, r)
	}))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &status{ResponseWriter: w, code: 200}
		mux.ServeHTTP(rec, r)
		if r.URL.Path != "/healthz" {
			log.Info("http", "method", r.Method, "path", r.URL.Path, "code", rec.code, "ms", time.Since(start).Milliseconds())
		}
	}), nil
}

type status struct {
	http.ResponseWriter
	code int
}

func (s *status) WriteHeader(c int) { s.code = c; s.ResponseWriter.WriteHeader(c) }

// csp allows the browser to call the API (same origin) and the identity
// provider. The issuer gets a trailing "/": in CSP a path without one matches
// only that exact URL, which blocked discovery and the token endpoint.
func csp(issuer string) string {
	if issuer != "" {
		issuer = " " + strings.TrimSuffix(issuer, "/") + "/"
	}
	return "default-src 'self'; connect-src 'self'" + issuer + "; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
}
