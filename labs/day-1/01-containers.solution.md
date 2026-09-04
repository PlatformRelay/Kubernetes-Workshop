# Lab 01 — Construa & inspecione uma image de container (S01) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ ls
Dockerfile  Dockerfile.multistage  go.mod  main.go
```

Você está agora dentro do diretório `app/`. Todo comando posterior roda a partir daqui.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE build -t demo:1 .
 => [1/5] FROM docker.io/library/golang:1.24 ...
 => [2/5] WORKDIR /src
 => [3/5] COPY . .
 => [4/5] RUN go build -o /bin/app .
 => [5/5] RUN useradd -u 10001 app
 => exporting to image
 => => naming to docker.io/library/demo:1

$ $ENGINE run -d --name demo -p 8080:8080 demo:1
3f9a1c...   # o ID do container

$ $ENGINE ps
CONTAINER ID   IMAGE    COMMAND      STATUS         PORTS                    NAMES
3f9a1c...      demo:1   "/bin/app"   Up 3 seconds   0.0.0.0:8080->8080/tcp   demo

$ curl -s localhost:8080
hello from 3f9a1c1b2d34
```

O hostname da saudação **é o ID do container** — o processo enxerga seu próprio hostname isolado,
um dos namespaces que apareceram nos slides.
</details>

**Pergunta:** você publicou `-p 8080:8080`. Qual número é do host e qual é do container?

<details><summary>Resposta</summary>

`-p HOST:CONTAINER`. O da **esquerda** é a porta da sua máquina, o da **direita** é a porta em que
o processo escuta dentro do container. Aqui elas são iguais só porque escolhemos combiná-las —
tente `-p 9090:8080` e você faria o curl em `localhost:9090`.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE exec demo id
uid=10001(app) gid=10001(app) groups=10001(app)

$ $ENGINE top demo
UID     PID    PPID   C   STIME   TTY   TIME       CMD
10001   1234   1210   0   12:00   ?     00:00:00   /bin/app

$ $ENGINE image inspect demo:1 --format '{{.Config.User}}'
10001
```

O `USER 10001` no Dockerfile é a razão disso. Rodar como um UID non-root é a vitória de segurança
mais barata que existe para uma image — o S02 aprofunda o assunto.
</details>

**Tarefa (bisbilhotada interativa opcional):** obtenha um shell e dê uma olhada, depois saia.

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE exec -it demo sh
$ whoami        # app  — o usuário que o 'useradd' criou na image
$ echo $PORT    # 8080  — embutido pelo ENV
$ exit
```

O valor de `PORT` veio do `ENV` da image, não do seu shell — a configuração viaja **junto com** a
image.
</details>

---

### Step 4 — leia as layers, depois invalide o cache

Uma image é uma pilha ordenada de layers. Liste-as, depois mude o código-fonte e observe quais
layers são **reconstruídas** versus quais vêm do **cache**.

```bash
$ENGINE history demo:1
```

**Pergunta:** qual layer guarda seu código-fonte?

<details><summary>Resposta</summary>

A layer criada pelo **`COPY . .`**. No `history` é aquela cujo tamanho salta para acomodar seus
arquivos; tudo o que o passo `RUN go build` produziu fica na layer **acima** dela. Como as layers
são endereçadas por conteúdo, mudar seu código-fonte muda o digest daquela layer — e o de todas as
layers depois dela.

```console
$ $ENGINE history demo:1
IMAGE     CREATED         CREATED BY                        SIZE
<id>      1 minute ago    ENTRYPOINT ["/bin/app"]           0B
<id>      1 minute ago    USER 10001                        0B
<id>      1 minute ago    RUN useradd -u 10001 app          4.1kB
<id>      1 minute ago    ENV PORT=8080                     0B
<id>      1 minute ago    RUN go build -o /bin/app .        12MB
<id>      1 minute ago    COPY . .                          380B     <-- seu código-fonte
...       (layers da base golang:1.24 abaixo)
```

</details>

Agora mude o código-fonte e refaça o build:

```bash
sed -i.bak 's/hello from/HELLO from/' main.go && rm -f main.go.bak
$ENGINE build -t demo:2 .
```

**Tarefa:** no segundo build, as layers iniciais dizem **CACHED**, mas tudo de `COPY . .`
para baixo é reconstruído.

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE build -t demo:2 .
 => CACHED [1/5] FROM docker.io/library/golang:1.24 ...
 => CACHED [2/5] WORKDIR /src
 => [3/5] COPY . .                      <-- o código-fonte mudou, o cache é invalidado aqui
 => [4/5] RUN go build -o /bin/app .    <-- e tudo depois disso precisa rodar de novo
 => [5/5] RUN useradd -u 10001 app
```

`FROM` e `WORKDIR` não mudaram, então são reaproveitados. No momento em que as entradas de uma
layer mudam, aquela layer **e todas as layers abaixo dela** são reconstruídas. É por isso que
passos baratos e que raramente mudam vêm **cedo** no Dockerfile, e o `COPY` do código-fonte que
muda o tempo todo vem **tarde**.
</details>

---

### Step 5 — quebre de propósito: `latest` não é "o mais novo"

Você nunca construiu uma tag `latest`. Peça por uma mesmo assim e leia a falha.

```bash
$ENGINE run --rm demo:latest
```

**Tarefa:** isto falha. Leia o erro, depois conserte de **duas** formas.

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE run --rm demo:latest
Unable to find image 'demo:latest' locally
docker: Error response from daemon: pull access denied for demo,
repository does not exist or may require 'docker login'.
```

