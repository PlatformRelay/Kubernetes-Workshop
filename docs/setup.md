# Setup do participante — o ambiente de labs local (kind)

Este guia leva você de um laptop zerado até um cluster Kubernetes funcionando e
pronto para os labs com **um comando**: `./workshop up`. Ele cobre a escolha do
container engine (incluindo a nota de licenciamento do Docker Desktop), a
instalação da toolchain pinada, o caminho Windows/WSL2 e a resolução de problemas.

> **Prefere um cluster compartilhado?** Se o seu facilitador entregou um kubeconfig
> e um namespace atribuído, você **não** precisa de nada disto — pule direto para
> [`../labs/day-1/00-setup.md`](../labs/day-1/00-setup.md) e siga o caminho de
> *namespace*. Este guia é apenas para o ambiente **local com kind**.

## O que você ganha

`./workshop up` executa, nesta ordem:

1. **Preflight** — detecta o seu OS/arch, encontra um container engine em execução
   (Docker e, em seguida, Podman) e faz uma checagem de sanidade de CPUs/RAM
   (apenas warnings).
2. **Tools** — instala uma toolchain pinada com [mise](https://mise.jdx.dev)
   (kubectl, kind, helm, k9s, jq, yq, gum), verificada contra checksums reais em
   `mise.lock`.
3. **Cluster** — cria um cluster [kind](https://kind.sigs.k8s.io) de node único
   chamado `workshop`, usando a node image pinada por digest em
   `infra/versions.env`.
4. **Doctor** — executa `./workshop doctor` para confirmar que o cluster responde,
   que os nodes estão Ready e que um Pod de smoke roda e é removido.

Quando terminar em verde, comece os labs em
[`../labs/day-1/00-setup.md`](../labs/day-1/00-setup.md).

## Passo 1 — escolha e inicie um container engine

O kind roda nodes Kubernetes como containers, então você precisa de um container
engine com um daemon/máquina em execução. Escolha um:

| Engine | Plataformas | Notas |
| --- | --- | --- |
| **Docker Desktop** | macOS, Windows, Linux | O mais fácil, mas veja a nota de licenciamento abaixo. |
| **Podman Desktop** | macOS, Windows, Linux | CNCF, Apache-2.0. Suporte de primeira classe ao kind. No Windows a máquina precisa ser **rootful** para o kind. |
| **colima** | macOS, Linux | CLI leve (`colima start`); combina com o Docker CLI. |
| **Rancher Desktop** | macOS, Windows, Linux | Funciona, mas **desative o Kubernetes embutido** para ele não brigar com o kind. |

> **Nota de licenciamento do Docker Desktop.** O Docker Desktop é gratuito para uso
> pessoal, educação e **pequenas empresas** — mas uma assinatura paga é necessária
> para uso profissional em organizações maiores (conforme os termos da Docker:
> **250+ funcionários OU mais de US$ 10M de receita anual**). Se isso descreve o seu
> empregador, use **Podman Desktop** (CNCF, Apache-2.0) ou **colima** no lugar —
> ambos funcionam com o kind e com este workshop. Nada nos labs depende
> especificamente do Docker.

Inicie o seu engine antes de continuar:

- Docker Desktop / Rancher Desktop / Podman Desktop: abra o aplicativo.
- colima: `colima start --cpu 4 --memory 8`
- Podman (CLI): `podman machine init && podman machine start` (no Windows, deixe-a
  rootful: `podman machine set --rootful`).

O bootstrap sonda o **Docker primeiro, depois o Podman**, e imprime um erro útil
se nenhum dos dois estiver acessível.

## Passo 2 — obtenha o repositório e execute

```bash
git clone <this-repo-url> kubernetes-workshop
cd kubernetes-workshop
./workshop up
```

É isso. A primeira execução baixa as ferramentas pinadas e a node image do kind,
então reserve alguns minutos no Wi-Fi de conferência. As execuções seguintes são
quase instantâneas.

O bootstrap invoca as ferramentas recém-instaladas através do mise imediatamente,
então a criação do cluster não exige reiniciar o shell. Um processo, porém, não
consegue atualizar o shell que o lançou. Se o `kubectl` ainda não estava no seu
`PATH`, o bootstrap bem-sucedido imprime o único comando `eval "$(mise activate …)"`
a executar antes de copiar os comandos dos labs para esse mesmo terminal.

Você **não** precisa instalar o mise por conta própria — `./workshop up` o instala
se estiver faltando (de forma interativa). Se preferir instalá-lo de antemão,
qualquer uma destas opções funciona e é detectada automaticamente:

```bash
# macOS / Linux
brew install mise            # Homebrew
curl https://mise.run | sh   # official installer; bytes are not checksum-pinned here

# Windows participants run Linux tools inside WSL2 — see Step 3
curl https://mise.run | sh
```

O comando do instalador do mise acima é um risco temporário explicitamente aceito:
os bytes que ele baixa não são pinados por checksum neste repositório. Uma vez que o
mise esteja presente, as ferramentas do participante são uma fronteira de confiança
separada: suas versões pinadas ficam em `mise.toml` e os checksums dos artefatos
ficam em `mise.lock`. Participantes que preferirem instalar as ferramentas na mão
podem ler as versões exatas nesses arquivos — o lockfile *é* a documentação.

## Passo 3 — Windows: use WSL2 (suporte parcial)

O PowerShell nativo do Windows **não é suportado** (o kind e o bootstrap esperam um
userland Linux). O caminho pretendido no Windows é o **WSL2**. Em um PowerShell
elevado, uma única vez:

```powershell
wsl --install
wsl --update
wsl --set-default-version 2
wsl --list --verbose
```

Reinicie se solicitado, abra a sua distro WSL2 (por exemplo, Ubuntu) e então execute
`./workshop up` **de dentro do WSL2**. Se você executá-lo pelo PowerShell por engano,
o bootstrap detecta isso e imprime estes mesmos comandos.

Esta rota é testada por contrato, mas ainda não completou sua rodada de aceitação ao
vivo no WSL2. Não a apresente como oficialmente suportada ainda. A tupla mínima
provisória e o release gate estão em [`windows-wsl2.md`](./windows-wsl2.md).

Escolha de engine no WSL2:

- **Docker Desktop** com o *backend WSL2* habilitado (Settings → Resources →
  WSL integration) — sujeito à nota de licenciamento acima.
- **Podman** dentro do WSL2 — lembre-se de que a máquina precisa ser **rootful**
  para o kind (`podman machine set --rootful`).

Clone o repositório dentro do filesystem Linux do WSL2 (por exemplo, `~/src`), e não
sob `/mnt/c`: arquivos montados do Windows são mais lentos e podem não preservar o
comportamento do bit de execução que os scripts esperam. O bootstrap diagnostica esse
layout, quebras de linha CRLF, bits de execução ausentes e um socket de integração do
Docker Desktop indisponível, com passos de recuperação direcionados.

Para requisitos de virtualização e recursos, orientações de proxy/VPN, dispositivos
gerenciados e a checklist de validação ao vivo, veja o guia dedicado
[`windows-wsl2.md`](./windows-wsl2.md).

> **Dispositivo gerenciado?** Participantes que não conseguem instalar ou rodar
> containers locais podem usar um kubeconfig fornecido pelo facilitador e um
> namespace atribuído na nuvem. Isso evita o kind e o acesso de administrador local,
> mas por enquanto ainda exige um terminal com `kubectl`. Um shell apenas no
> navegador é trabalho futuro (US-ENV-6).

## Passo 4 — uso no dia a dia

```bash
./workshop doctor   # is my machine still lab-ready?
./workshop up       # (idempotent) bring the cluster back if it's gone
./workshop down     # delete the cluster (asks to confirm)
```

`./workshop doctor` também é a primeira tarefa do Lab 00, então "minha máquina está
pronta?" é um passo de lab, não uma fila de suporte.

### Não interativo / CI

Todo passo também roda sem prompts. Defina `WORKSHOP_NONINTERACTIVE=1` (ou execute
sob `CI=true`, ou sem TTY) e defaults sensatos são assumidos — este é exatamente o
caminho que a CI executa, então o script que você roda localmente é o script que é
testado. Use `./workshop down --yes` (ou `-y`) para pular a confirmação de teardown
em scripts.

## Profiles de roteamento (Envoy vs Contour)

Ingress (S08) e Gateway API (S09) precisam de controllers **diferentes** que querem,
os dois, as host ports 80/443. O workshop portanto expõe dois profiles
**mutuamente exclusivos**:

| Profile | Comando | Lab | Notas |
| --- | --- | --- | --- |
| `gateway-envoy` (canônico) | `./workshop profile gateway-envoy` | S09 | Gateway API CRDs + Envoy Gateway; GatewayClass `eg` |
| `ingress-contour` (opcional) | `./workshop profile ingress-contour` | S08 | Contour Ingress controller; IngressClass `contour` |

O preflight se recusa a instalar um enquanto o outro (ou um controller estranho)
estiver presente, e imprime uma remediação. Para trocar:
`./workshop profile transition gateway-envoy` (ou `make profile-transition TO=gateway-envoy`).
O teardown remove apenas recursos pertencentes ao workshop e **preserva** os
Gateway API CRDs compartilhados.

Os manifestos precisam nomear a class explicitamente (`gatewayClassName: eg` /
`ingressClassName: …`) — nunca conte com um default acidental do cluster.

## Troubleshooting

| Sintoma | Correção |
| --- | --- |
| `no reachable container engine` | Inicie o Docker Desktop / `colima start` / `podman machine start`. No WSL2, habilite a integração do Docker Desktop para a distribuição e verifique `docker info`. No Podman para Windows, deixe a máquina rootful. |
| `native Windows (PowerShell) is not supported` | Você não está no WSL2. Abra a sua distro WSL2 e execute novamente de lá (Passo 3). |
| `repository is on a mounted Windows drive` | Clone novamente sob `~/src`, no filesystem Linux do WSL2. |
| `CRLF line endings` / `not executable` | Siga o comando de reparo impresso por `./workshop`; veja a [tabela de troubleshooting do WSL2](./windows-wsl2.md#troubleshooting). |
| `mise is required but not installed` (não interativo) | Instale o mise no ambiente Linux/macOS atual (`brew install mise` ou `curl https://mise.run \| sh`) e execute novamente. Participantes no Windows precisam fazer isso dentro do WSL2. |
| `kubectl: command not found` depois de um bootstrap verde | Execute o comando `mise activate` impresso por `./workshop up` no shell atual. Você não precisa recriar o cluster. |
| O cluster kind não é criado / está inacessível | Reset de pânico: `./workshop down` e depois `./workshop up` (equivalente a `make kind-down && make kind-up`). |
| Lento / travando nos downloads | Wi-Fi de conferência. O cache de ferramentas e a node image são baixados apenas uma vez; tente de novo — o mise retoma. |
| `doctor` reporta um WARN de versão | Seu kubectl/kind local difere do pin. É um warning, não uma falha; `./workshop` usa o ambiente pinado do mise. Ative o mise como descrito acima para comandos manuais. |

Se `./workshop up` terminar verde mas um lab posterior se comportar mal, execute
`./workshop doctor` primeiro — ele revalida o cluster e imprime uma dica direcionada
por falha.

## Por baixo do capô

- **Versões** são pinadas em um único lugar, `infra/versions.env` (kind + kubectl +
  digest da node image), e espelhadas em `mise.toml`; os checksums ficam em
  `mise.lock`.
- **`./workshop`** é um wrapper fino sobre `infra/bootstrap.sh`, que orquestra peças
  existentes e testadas — o cluster é criado por `make kind-up` e a saúde é o
  `infra/doctor.sh`. Nada é reimplementado.
- **gum** fornece os prompts/spinners bonitos quando você roda de forma interativa;
  é puro açúcar e nunca obrigatório.

Veja [`../labs/README.md`](../labs/README.md) para a lista completa de ferramentas e
a alternativa de cluster compartilhado.
