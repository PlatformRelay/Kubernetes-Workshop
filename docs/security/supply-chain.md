# Política de supply-chain

O repositório falha no CI quando o grafo de dependências JavaScript travado no lockfile contém um
advisory **high** ou **critical** sem exceção registrada, quando um workflow usa uma referência mutável
de action, ou quando código de setup executável mantido introduz um caminho de download ou execução
remota sem governança.

Execute os mesmos gates localmente:

```sh
pnpm install --frozen-lockfile
node --test scripts/supply-chain-policy.test.mjs scripts/dependency-audit.test.mjs
node scripts/supply-chain-policy.mjs
node scripts/dependency-audit.mjs
```

## Política de auditoria de dependências

O `scripts/dependency-audit.mjs` roda `pnpm audit` contra o grafo de dependências de
`pnpm-lock.yaml`. Advisories high e critical falham. Severidades menores continuam
visíveis na contagem e são revisadas durante as atualizações rotineiras de dependências.

## Ferramental de atualização de dependências

Os **security alerts** e **security updates** do Dependabot permanecem habilitados nas
Settings do GitHub. O **Renovate** (`renovate.json`) é dono dos bumps de versão agendados de npm e
GitHub Actions. Os **version updates do Dependabot** (`.github/dependabot.yml`) cobrem
apenas o módulo Go aninhado em `infra/images/workshop-web`, onde o Renovate não
gerencia `gomod`. Essa divisão evita PRs duplicados e mantém os dois
ecossistemas em uma cadência semanal às segundas-feiras.

Antes do scan no registry ao vivo, o mesmo comando confere cada versão travada
contra as faixas de advisory do GitHub registradas em
`supply-chain/dependency-advisories.json`. Essa evidência versionada no repositório mantém os
pisos de versões corrigidas conhecidos aplicáveis sem acesso à rede; atualizá-la exige um
refresh revisado a partir da GitHub Global Security Advisory API. Evidência malformada ou
vazia falha fechado.

As faixas vulneráveis registradas usam uma gramática deliberadamente pequena: um ou mais
comparadores `>`, `>=`, `<`, `<=` ou `=` separados por vírgula com versões `x.y.z`
exatas. Todo segmento é obrigatório; expressões OR, wildcards, prereleases
e segmentos vazios são rejeitados. Para uma faixa com limite superior, a primeira versão
corrigida registrada deve estar acima de um limite inclusivo ou igual/acima de um limite
exclusivo antes que qualquer entrada do lock seja avaliada.

Um risco aceito precisa ser adicionado a `supply-chain/dependency-audit.json` com todos
estes campos:

```json
{
  "id": "GHSA-xxxx-yyyy-zzzz",
  "reason": "Why the vulnerable path is not reachable or cannot yet be upgraded.",
  "owner": "maintainers",
  "expires": "2026-08-31"
}
```

Exceções expiradas ou malformadas falham o gate. Um comando de auditoria que não consegue
retornar uma saída de scanner parseável sai separadamente como **scanner unavailable**; isso
nunca é reportado como resultado limpo. Status inesperado do scanner e metadados high/critical
que discordem dos registros de advisory falham do mesmo jeito. O CI falha fechado. Para uma
release urgente, a única dispensa possível é uma exceção de advisory revisada e commitada, com
owner e expiração de curto prazo — nunca uma variável de ambiente que silenciosamente pule
o scanner.

## Política de GitHub Actions

Toda action externa em `.github/workflows/` usa um commit SHA de 40 caracteres e
um comentário de versão próximo, por exemplo:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
```

Container actions, se forem introduzidas, precisam usar um digest de image. Actions locais em
`./` são permitidas. O manager de GitHub Actions do Renovate está com `pinDigests: true`, então as
atualizações continuam sendo propostas revisáveis e preservam referências imutáveis.

Todo workflow declara permissions somente leitura no nível do workflow. Jobs que
publicam uma image, um deployment de Pages ou um artefato de release optam apenas pelas permissions
de escrita ou de OIDC de que precisam. A montagem e a validação da release rodam em um
job separado somente leitura; apenas o job final de publicação recebe `contents:
write`.

## Downloads remotos

A política cobre hoje duas fronteiras de confiança executáveis:

- toda URL de artefato gerada em `mise.lock` precisa ter um checksum `sha256` na
  mesma entrada de plataforma;
- código mantido de setup/automação em shell, Python e Node sob `infra/`, `setup/`,
  `scripts/`, `.github/`, mais as superfícies de launch/task da raiz, não pode baixar uma
  entrada remota — nem canalizá-la para um shell — sem uma entrada nomeada, documentada e não
  expirada em `supply-chain/exceptions.json`;
- chamadas `curl`/`wget` diretas, via alias ou montadas por tokens simples, clientes HTTP e
  chamadas de subprocesso em Python, e `fetch` do Node são tratados como callsites com capacidade
  de rede. Um novo callsite falha até que seu comando exato seja revisado.

Cada exceção vincula um `source` HTTPS exato a um de dois tipos auditáveis:

- `accepted-risk` exige um `command` literal exato, com espaços normalizados
  e sem source dinâmico. Ela declara claramente que os bytes não estão
  fixados por checksum e apresenta o motivo e a expiração dessa aceitação temporária de
  risco;
- `sha256` permite apenas um fluxo deliberadamente estreito: `curl -fsSL <source> -o
  <output>`, depois `printf ... | sha256sum -c -`, depois `bash <output>`. O source, o
  nome de arquivo simples de saída, o digest exato, o arquivo verificado e o arquivo executado precisam
  todos bater com o inventário. Comentários não satisfazem uma etapa de verificação.

Este é um inventário de drift que falha fechado para código mantido comum. Ele captura
entradas mutáveis acidentais e as formas comuns de indireção cobertas pelos seus testes de
mutação. Ele **não** é uma prova contra código malicioso intencionalmente
ofuscado; revisão, branch protection e a política imutável de workflow/action continuam
sendo os controles para mudanças hostis.

O instalador de conveniência interativo do mise é a única exceção atual. Ele é
isolado do setup não interativo/de CI, mas os bytes do instalador em si
**não estão fixados por checksum**. Esse risco aceito expira em **2026-11-03**, para que o
caminho de bootstrap precise ser revisado de novo.

Os labs voltados ao aluno hoje contêm comandos `kubectl apply -f URL` diretos e
versionados. Eles não são intencionalmente apresentados como verificados por checksum por
este gate: converter esses comandos em entradas de add-on cacheadas e com checksum é
responsabilidade do trabalho de execução de add-ons/labs. Até isso acontecer, essas URLs continuam sendo um
residual conhecido, e não uma falsa alegação de "tudo verde".

## Evidências existentes e residuais

O workflow de image do `workshop-web` já escaneia images em HIGH/CRITICAL, assina
digests de image e atesta um SBOM SPDX. Esta mudança fixa as actions desse workflow,
mas não afirma que uma nova execução de image tenha ocorrido.

O CodeQL é de responsabilidade de US-CI-CODEQL, via um `.github/workflows/codeql.yml` explícito
(o PUT da API de default-setup retornou 404). O workflow cobre Actions, Go
(`infra/images/workshop-web`) e JS/TS; `security-events: write` no job
`analyze` está na allowlist de `scripts/supply-chain-policy.mjs`. A triagem do primeiro scan
não pode ser comprovada por uma mudança local, então este gate não fabrica essa
evidência. A retenção de SBOM de dependências para os artefatos de release publicados do deck
permanece, igualmente, no escopo do workflow de release.
