# syntax=docker/dockerfile:1.7
# gjallar-web: one static binary (standard library only) with the UI embedded.
ARG GO_VERSION=1.26.11
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
COPY go.mod *.go ./
COPY ui ./ui
ARG VERSION=dev
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/gjallar-web .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gjallar-web /gjallar-web
EXPOSE 8083
ENTRYPOINT ["/gjallar-web"]
