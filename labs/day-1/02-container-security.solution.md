# Lab 02 — Escaneie & endureça uma image de container (S02) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ ls
Dockerfile.hardened  Dockerfile.insecure  Dockerfile.secret-rm  deploy_key  go.mod  main.go
```

Você está agora dentro de `app/`. Todo comando posterior roda a partir daqui. O `deploy_key` é
falso — ele só carrega o marcador `DEPLOY-SECRET-DO-NOT-SHIP-abc123` para você poder dar grep nele.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE image inspect demo:insecure --format 'user=[{{.Config.User}}]'
user=[]                 # nenhum USER definido → o container roda como root (UID 0)

$ trivy image --severity HIGH,CRITICAL demo:insecure
usr/bin/app (gobinary)
Total: 12 (HIGH: 12, CRITICAL: 0)

usr/local/go/bin/go (gobinary)
Total: 12 (HIGH: 12, CRITICAL: 0)

... binários adicionais de compilador e toolchain ...
```

Este trecho vem do replay real de 2026-08-03 com o Trivy 0.73.0. Seus achados vão diferir conforme
os bancos de dados e as tags mutáveis de base se movem. Registre tanto os totais quanto os binários
afetados: a image gorda mantém o toolchain Go completo em produção.

> Usa Grype? `grype demo:insecure` imprime uma tabela equivalente; filtre com `grype demo:insecure -o table | grep -E 'High|Critical'`.
</details>

**Pergunta:** você escreveu um app Go minúsculo. Por que o scanner inspeciona tantos binários e
pacotes de SO que seu runtime nunca chama?

<details><summary>Resposta</summary>

Porque uma image é o seu app **mais toda a base dele**. A `golang:1.24` é um userland Debian
completo e ainda contém o compilador, o formatador e as ferramentas de build. O Trivy inventaria
todos eles. Encolher a base de runtime elimina categorias inteiras de software desnecessário, mas
não conserta uma standard library vulnerável já compilada dentro do seu app.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE image inspect demo:hardened --format 'user=[{{.Config.User}}]'
user=[65532:65532]

$ $ENGINE images demo
REPOSITORY   TAG        IMAGE ID       SIZE
demo         hardened   a1b2c3...      ~9MB
demo         insecure   d4e5f6...      ~860MB

$ trivy image --severity HIGH,CRITICAL demo:hardened
usr/bin/app (gobinary)
Total: 12 (HIGH: 12, CRITICAL: 0)
```

Três consertos, que se somam:

- **Multi-stage** — o toolchain fica no estágio `build` e é descartado (~860 MB → ~9 MB).
- **Base distroless static** — não sobra gerenciador de pacotes, shell, compilador nem utilitários de build.
- **`USER 65532` non-root** — uma fuga deste container cai em um UID sem privilégios, e não em root.

Este é o mesmo replay de 2026-08-03. A aplicação foi compilada com a mesma stdlib do Go vulnerável,
então os doze achados dela permanecem. A melhoria é ter um único binário de aplicação afetado, em
vez dos mesmos achados repetidos em vários binários de build entregues. Refaça o build com uma
release corrigida do Go para eliminá-los.
</details>

**Pergunta:** tente abrir um shell na image endurecida: `$ENGINE run --rm -it demo:hardened sh`.
Por que isso falha — e por que isso é uma coisa **boa**?

<details><summary>Resposta</summary>

```console
$ $ENGINE run --rm -it demo:hardened sh
docker: Error response from daemon: exec: "sh": executable file not found in $PATH
```

A `distroless/static` não entrega **shell nenhum e nenhum gerenciador de pacotes** — não há `sh`,
não há `apt`, não há `curl`. Isso é um recurso: se um atacante conseguir execução de código dentro
do container, ele não tem ferramenta nenhuma para pivotar. Também significa que você debuga images
distroless de fora (`kubectl debug`, ephemeral containers) em vez de entrar por shell — um hábito
em que o S25 se apoia.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ trivy image --format cyclonedx --output sbom.json demo:hardened
$ grep -o '"name":"[^"]*"' sbom.json | head
"name":"demo:hardened"
"name":"base-files"
"name":"tzdata"
"name":"stdlib"
```

`stdlib` é a standard library do Go contra a qual seu binário foi construído — o SBOM registra a
**versão exata** dela, então, se um CVE da stdlib do Go for anunciado, você responde "estamos
afetados?" dando grep neste arquivo. Formatos: **CycloneDX** (usado aqui) e **SPDX** são os dois
padrões abertos; auditores e ferramentas de policy consomem qualquer um dos dois.

> Prefere o Syft? `syft demo:hardened -o cyclonedx-json > sbom.json` produz um documento equivalente.
</details>

**Pergunta:** por que manter um SBOM se você pode simplesmente reescanear a image quando quiser?

<details><summary>Resposta</summary>

