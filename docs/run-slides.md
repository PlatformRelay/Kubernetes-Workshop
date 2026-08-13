# Rode os slides localmente

Visualize os decks interativos do Slidev no seu laptop com Node.js. Este caminho **não**
precisa de um cluster Kubernetes — ele apenas serve a apresentação.

O repositório está travado no **pnpm** (`packageManager` no `package.json` + `pnpm-lock.yaml`).
Use os comandos abaixo exatamente como estão escritos. `npm install` puro não é suportado
(não existe `package-lock.json`).

## Pré-requisitos

- **Node.js 22** (LTS) — [nodejs.org](https://nodejs.org/) ou um gerenciador de versões
- **Corepack** (vem com o Node 16.13+) para ativar o pnpm pinado
- Opcional: um navegador moderno (Chrome, Firefox, Safari, Edge)

Confira as versões:

```bash
node -v    # expect v22.x
corepack -v
```

### Ou: deixe o mise pinar a toolchain para você

A toolchain do deck é pinada e tem checksums em `mise.facilitator.toml`, mantida
**separada da toolchain do participante** em `mise.toml`. `./workshop up` instala apenas
as ferramentas do participante — ninguém que assiste ao workshop precisa de Node para
rodar um lab — então as ferramentas do deck ficam atrás de um config environment e do seu
próprio `mise.facilitator.lock`:

```bash
MISE_ENV=facilitator mise install --locked
```

Defina `MISE_ENV=facilitator` no seu shell (ou em um `.envrc` fora do versionamento) para
mantê-lo ativo enquanto trabalha no deck. Depois de um bump de versão, refaça o lock a
partir do mesmo ambiente com `MISE_ENV=facilitator mise lock`.

> **Apple Silicon e Intel:** o pnpm 11 não publica build para Mac Intel (`darwin-x64`),
> então `--locked` não consegue resolver o pnpm em um Mac Intel. Use o caminho com
> corepack abaixo nesse caso.

## Instale as dependências

A partir da raiz do repositório:

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
```

## Inicie o servidor de desenvolvimento

Escolha o deck que você quer:

```bash
# Interactive menu (day / section / range) when gum is available
pnpm dev

# Or open a specific deck directly
pnpm dev:day1        # Day 1 live entry
pnpm dev:day2        # Day 2 live entry
pnpm dev:day3        # Day 3 live entry
pnpm dev:3day        # Canonical three-day cut (compatibility entry)
pnpm dev:superset    # Full content superset
pnpm dev:optional    # Optional / Appendix
pnpm dev:templates   # Theme / template gallery
```

### Launcher do facilitador e a ferramenta de GitOps do S21

Para uma seleção pontual do facilitador (dia, seção ou intervalo), use `pnpm deck` com um
seletor explícito. Shells não interativos precisam passar o seletor na linha de comando;
o menu do gum é progressive enhancement quando há um TTY e o gum está disponível.

O S21 vem como uma chave de duas posições — **Argo CD** (default) ou **Flux**. Exatamente
uma ferramenta por entrega; não existe modo "ambos" nem superfície de plug-in para uma
terceira ferramenta.

```bash
# Default GitOps tool is Argo CD (byte-identical to the committed day decks)
pnpm deck -- --day 3 --dry-run

# Select the Flux variant for S21 (requires pages/S21-gitops-flux/ — US-GITOPS-CHOICE-B)
pnpm deck -- --day 3 --gitops flux --dry-run

# Regenerate / check committed decks for a chosen tool (default: argocd)
pnpm decks:generate
pnpm decks:check
pnpm decks:generate -- --gitops flux   # fails clearly until the Flux section exists
```

O Slidev imprime uma URL local — tipicamente:

```text
http://localhost:3030/
```

Abra essa URL no seu navegador. Use as setas do teclado ou os controles na tela para
navegar entre os slides. O modo apresentador fica disponível na UI do Slidev
(normalmente em `http://localhost:3030/presenter/`).

Pare o servidor com `Ctrl+C`.

## Build de produção e preview local

Faça o build de SPAs estáticas (útil antes de mexer na configuração do GitHub Pages):

```bash
# Live day entries (default `pnpm build`)
pnpm build

# Compatibility / gallery entries used on Pages under /deck/
pnpm exec slidev build slides.md --base /deck/ --out dist-deck --router-mode hash
pnpm exec slidev build slides-3day.md --base /deck/3day/ --out dist-deck-3day --router-mode hash
```

Sirva uma pasta buildada com qualquer servidor de arquivos estáticos, por exemplo:

```bash
pnpm dlx serve dist-deck
```

Para o layout **exato** do GitHub Pages (landing em MkDocs + decks sob `/deck/`), use o
workflow do Pages localmente:

```bash
pnpm pages:build
pnpm pages:preview   # serves ./site at http://localhost:4173
```

`pages:build` espera a stack Python do MkDocs de [`requirements-docs.txt`](./requirements-docs.txt):

```bash
python3 -m pip install -r docs/requirements-docs.txt
pnpm pages:build
```

## Relacionados

- Ambiente de cluster/labs (kind): [setup.md](./setup.md)
- Decks ao vivo no Pages e releases em PDF: [downloads.md](./downloads.md)
- Protótipo de quiz (scripts Node, não Slidev): [quiz/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/quiz/README.md)