`latest` é só uma **tag** — e é a padrão que o engine assume quando você omite a tag. Você só criou
`demo:1` e `demo:2`, então `demo:latest` não existe localmente; o engine então tenta fazer o
**pull** dela de um registry e falha. `latest` nunca significa "a coisa mais nova que você
construiu".

**Conserto A — aponte a tag para uma image real:**

```console
$ $ENGINE tag demo:2 demo:latest
$ $ENGINE run --rm -p 8080:8080 demo:latest
listening on :8080
```

**Conserto B — não dependa de tag nenhuma; faça o pin pelo digest de conteúdo da image (ID):**

```console
$ $ENGINE inspect --format '{{.Id}}' demo:2
sha256:9b2c...e41
$ $ENGINE run --rm sha256:9b2c...e41
listening on :8080
```

Uma tag pode ser movida para apontar para qualquer lugar; um **digest** sempre nomeia os bytes
exatos que você testou. É essa a diferença que o slide destacou — e é isso que "fazer o pin por
digest" significa em produção.
</details>

**Pergunta:** você acabou de mover `demo:latest` para `demo:2`. Se um colega tivesse `demo:latest`
em cache desde ontem, ele receberia sua image nova?

<details><summary>Resposta</summary>

Não automaticamente — o `latest` local dele continua apontando para o digest que ele baixou ontem
até que ele refaça o pull explicitamente. Duas máquinas podem guardar **images diferentes sob a
mesma tag `latest`**. É exatamente essa ambiguidade que torna as tags pouco confiáveis para
qualquer coisa que você precise reproduzir.
</details>

---

### Step 6 — multi-stage: entregue enxuto

Refaça o build com o Dockerfile multi-stage, que descarta o toolchain, e depois compare os tamanhos.

```bash
$ENGINE build -f Dockerfile.multistage -t demo:slim .
$ENGINE images demo
```

**Tarefa:** a `demo:slim` é dramaticamente menor que a `demo:1`.

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE images demo
REPOSITORY   TAG    IMAGE ID      SIZE
demo         slim   a1b2c3...     ~18MB
demo         2      d4e5f6...     ~830MB
demo         1      d4e5f6...     ~830MB
demo         latest d4e5f6...     ~830MB
```

A image de estágio único carrega o **toolchain Go inteiro**; a image multi-stage entrega apenas o
binário compilado sobre uma base `alpine` minúscula — cerca de **40× menor**. Images menores fazem
pull mais rápido e expõem muito menos a ataques. O S02 vai um passo além, com bases **distroless**
(menores ainda, e sem shell nenhum).
</details>

**Pergunta:** por que o estágio de builder pode ser enorme sem inflar a image final?

<details><summary>Resposta</summary>

Porque só o que você faz `COPY --from=build` é mantido — o estágio de builder (compilador,
código-fonte, caches, quaisquer secrets de build) é **jogado fora**. A image final começa a partir
de um `FROM` novo e não herda nada do builder além dos arquivos que você copia explicitamente.
</details>

---

## Expected state / output

- `$ENGINE build` produz `demo:1`; o container roda e `curl localhost:8080` responde.
- O processo roda como **UID 10001**, confirmado por dentro (`id`), do host (`top`) e na
  configuração da image (`.Config.User`).
- `history` mostra a image como layers ordenadas; mudar o código-fonte reconstrói **`COPY` e
  abaixo**, enquanto as layers anteriores continuam **CACHED**.
- `run demo:latest` **falha** até você criar a tag ou fazer o pin — provando que `latest` não
  garante nada.
- A multi-stage `demo:slim` é **~40× menor** que a image de estágio único.

---

## Explanation

O lab separa a identidade da image, a identidade de runtime e o comportamento do cache de build.
Tags são nomes móveis, enquanto o digest de uma image identifica bytes exatos. Um build
multi-stage descarta o compilador e o código-fonte, e o Docker reutiliza apenas as layers cujas
entradas e cujas layers anteriores permanecem inalteradas — é essa a causa de um `COPY` alterado
reconstruir tudo o que vem depois dele.

## Troubleshooting and recovery

Se uma porta estiver ocupada, remova apenas o container nomeado deste lab com
`$ENGINE rm -f demo` e repita o comando de run. Se um build falhar depois de uma edição, restaure
o `main.go` e os Dockerfiles fixados executando de novo os heredocs do Step 1.

## Challenge solution

### Commands / manifest

```console
$ sed -i.bak 's/ENV PORT=8080/ENV PORT=9090/' Dockerfile && rm -f Dockerfile.bak
$ $ENGINE build -t demo:3 .
 => CACHED [3/5] COPY . .
 => CACHED [4/5] RUN go build -o /bin/app .    <-- o passo caro foi reutilizado!
 => [5/5] ...ENV/USER reaplicados
```

### Expected state / output

O segundo build reporta o `COPY` do código-fonte e o caro `RUN go build` como `CACHED`. Só a
layer barata de metadata abaixo deles muda. Restaure o Dockerfile original com o heredoc do
Step 1 depois de registrar o resultado.

### Explanation

O Docker invalida uma layer e todas as layers abaixo dela. Mover a metadata que muda com
frequência para baixo do passo lento de build preserva o cache de build — essa é a causa de o
binário resultante da aplicação continuar o mesmo.

### Hints

Mova a linha `ENV PORT` para depois de `RUN go build`, depois compare as linhas
`COPY` e `RUN` do segundo build com as do primeiro build.