Reescanear exige a image **e** um scanner funcionando **e** um banco atualizado, rodando contra
cada image que você já entregou — lento, e impossível quando uma image some do seu registry. Um
SBOM é um artefato de texto pequeno que você guarda ao lado do build. Quando o
`CVE-2025-xxxx na libfoo` estourar, você dá `grep libfoo` em milhares de SBOMs guardados em segundos
para descobrir exatamente quais releases estão afetadas — sem images, sem scanner, sem rebuild.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE run --rm demo:secret-rm ls /src/deploy_key
ls: cannot access '/src/deploy_key': No such file or directory

$ $ENGINE history --no-trunc demo:secret-rm | grep -i deploy_key
<id>  2 minutes ago  COPY deploy_key /src/deploy_key # buildkit   77B
```

O filesystem final não mostra o arquivo — a layer do `RUN rm` registra um **whiteout** que o
esconde. Mas as layers são **append-only**: a layer anterior do `COPY deploy_key`, com secret e
tudo, continua fazendo parte da image.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ find /tmp/dig -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
    | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" | head -1
DEPLOY-SECRET-DO-NOT-SHIP-abc123
```

Qualquer um que consiga fazer pull da image consegue fazer exatamente isto. **Deletar um arquivo em
uma layer posterior não o remove da image** — os bytes vivem para sempre na layer que os adicionou.
Os únicos consertos de verdade são nunca colocar o secret em uma layer entregue: um **secret mount**
de build-time (o que o `Dockerfile.hardened` faz) ou copiá-lo apenas para um **estágio de build
descartado**.
</details>

Agora prove que a image endurecida está limpa — mesma recuperação, nenhum acerto:

```bash
mkdir -p /tmp/dig2 && $ENGINE save demo:hardened | tar -x -C /tmp/dig2
find /tmp/dig2 -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" || echo "NOT FOUND — clean"
```

<details><summary>Solução / saída esperada</summary>

```console
$ find /tmp/dig2 -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
    | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" || echo "NOT FOUND — clean"
NOT FOUND — clean
```

(O `grep` sai com código diferente de zero quando não encontra nada, então o `|| echo` dispara. Não
mande o `grep` final por um `head` — isso engoliria o exit code do grep e a mensagem nunca seria
impressa.)

O secret foi montado em `/run/secrets/deploy_key` **apenas durante o `RUN`** do estágio de build —
ele nunca foi escrito em uma layer, e o próprio estágio de build é descartado. A image entregue não
tem rastro nenhum dele.
</details>

**Pergunta:** você entregou `demo:secret-rm` a um registry por acidente na semana passada e hoje a
reconstruiu "limpa". O secret está seguro agora?

<details><summary>Resposta</summary>

Não. Considere-o **comprometido e obrigatoriamente rotacionado.** Quem baixou a image antiga ainda
tem a layer com a chave, e registries podem reter digests antigos. Reconstruir hoje não despublica
os bytes de ontem. A única resposta segura para um secret que um dia tocou uma layer entregue é
**revogá-lo e rotacioná-lo**, e só então reconstruir sem ele.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ cosign verify --key cosign.pub --allow-insecure-registry localhost:5000/demo:hardened
Verification for localhost:5000/demo:hardened --
The following checks were performed on the signatures:
  - The signatures were verified against the specified public key
[{"critical":{"identity":{...},"image":{"docker-manifest-digest":"sha256:..."}}}]

# adulteração: sobrescreva a tag com a image insegura e verifique de novo
$ $ENGINE tag demo:insecure localhost:5000/demo:hardened
$ $ENGINE push localhost:5000/demo:hardened
$ cosign verify --key cosign.pub localhost:5000/demo:hardened
Error: no matching signatures:
...
```

A assinatura está atrelada ao **digest** da image, não à tag dela. Mova a tag para bytes diferentes
e a assinatura deixa de casar — o `verify` falha fechado. No S17/S25 um **admission controller**
roda esse mesmo `verify` no momento do deploy e recusa images não assinadas ou adulteradas.
</details>

**Pergunta (sem precisar de ferramenta):** a assinatura cobre o digest, não a tag. Por que isso importa?

<details><summary>Resposta</summary>

Porque tags são mutáveis — a `demo:hardened` pode ser reapontada para quaisquer bytes a qualquer
momento. Uma assinatura sobre o **digest** fixa a confiança no conteúdo exato: se um único byte
muda, o digest muda, e a assinatura antiga para de casar. É por isso que todo passo confiável de
supply chain (assinar, atestar, admitir, fazer deploy) se apoia no digest, nunca na tag.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ $ENGINE image inspect demo:hardened --format '{{.Id}}'
sha256:5759d19f...e41
```

Rodar por esse digest inicia a image **exata** que você construiu e escaneou — sem consulta de tag,
sem ambiguidade. Em produção você faz o pin do digest do **registry**, que você lê em `RepoDigests`
depois de um push:

