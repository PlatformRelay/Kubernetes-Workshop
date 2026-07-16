# workshop-web — two-stage distroless build (US-ENV-8a, proposal §7).
#
# Result: a ~5 MB static Go binary on distroless/static, running as the
# distroless nonroot user (65532), no shell, no package manager, no writable
# paths needed — PSA `restricted`-clean out of the box.
#
# VERSION is baked per tag (v1/v2/v3) so the rollout labs get visibly
# different versions from one Dockerfile:
#   docker buildx build --build-arg VERSION=v2 -t ghcr.io/platformrelay/workshop-web:v2 .

FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /workshop-web .

FROM gcr.io/distroless/static-debian12:nonroot
ARG VERSION=dev
ENV VERSION=${VERSION}
COPY --from=build /workshop-web /workshop-web
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/workshop-web"]
