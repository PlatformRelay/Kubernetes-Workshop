# Lab 01 — Construa & inspecione uma image de container (S01)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S01 — Containers |
| **Environment** | local — nenhum cluster necessário |
| **Estimated time** | 25 min |

## Objective

Construir uma image de container a partir de um Dockerfile, executá-la, olhar **dentro** dela e
ler as **layers** de que ela é feita. Ao final, uma image deixa de ser mágica: é uma pilha
ordenada de layers, executada como um processo comum (non-root). Você também vai sentir na pele
duas coisas em que iniciantes tropeçam — o **caching** de build e a **tag** `latest` — quebrando
as duas de propósito.

## Prerequisites

- Um **container engine** na sua máquina: Docker, Podman ou nerdctl. **Sem cluster, sem `kubectl`.**
- O daemon/máquina do engine rodando (`docker info` — ou `podman info` — retorna sem erro).
- Um terminal em que você consiga copiar e colar. O Lab 00 não é necessário para este.

> **Qual engine?** Todo comando abaixo usa `$ENGINE` para funcionar com os três. Defina uma vez:
>
> ```bash
> export ENGINE=docker      # ou: export ENGINE=podman   /   export ENGINE=nerdctl
> ```
>
> Podman e nerdctl são substitutos quase diretos do CLI `docker` usado aqui.

## Files used

Todos criados inline no Step 1 (nada para baixar):

- `app/main.go` — um pequeno servidor HTTP que imprime seu hostname.
- `app/go.mod` — o arquivo de módulo Go (apenas stdlib, sem dependências).
- `app/Dockerfile` — build de estágio único (acompanha o passo a passo dos slides).
- `app/Dockerfile.multistage` — a versão enxuta, multi-stage, para o Step 6.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./01-containers.solution.md#guided-solutions)

### Step 1 — crie o projeto

Cole este bloco inteiro. Ele cria uma pasta `app/` com o código-fonte e os dois Dockerfiles.

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

cat > Dockerfile <<'EOF'
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
ENV PORT=8080
RUN useradd -u 10001 app
USER 10001
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
EOF

cat > Dockerfile.multistage <<'EOF'
# stage 1: build com o toolchain completo
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
# CGO_ENABLED=0 produz um binário estático que roda em uma base mínima
RUN CGO_ENABLED=0 go build -o /bin/app .

# stage 2: entregue apenas o binário
FROM alpine:3.20
RUN adduser -D -u 10001 app
COPY --from=build /bin/app /bin/app
ENV PORT=8080
USER 10001
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
EOF

ls
```

**Tarefa:** confirme que os quatro arquivos existem.

---

### Step 2 — faça o build e execute

Faça o build da image, marque-a com a tag `demo:1`, depois execute-a **detached** com a porta do
container publicada na sua máquina.

```bash
$ENGINE build -t demo:1 .
$ENGINE run -d --name demo -p 8080:8080 demo:1
$ENGINE ps
curl -s localhost:8080
```

**Tarefa:** o build tem sucesso, o `ps` mostra o container `Up`, e o `curl` imprime uma saudação.

**Pergunta:** você publicou `-p 8080:8080`. Qual número é do host e qual é do container?

---

### Step 3 — olhe dentro do container em execução

Você não precisa confiar no Dockerfile — verifique que o processo é realmente **non-root**, e
inspecione-o tanto de dentro quanto de fora.

```bash
$ENGINE exec demo id                                     # quem é o processo?
$ENGINE top demo                                         # o processo, visto do host
$ENGINE image inspect demo:1 --format '{{.Config.User}}' # o que a image declara
```

**Tarefa:** os três concordam que o app roda como UID **10001**, não root.

**Tarefa (bisbilhotada interativa opcional):** obtenha um shell e dê uma olhada, depois saia.

---

### Step 4 — leia as layers, depois invalide o cache

Uma image é uma pilha ordenada de layers. Liste-as, depois mude o código-fonte e observe quais
layers são **reconstruídas** versus quais vêm do **cache**.

```bash
$ENGINE history demo:1
```

**Pergunta:** qual layer guarda seu código-fonte?

Agora mude o código-fonte e refaça o build:

```bash
sed -i.bak 's/hello from/HELLO from/' main.go && rm -f main.go.bak
$ENGINE build -t demo:2 .
```

**Tarefa:** no segundo build, as layers iniciais dizem **CACHED**, mas tudo de `COPY . .`
para baixo é reconstruído.

---

### Step 5 — quebre de propósito: `latest` não é "o mais novo"

Você nunca construiu uma tag `latest`. Peça por uma mesmo assim e leia a falha.

```bash
$ENGINE run --rm demo:latest
```

**Tarefa:** isto falha. Leia o erro, depois conserte de **duas** formas.

**Pergunta:** você acabou de mover `demo:latest` para `demo:2`. Se um colega tivesse `demo:latest`
em cache desde ontem, ele receberia sua image nova?

---

### Step 6 — multi-stage: entregue enxuto

Refaça o build com o Dockerfile multi-stage, que descarta o toolchain, e depois compare os tamanhos.

```bash
$ENGINE build -f Dockerfile.multistage -t demo:slim .
$ENGINE images demo
```

**Tarefa:** a `demo:slim` é dramaticamente menor que a `demo:1`.

**Pergunta:** por que o estágio de builder pode ser enorme sem inflar a image final?

---

## Observe

- `$ENGINE build` produz `demo:1`; o container roda e `curl localhost:8080` responde.
- O processo roda como **UID 10001**, confirmado por dentro (`id`), do host (`top`) e na
  configuração da image (`.Config.User`).
- `history` mostra a image como layers ordenadas; mudar o código-fonte reconstrói **`COPY` e
  abaixo**, enquanto as layers anteriores continuam **CACHED**.
- `run demo:latest` **falha** até você criar a tag ou fazer o pin — provando que `latest` não
  garante nada.
- A multi-stage `demo:slim` é **~40× menor** que a image de estágio único.

---

## Challenge

Prove que o código-fonte está realmente gravado em uma única layer: refaça o build alterando
**apenas** `ENV PORT` e confirme que a layer cara do `go build` é reutilizada.

**Difficulty:** Intermediate

**Success criteria:** Construa a `demo:3`, mostre que o passo `RUN go build` permanece
**CACHED** enquanto apenas a layer de metadata muda, e explique como a ordem do Dockerfile
produziu esse resultado.

**Hints:** Mova a linha `ENV PORT` para depois de `RUN go build`, depois compare as linhas
`COPY` e `RUN` do segundo build com as do primeiro build.

[Spoiler: solução do challenge](./01-containers.solution.md#challenge-solution)

## Verify

Execute estas checagens antes de remover as images. O primeiro comando prova que a image slim é
non-root; o segundo mantém a comparação de layers visível para discussão.

```bash
$ENGINE image inspect demo:slim --format 'user={{.Config.User}} size={{.Size}}'
$ENGINE history demo:slim
```

Esperado: o user é `10001`, e a image final tem apenas as layers de runtime.

## Cleanup / reset

Tudo viveu na pasta `app/` mais algumas images — nenhum cluster foi tocado.

```bash
# pare & remova o container em execução
$ENGINE rm -f demo --force 2>/dev/null || true

# remova as images que este lab construiu (ignore as que não existirem)
$ENGINE rmi -f demo:1 demo:2 demo:slim demo:latest 2>/dev/null || true

# remova os arquivos do projeto
cd .. && rm -rf app
```