```console
$ $ENGINE image inspect demo:hardened --format '{{index .RepoDigests 0}}'
localhost:5000/demo@sha256:...
```

e faz o deploy de `image: localhost:5000/demo@sha256:...` na spec do seu Pod. Isso garante que todo
node baixe os bytes que você testou — a reprodutibilidade que uma tag flutuante nunca pode prometer.
</details>

**Pergunta:** se você fizer o pin por digest no seu Deployment, o que você perde em comparação com
`image: demo:1.4`?

<details><summary>Resposta</summary>

A adoção automática de novos pushes. Com uma tag, refazer o push de `demo:1.4` e reiniciar os Pods
baixa a image nova; com um digest, a referência fica congelada até que **você** a mude. É essa a
troca: digests compram reprodutibilidade e integridade ao custo de um passo explícito de
atualização — que é exatamente o que você quer para qualquer coisa que precise auditar ou reverter
com precisão. (O GitOps do S21 automatiza a atualização do digest fixado.)
</details>

---

## Expected state / output

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

## Explanation

Builds multi-stage, runtimes distroless, usuários non-root, SBOMs e pin por digest reduzem riscos
diferentes; nenhum deles prova que uma image está livre de vulnerabilidades. Deletar um arquivo em
uma layer posterior adiciona um whiteout, mas deixa os bytes da layer anterior recuperáveis — é
essa a causa de um secret "removido" continuar vazando, enquanto um secret mount do BuildKit nunca
grava o secret em uma layer.

## Troubleshooting and recovery

Se o BuildKit recusar o `--secret`, confirme que seu engine suporta BuildKit e execute de novo
`$ENGINE build -f Dockerfile.hardened --secret id=deploy_key,src=deploy_key -t demo:hardened .`.
Se a assinatura opcional deixar um registry para trás, delete-o com
`$ENGINE rm -f lab-registry`; nunca faça prune de images ou volumes não relacionados.

## Challenge solution

### Commands / manifest

Crie uma segunda variante de runtime que copia apenas a aplicação estática e o CA bundle do mesmo
estágio de builder:

```bash
cat > Dockerfile.scratch <<'EOF'
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/app .

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /bin/app /bin/app
ENV PORT=8080
USER 65532:65532
ENTRYPOINT ["/bin/app"]
EOF

sed 's|FROM gcr.io/distroless/static:nonroot|FROM gcr.io/distroless/static-debian12:nonroot|' \
  Dockerfile.hardened > Dockerfile.distroless
$ENGINE build -f Dockerfile.distroless --secret id=deploy_key,src=deploy_key \
  -t demo:distroless .
$ENGINE build -f Dockerfile.scratch -t demo:scratch .

trivy image --severity HIGH,CRITICAL demo:distroless
trivy image --severity HIGH,CRITICAL demo:scratch
trivy image --format cyclonedx --output sbom-distroless.json demo:distroless
trivy image --format cyclonedx --output sbom-scratch.json demo:scratch

$ENGINE image inspect demo:distroless --format '{{.Size}} {{.Config.User}}'
$ENGINE image inspect demo:scratch --format '{{.Size}} {{.Config.User}}'

DISTROLESS_DIGEST=$($ENGINE image inspect demo:distroless --format '{{.Id}}')
SCRATCH_DIGEST=$($ENGINE image inspect demo:scratch --format '{{.Id}}')
$ENGINE run -d --name demo-distroless -p 18081:8080 "$DISTROLESS_DIGEST"
$ENGINE run -d --name demo-scratch -p 18082:8080 "$SCRATCH_DIGEST"
curl -fsS http://127.0.0.1:18081/
curl -fsS http://127.0.0.1:18082/
$ENGINE rm -f demo-distroless demo-scratch
```

### Expected state / output

Os dois containers respondem HTTP e rodam como UID/GID `65532`. A image scratch e o SBOM CycloneDX
dela são menores, enquanto os achados do binário da aplicação continuam comparáveis. As contagens
exatas de vulnerabilidades dependem do banco de dados atual; registre-as e compare-as em vez de
esperar zero.

### Explanation

O `scratch` remove os arquivos de SO de runtime, mas não remove as vulnerabilidades compiladas
dentro do binário Go — é essa a causa de os achados da aplicação permanecerem. Copiar o CA bundle
dá suporte a HTTPS de saída; uma aplicação que precise de dados de timezone, de resolução de
nome-para-usuário ou de outros arquivos de runtime precisa copiá-los deliberadamente. Esta demo
serve apenas HTTP, então a necessidade do CA é inferida da comparação de filesystems, e não provada
pela requisição dela.

### Hints

Reutilize o estágio de builder existente; copie o binário e o CA bundle para o
scratch, depois compare `trivy image`, o SBOM CycloneDX e os resultados HTTP de runtime lado a lado.
