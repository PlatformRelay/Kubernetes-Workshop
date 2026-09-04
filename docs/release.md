# Cortando uma release

Notas de mantenedor para publicação imutável e ordenada (US-RELEASE-1). Pushes comuns
nunca fazem release — apenas uma tag `v*` anotada ou lightweight faz.

## Política

1. **Ordem — buildar e depois publicar.** O `.github/workflows/release.yml` exporta e
   valida os PDFs + o zip do site offline no job `build`, e então o job `publish`
   cria a GitHub Release. O publish não roda sem `needs: build`, e
   `fail_on_unmatched_files: true` recusa uma Release com artefatos faltando.
2. **Imutabilidade — tags nunca se movem.** Uma tag de release nomeia um commit para
   sempre. Não faça `git tag -f` / force-push de uma tag `v*` já publicada. O job de
   publish roda o `scripts/release-tag-guard.sh`, que permite retries no mesmo commit
   (idempotente) e **recusa** quando a tag remota ou a GitHub Release já apontam para um
   commit diferente. Falhas de lookup na API (rate-limit, 5xx, auth) falham fechado como
   `unknown` — elas nunca liberam o publish. Tags anotadas são peeled até o SHA do commit;
   uma falha de peel também é `unknown` (nunca comparada contra o SHA do objeto da tag).
   **Limite:** o guard do CI não consegue barrar uma tag force-pushed cujo tip já seja
   igual ao `github.sha` — após um force-move para o commit que está sendo publicado, a
   checagem parece idempotente. Garanta a imutabilidade de tags com branch/tag protection
   do GitHub ou um ruleset que bloqueie force-pushes em `v*`; não trate o workflow sozinho
   como uma fronteira rígida de imutabilidade.
3. **Proveniência.** Todo deck exportado carimba `VITE_WORKSHOP_VERSION` (a tag)
   e `VITE_WORKSHOP_SHA` (o commit tagueado) no chrome do slide.
4. **Permissões.** O default do workflow + o `build` usam `contents: read`. Apenas o
   `publish` recebe `contents: write`.

## O que uma release entrega

| Artefato | Origem |
| --- | --- |
| `kubernetes-workshop-day-{1,2,3}-<tag>.pdf` | Decks de entrada ao vivo do Day 1/2/3 |
| `kubernetes-workshop-full-<tag>.pdf` | Superset de compatibilidade (`slides.md`) |
| `kubernetes-workshop-3day-<tag>.pdf` | Corte combinado de compatibilidade |
| `kubernetes-workshop-site-<tag>.zip` | Bundle HTML offline do export dos decks no momento da release (layout de compatibilidade; veja as release notes). Docs+decks ao vivo no Pages usam `/` + `/deck/…` em vez disso. |

Tags de pre-release (nome contendo `-`, ex.: `v0.2.0-beta.1`) definem
`prerelease: true` e prefixam [`beta-limitations.md`](./beta-limitations.md)
(limitações conhecidas). Tags estáveis como `v0.4.0` publicam uma Release normal.

## Como cortar

### Antes de taguear (checklist)

- [ ] O tip da `main` é o commit que você pretende, e o CI está verde para esse tip.
- [ ] Re-verifique os status na página pública do [`roadmap.md`](./roadmap.md)
      (`in progress` / `planned` / `exploring`) contra o que está de fato na
      `main` — sem datas, sem linguagem de compromisso, nada listado como entregue que
      não esteja mergeado. Atualize a página na mesma janela de release se algo tiver
      saído do lugar.

```bash
# Confirm main is the commit you intend (and CI is green for that tip).
git checkout main && git pull --ff-only

# Optional local preflight (needs gh auth); dry-run prints the decision only.
bash scripts/release-tag-guard.sh check --dry-run v1.2.0 "$(git rev-parse HEAD)"

git tag v1.2.0                 # stable
# git tag v0.3.0-beta.1        # pre-release
git push origin v1.2.0         # → Release workflow
```

Se o guard recusar, **não** mova a tag. Corte uma nova versão ou investigue
por que a tag/release existente aponta para outro lugar.

## Fora do escopo aqui

A container image `workshop-web` (`workshop-web.yml`) é um pipeline separado
com suas próprias regras de digest/alias. Este documento cobre apenas a publicação
de PDF/site na GitHub Release.
