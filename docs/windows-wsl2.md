# Setup do participante no Windows com WSL2

A rota Windows do workshop é o **WSL2**, usando uma distribuição Linux e um
container engine acessível a partir dessa distribuição. Essa rota está atualmente
**parcial: testada por contrato, com o smoke ao vivo pendente**. Ela não deve ser
anunciada como oficialmente suportada até que o gate de aceitação ao vivo abaixo
passe. PowerShell nativo,
Prompt de Comando, Git Bash, MSYS2 e WSL1 não são ambientes de execução suportados
para o `./workshop` nem para os labs.

Se a política da empresa impede instalações locais, privilégios de administrador ou
acesso a container engine, use o [namespace atribuído na nuvem](#rota-para-dispositivos-gerenciados)
em vez disso. Não tente contornar a política do dispositivo.

## Topologia recomendada

```text
Windows host
├── WSL2 Linux distribution
│   ├── workshop repository under ~/src
│   ├── bash, git, mise, kubectl and kind
│   └── docker CLI ───────────────┐
└── Docker Desktop               │
    └── WSL integration socket ◀─┘
```

O bootstrap consegue selecionar o Podman, mas o primeiro alvo de aceitação no
Windows é o Docker Desktop com WSL integration. Trate o Podman no Windows como
experimental até que ele tenha sua própria linha de smoke ao vivo. Verifique os
termos de licença do Docker Desktop antes de usá-lo para trabalho.

## Política de suporte a versões

A tupla mínima provisória para a primeira aceitação ao vivo é:

| Componente | Mínimo provisório |
| --- | --- |
| Windows | Windows 11 23H2, build 22631 |
| Pacote WSL | 2.1.5, com a distribuição rodando como geração 2 |
| Distribuição Linux | Ubuntu 24.04 LTS |
| Docker Desktop | 4.44.0 com o backend WSL2 e a integração por distribuição habilitada |
| Recursos do workshop | 4 CPUs e 8 GiB de RAM disponíveis para WSL2/containers |

Esses são pisos de política do workshop, não a afirmação de que toda combinação mais
nova já foi exercitada. Os pisos de Windows e WSL estão alinhados aos
[requisitos de instalação no Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
atuais da Docker. Use `wsl --version`, `wsl --status` e `wsl --list --verbose`
conforme documentado na
[referência de comandos do WSL da Microsoft](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

Nenhuma tupla ao vivo passou ainda. O primeiro registro de aceitação bem-sucedida
precisa declarar o build exato do Windows, o WSL/kernel, a distribuição, a
arquitetura, o engine e o commit do workshop. Essa tupla se torna a baseline testada;
elevar um mínimo depois exige outro smoke registrado. Testes stubbed estabelecem
apenas o contrato de diagnóstico.

## Setup único do host

1. Em um PowerShell elevado, instale o WSL e torne a versão 2 o default:

   ```powershell
   wsl --install
   wsl --update
   wsl --set-default-version 2
   wsl --version
   wsl --list --verbose
   ```

   Confirme que a distribuição escolhida mostra `VERSION 2`. Reinicie se o Windows
   pedir. O WSL2 exige que a virtualização por hardware esteja habilitada; em um
   laptop gerenciado, o time de TI pode precisar habilitar os recursos do Windows ou
   a configuração de firmware.

2. Instale e inicie um container engine compatível. Para o Docker Desktop, habilite
   o backend WSL2 e depois habilite **Settings > Resources > WSL integration**
   para a distribuição escolhida.

3. Abra a distribuição Linux e verifique a integração a partir do shell dela:

   ```bash
   docker info
   ```

   Isso precisa funcionar sem `sudo`. Se não funcionar, inicie o Docker Desktop,
   habilite a integração da distribuição, depois execute `wsl --shutdown` no
   PowerShell e reabra a distribuição.

4. Clone o repositório dentro do filesystem Linux, não sob `/mnt/c`:

   ```bash
   mkdir -p ~/src
   cd ~/src
   git config --global core.autocrlf input
   git clone <this-repo-url> kubernetes-workshop
   cd kubernetes-workshop
   ./workshop up
   ```

   Um checkout sob `/mnt/c` pode ser substancialmente mais lento e pode embaralhar a
   semântica do bit de execução do Linux. O bootstrap avisa quando detecta esse layout.

Não instale o build Windows do mise com `winget` para este caminho. As ferramentas
precisam rodar dentro da distribuição Linux do WSL2; `./workshop up` instala o build
Linux do mise de forma interativa quando necessário.

## Preparação de recursos e de rede

Aloque pelo menos 4 CPUs e 8 GiB de RAM para o ambiente combinado
WSL2/container engine. O bootstrap avisa abaixo desses valores. Feche clusters e
containers locais não utilizados antes do workshop.

Proxies corporativos e clientes de VPN podem afetar o DNS do WSL, os pulls de image e
o acesso à API do Kubernetes:

- Configure o proxy aprovado tanto no container engine quanto no shell do WSL2.
  Preserve a verificação de TLS e use o CA bundle da empresa; não contorne as
  checagens de certificado.
- Conecte a VPN antes de abrir o WSL2. Se a conectividade mudar depois de uma
  reconexão de VPN, execute `wsl --shutdown` no PowerShell e reabra a distribuição.
- Verifique `docker pull`, resolução de DNS e o cluster alvo antes da aula.
  Um facilitador pode fazer o pre-pull das images pinadas do workshop quando a rede
  da conferência estiver limitada.
- Não substitua o `/etc/resolv.conf` nem adicione exceções de proxy não aprovadas, a
  menos que isso faça parte da configuração de WSL suportada pela organização.

## Rota para dispositivos gerenciados

Participantes que não podem ou não querem instalar um container engine devem receber
um kubeconfig e um namespace atribuído em um cluster na nuvem gerenciado pelo
facilitador. Eles podem pular o setup local do kind e seguir o caminho de namespace em
[`../labs/day-1/00-setup.md`](../labs/day-1/00-setup.md).

Essa rota ainda exige, hoje, um terminal com `kubectl`. Um shell literalmente sem
instalação, apenas no navegador, é trabalho futuro rastreado por **US-ENV-6**; não o
prometa como parte do workshop atual.

Exercícios cluster-wide precisam oferecer um caminho de observação seguro por
namespace. O facilitador, e não o participante, é o dono da instalação de add-ons
compartilhados e das permissões cluster-scoped.

## Troubleshooting

| Sintoma | Ação |
| --- | --- |
| `native Windows ... is not supported` | Abra a distribuição WSL2 e execute o comando a partir do shell Linux dela. |
| `WSL1 is not supported` | Faça backup da distribuição, execute `wsl --set-version <DistributionName> 2` no PowerShell e confirme `VERSION 2` com `wsl --list --verbose`. |
| `Docker Desktop WSL integration may be disabled` | Habilite a integração para esta distribuição, reinicie o Docker Desktop, execute `wsl --shutdown`, reabra o WSL2 e verifique `docker info`. |
| O path do repositório começa com `/mnt/c/` | Clone novamente sob `~/src`; não mova `node_modules` nem um diretório de dados do kind entre filesystems. |
| `bad interpreter` ou `$'\r': command not found` | Defina `git config --global core.autocrlf input`, clone novamente dentro do WSL2 e verifique se os scripts usam quebras de linha LF. |
| `Permission denied` para `./workshop` | Execute `chmod +x workshop infra/bootstrap.sh infra/doctor.sh` e depois confira se o checkout está no filesystem Linux. |
| Pulls ou chamadas de API falham somente na VPN | Reconecte a VPN, `wsl --shutdown`, reabra o WSL2 e verifique a configuração de DNS/proxy/CA antes de tentar de novo. |

## Reproducible validation checklist

Execute esta checklist em um host que atenda à tupla provisória. Cada item é um
release gate: não chame a rota Windows de oficialmente suportada até que todos os
itens passem e a tupla exata esteja registrada.

1. Registre a versão do Windows, `wsl --version`, `wsl --list --verbose`,
   distribuição/versão Linux, arquitetura, versão do engine e CPU/RAM disponíveis.
2. Em uma distribuição WSL2 limpa com a integração do Docker habilitada, clone sob
   `~/src`, conclua o Lab 00, execute `./workshop up` e depois `./workshop doctor`;
   espere zero falhas.
3. Desabilite a integração WSL para a distribuição e execute `./workshop up`; espere
   uma saída diferente de zero e as instruções de recuperação da integração.
4. Reabilite a integração. Clone uma cópia descartável sob `/mnt/c` e execute
   `./workshop up`; espere o aviso de drive montado antes da criação do cluster.
5. Em cópias descartáveis, introduza CRLF no `workshop` e remova o bit de execução
   dele. Execute `bash infra/doctor.sh`; espere comandos de reparo específicos e um
   resultado diferente de zero.
6. Exercite comportamentos representativos do cluster: networking de Service/DNS,
   provisionamento dinâmico de PVC e persistência, e um lab canônico de add-on de
   cluster. Registre comandos, tempos, falhas e cleanup; um bootstrap verde sozinho
   é insuficiente.
7. Execute o caminho de namespace usando um kubeconfig fornecido pelo facilitador,
   sem Docker nem kind. Confirme que os labs namespace-scoped funcionam e que os
   passos cluster-wide direcionam o participante para a alternativa read-only.
8. Execute `./workshop down --yes` para o caminho local e confirme que o cluster kind
   do workshop foi removido.

Até que esta checklist seja registrada como aprovada, o estado é `contract-tested` /
`live-smoke pending`, a story continua parcial e as release notes não podem alegar
suporte oficial ao Windows. Testes automatizados reproduzem a detecção e as mensagens
com stubs, mas não substituem a validação ao vivo no WSL2.
