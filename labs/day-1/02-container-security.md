# Lab 02 — Escaneie & endureça uma image de container (S02)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S02 — Container security & supply chain |
| **Environment** | local — nenhum cluster necessário |
| **Estimated time** | 25 min |

## Objective

Pegar uma image deliberadamente descuidada — base gorda, rodando como **root**, com um **secret
gravado em uma layer** — e medir o tamanho do estrago. Depois endurecê-la em uma única passada
(base mínima + non-root + multi-stage) e **medir de novo**: escanear CVEs antes/depois, gerar um
**SBOM**, provar que um secret "deletado" ainda é recuperável e, por fim, **fazer o pin por
digest**. Ao final você consegue defender cada image que entrega com números, e não com achismo.

Esta é a metade de build-time da segurança. O Day 3 (S17/S25) impõe a metade de runtime.

## Prerequisites

- Um **container engine**: Docker, Podman ou nerdctl. **Sem cluster, sem `kubectl`.**
- O daemon/máquina do engine rodando (`docker info` retorna sem erro).
- Um **scanner de vulnerabilidades**: [Trivy](https://trivy.dev) (`trivy version` funciona). O Grype
  é um substituto perfeitamente válido — os comandos estão anotados onde diferem.
- Acesso à internet na primeira execução: o engine faz pull das base images e o Trivy baixa seu
  banco de CVEs.
- **Opcional** (só no Step 6): [cosign](https://docs.sigstore.dev/) para assinatura. Pode ser pulado.

> **Qual engine?** Todo comando usa `$ENGINE` para funcionar com os três. Defina uma vez:
>
> ```bash
> export ENGINE=docker      # ou: export ENGINE=podman   /   export ENGINE=nerdctl
> ```
>
> `--mount=type=secret` e `--secret` (Step 3) são recursos do BuildKit — no Docker eles vêm
> ligados por padrão; Podman e nerdctl suportam a mesma flag `--secret`.

## Files used

Todos criados inline no Step 1 (nada para baixar):

- `app/main.go`, `app/go.mod` — o servidor HTTP minúsculo do Lab 01 (apenas stdlib).
- `app/deploy_key` — um secret de build **falso**, com um marcador pesquisável.
- `app/Dockerfile.insecure` — base gorda, root, secret COPYado para dentro de uma layer.
- `app/Dockerfile.secret-rm` — a tentativa ingênua de "só dar `rm` no secret" (Step 5).
- `app/Dockerfile.hardened` — multi-stage, distroless, non-root, secret **montado** em vez de copiado.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./02-container-security.solution.md#guided-solutions)

### Step 1 — crie o projeto

Cole este bloco inteiro. Ele cria uma pasta `app/` com o código-fonte, um secret falso e três
Dockerfiles.

```bash
mkdir -p app && cd app

cat > main.go <<'EOF'
package main

import (
	"fmt"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host, _ := os.Hostname()
		fmt.Fprintf(w, "hello from %s\n", host)
	})
	fmt.Println("listening on :" + port)
	http.ListenAndServe(":"+port, nil)
}
EOF

cat > go.mod <<'EOF'
module demo

go 1.24
EOF

# um secret FALSO — repare no marcador pesquisável; vamos dar grep nele depois
cat > deploy_key <<'EOF'
-----BEGIN DEMO KEY-----
DEPLOY-SECRET-DO-NOT-SHIP-abc123
-----END DEMO KEY-----
EOF

cat > Dockerfile.insecure <<'EOF'
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
EOF

cat > Dockerfile.secret-rm <<'EOF'
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
RUN rm -f /src/deploy_key
ENTRYPOINT ["/bin/app"]
EOF

cat > Dockerfile.hardened <<'EOF'
# syntax=docker/dockerfile:1
# stage 1: build com o toolchain; o secret é MONTADO, nunca copiado para uma layer
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

# stage 2: distroless + non-root; sem shell, sem gerenciador de pacotes
FROM gcr.io/distroless/static:nonroot
COPY --from=build /bin/app /bin/app
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/bin/app"]
EOF

ls
```

**Tarefa:** confirme que os seis arquivos existem.

---

### Step 2 — construa a image descuidada e meça-a

Faça o build da image insegura, confirme que ela roda como **root**, depois escaneie-a e **anote os
números**.

```bash
$ENGINE build -f Dockerfile.insecure -t demo:insecure .
$ENGINE image inspect demo:insecure --format 'user=[{{.Config.User}}]'   # vazio = root
trivy image --severity HIGH,CRITICAL demo:insecure
```

**Tarefa:** o campo `user=[]` está vazio (root). Registre as contagens de HIGH e CRITICAL **e os
nomes acima de cada tabela de resultados**. A image de toolchain pode reportar o mesmo achado de Go
para o app, o compilador, o formatador e as ferramentas de build, enquanto a tabela de pacotes do
SO muda sempre que o banco de vulnerabilidades ou a tag da base muda.

**Pergunta:** você escreveu um app Go minúsculo. Por que o scanner inspeciona tantos binários e
pacotes de SO que seu runtime nunca chama?

---

### Step 3 — endureça e meça de novo

Faça o build da image endurecida. O secret é **montado** (nunca escrito em uma layer), o binário é
**estático** (`CGO_ENABLED=0`) para rodar em uma base minúscula, e o estágio final é **distroless +
non-root**.

```bash
# --secret entrega o arquivo ao build sem gravá-lo em nenhuma layer
$ENGINE build -f Dockerfile.hardened --secret id=deploy_key,src=deploy_key -t demo:hardened .

$ENGINE image inspect demo:hardened --format 'user=[{{.Config.User}}]'   # 65532 = non-root
$ENGINE images demo                                                       # compare os tamanhos
trivy image --severity HIGH,CRITICAL demo:hardened
```

**Tarefa:** a image endurecida roda como UID **65532**, é dramaticamente menor, e o Trivy agora tem
muito menos componentes e tabelas de resultados para inspecionar. Compare os **componentes
afetados**, e não só a contagem do topo: o app compilado pode manter os mesmos achados da stdlib do
Go até ser reconstruído com uma release corrigida do Go. Uma image pequena é superfície de ataque
reduzida, não prova de zero vulnerabilidades.

**Pergunta:** tente abrir um shell na image endurecida: `$ENGINE run --rm -it demo:hardened sh`.
Por que isso falha — e por que isso é uma coisa **boa**?

---

### Step 4 — gere um SBOM

Um SBOM (Software Bill of Materials) lista cada componente da image. Quando o próximo CVE grande
aparecer, você pesquisa nos seus SBOMs em vez de reconstruir e reescanear tudo.

```bash
# o Trivy consegue emitir um SBOM CycloneDX; --format spdx-json é a alternativa SPDX
trivy image --format cyclonedx --output sbom.json demo:hardened
wc -l sbom.json
grep -o '"name":"[^"]*"' sbom.json | head
```

**Tarefa:** o `sbom.json` existe e lista componentes nomeados. Encontre pelo menos uma dependência ali.

**Pergunta:** por que manter um SBOM se você pode simplesmente reescanear a image quando quiser?

---

### Step 5 — quebre de propósito: um secret "deletado" continua sendo entregue

O conserto ingênuo para um secret gravado na image é dar `rm` nele em um passo posterior. Prove que
isso não funciona.

```bash
$ENGINE build -f Dockerfile.secret-rm -t demo:secret-rm .
$ENGINE run --rm demo:secret-rm ls /src/deploy_key   # sumiu do filesystem final?
$ENGINE history --no-trunc demo:secret-rm | grep -i deploy_key
```

**Tarefa:** o arquivo está ausente do container em execução, **mas** o `history` ainda mostra a
layer que o adicionou.

Agora recupere o secret da image de verdade — nenhum whiteout impede isto:

```bash
mkdir -p /tmp/dig && $ENGINE save demo:secret-rm | tar -x -C /tmp/dig
# os blobs de layer podem estar puros OU gzipados, dependendo do engine — trate os dois casos:
find /tmp/dig -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" | head -1
```

**Tarefa:** a string do marcador é recuperada direto dos blobs de layer da image salva.

> **Nota sobre engines:** o image store clássico do Docker grava tars de layer **não comprimidos**,
> então um `grep -ra /tmp/dig` puro também encontra o secret. O store do containerd e o
> `nerdctl save` podem **gzipar** os blobs — o `gzip -dc … || cat` acima cobre os dois casos. Se
> você algum dia vir "not found" aqui, suspeite de compressão, não de segurança.

Agora prove que a image endurecida está limpa — mesma recuperação, nenhum acerto:

```bash
mkdir -p /tmp/dig2 && $ENGINE save demo:hardened | tar -x -C /tmp/dig2
find /tmp/dig2 -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" || echo "NOT FOUND — clean"
```

**Pergunta:** você entregou `demo:secret-rm` a um registry por acidente na semana passada e hoje a
reconstruiu "limpa". O secret está seguro agora?

---

### Step 6 — (opcional) assine & verifique

Assinar permite que um consumidor prove que uma image é realmente sua e não foi adulterada. Isto
exige o **cosign** e um registry para onde fazer push; pule se faltar algum dos dois — leia a saída
esperada em vez disso.

```bash
# uma vez só: um registry local para onde fazer push, e um par de chaves
$ENGINE run -d -p 5000:5000 --name lab-registry registry:2
cosign generate-key-pair                        # escreve cosign.key / cosign.pub

$ENGINE tag demo:hardened localhost:5000/demo:hardened
$ENGINE push localhost:5000/demo:hardened
# o registry local é HTTP puro, então o cosign precisa de --allow-insecure-registry
cosign sign --key cosign.key --allow-insecure-registry localhost:5000/demo:hardened
cosign verify --key cosign.pub --allow-insecure-registry localhost:5000/demo:hardened
```

**Tarefa:** o `verify` tem sucesso para a image assinada; se você fizer push de uma image
*diferente* para a mesma tag, o `verify` falha.

**Pergunta (sem precisar de ferramenta):** a assinatura cobre o digest, não a tag. Por que isso importa?

---

### Step 7 — faça o pin da referência final por digest

Uma tag pode se mover; um **digest** nomeia bytes exatos. Pegue o digest de conteúdo da image
endurecida e execute-a por digest.

```bash
DIGEST=$($ENGINE image inspect demo:hardened --format '{{.Id}}')   # sha256:... (digest de conteúdo)
echo "$DIGEST"
$ENGINE run -d --name demo-pin -p 8080:8080 "$DIGEST"              # execute por digest, não por tag
curl -s localhost:8080
$ENGINE rm -f demo-pin
```

**Tarefa:** a image roda quando referenciada puramente pelo seu digest `sha256:`, e o `curl` responde.

**Pergunta:** se você fizer o pin por digest no seu Deployment, o que você perde em comparação com
`image: demo:1.4`?

---

## Observe

- A image **insegura** roda como **root** e faz o Trivy inspecionar a aplicação mais o compilador,
  o formatador, as ferramentas de build e centenas de pacotes da base.
- A image **endurecida** é dramaticamente menor, roda como **UID 65532** e não tem shell nem
  toolchain. O app dela ainda pode reportar achados da stdlib do Go até ser reconstruído com um
  compilador corrigido.
- Um **SBOM** lista componentes reais (ex.: a versão da `stdlib` do Go) contra os quais você pode
  dar grep em CVEs futuros.
- Um secret com `rm` em uma layer posterior **continua recuperável** de `demo:secret-rm`; o secret
  **montado** não deixa **rastro nenhum** em `demo:hardened`.
- (Opcional) o `cosign verify` **tem sucesso** para o digest assinado e **falha** após adulteração.
- A image endurecida roda quando referenciada pelo seu **digest `sha256:`**.

---

## Challenge

A base distroless ainda mostrou alguns componentes no SBOM. Experimente
`gcr.io/distroless/static-debian12:nonroot` contra um build `FROM scratch` (copiando apenas o
binário estático e um CA bundle). Escaneie e gere o SBOM dos dois — quão perto de uma bill of
materials realmente vazia dá para chegar, e o que quebra (TLS, timezones) quando você vai até o
fim, no `scratch`?

**Difficulty:** Advanced

**Success criteria:** Faça o build das variantes distroless e scratch, escaneie cada image,
gere um SBOM para cada uma, execute cada uma por digest, e explique quais arquivos de runtime
o scratch precisa para HTTPS.

**Hints:** Reutilize o estágio de builder existente; copie o binário e o CA bundle para o
scratch, depois compare `trivy image`, o SBOM CycloneDX e os resultados HTTP de runtime lado a lado.

[Spoiler: solução do challenge](./02-container-security.solution.md#challenge-solution)

## Verify

Prove que o artefato endurecido é non-root e que o secret falso está ausente antes da limpeza.

```bash
$ENGINE image inspect demo:hardened --format 'user={{.Config.User}}'
rm -rf /tmp/hardened-layers && mkdir -p /tmp/hardened-layers
$ENGINE save demo:hardened | tar -x -C /tmp/hardened-layers
if find /tmp/hardened-layers -type f \
  -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -aq 'DEPLOY-SECRET-DO-NOT-SHIP'; then
  echo "secret leaked into hardened image" >&2
  exit 1
fi
trivy image --severity HIGH,CRITICAL demo:hardened
```

Esperado: user `65532`, nenhum acerto do secret, e muito menos componentes instalados/afetados que
na image descuidada. Os achados restantes do app são reais e não podem ser descritos como zero.

## Cleanup / reset

Tudo viveu em `app/`, mais algumas images e (opcionalmente) um registry local — nenhum cluster foi
tocado.

```bash
# pare & remova o registry local opcional (ignore se você pulou o Step 6)
$ENGINE rm -f lab-registry 2>/dev/null || true

# remova as images que este lab construiu
$ENGINE rmi -f demo:insecure demo:secret-rm demo:hardened demo:distroless demo:scratch \
  localhost:5000/demo:hardened 2>/dev/null || true

# remova as layers extraídas, os artefatos gerados e o projeto
rm -f sbom.json sbom-distroless.json sbom-scratch.json
rm -rf /tmp/dig /tmp/dig2 /tmp/hardened-layers && cd .. && rm -rf app
```
