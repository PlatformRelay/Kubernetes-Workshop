---
layout: section-cover
image: /covers/section-10-scroll-library-vault.webp
day: Day 2
section: '10'
tier: core
track: Core
---

# ConfigMap & Secret

Separe a configuração da image — injete-a como env ou arquivos, saiba o que um Secret
protege e o que não protege, e aprenda por que mudar a config não reinicia seus Pods.

**core** · sugerido para o Day 2 · trilha Core

<!--
Seção S10 — ConfigMap & Secret. Tempo: ~30 min de slides + 25 min de lab. Primeira
seção de camadas de config do Day 2 (a red line terminou no S09). Resultado: os
participantes conseguem externalizar config em um ConfigMap/Secret, consumi-los de três
formas (env via envFrom, arquivos montados, Secret como env), explicar que base64 é
encoding e não criptografia (encryption-at-rest do etcd + RBAC são os controles reais),
comparar os três padrões de entrega segura (Sealed Secrets / External Secrets Operator /
Vault) por onde a verdade vive e o que é seguro commitar, e — o ponto afiado — saber que
atualizar um ConfigMap/Secret NÃO reinicia Pods: env é congelado no start, arquivos
montados por diretório inteiro atualizam eventualmente (~60–90s), mounts com subPath
nunca atualizam. O truque da annotation de checksum força um rollout de propósito.
Beats: problema (config embutida → rebuild por ambiente) · modelo mental (dois objetos,
dois modos de consumo, ressalva do subPath) · magic-move (estender o Deployment web:
+envFrom → +arquivo montado → +Secret como env) · segurança (base64 ≠ criptografia; tipos
de Secret) · entrega segura (o problema do Git · Sealed Secrets vs ESO vs Vault) ·
imutabilidade (tradeoff do immutable: true) · pegadinha da rotação (o que atualiza, o que
não; truque do checksum) · recap → lab.
ACCURACY LOCKS de entrega (verificados contra external-secrets.io, a documentação do
HashiCorp Vault para Kubernetes e bitnami-labs/sealed-secrets, 2026-08):
- Sealed Secrets: o kubeseal criptografa com a chave PÚBLICA do controller in-cluster
  em um CRD SealedSecret (seguro para commitar — assimétrico; só o controller
  descriptografa, escopo estrito de name+namespace por padrão) que o controller
  desela em um Secret normal.
- External Secrets Operator: ExternalSecret + SecretStore/ClusterSecretStore
  (grupo de API external-secrets.io) sincronizam valores DE um gerenciador externo
  (AWS/GCP/Azure/Vault/…) PARA Secrets nativos no spec.refreshInterval. CNCF SANDBOX —
  não afirmar maturidade maior; a pausa de mantenedores de 2025 foi resolvida, releases
  mensais de novo (beat de honestidade nas speaker notes).
- Vault: três caminhos de entrega — sidecar Agent Injector (arquivos no Pod, sem
  Secret K8s, fica fora do etcd), provider CSI (arquivos via volume), Vault
  Secrets Operator (escreve Secrets K8s reais). Os Pods se autenticam via seu
  token de ServiceAccount. O Vault é licenciado sob BSL desde 2023; o OpenBao é o
  fork open-source da Linux Foundation (nuance só nas notas).
Só conceitos: nenhum pin de ferramenta de entrega, nenhum passo de lab — a comparação é a
entrega. Sem animação compartilhada (pelo outline o S10 não tem nenhuma; a história da
rotação é uma sequência de console ao vivo, não uma máquina de estados). CKx: CKAD
application-configuration.
-->

---
layout: statement
kicker: O problema
---

Embuta a config na image e você a reconstrói para **cada** ambiente.

Uma connection string, uma feature flag, um log level, um API token — deixe-os
hard-coded e dev, staging e prod passam a precisar cada um da sua própria image. O
**mesmo artefato** deveria rodar em toda parte; só a **config** muda ao redor dele. Então
a config precisa viver **fora** da image — como dados que o cluster injeta em runtime.

<!--
Speaker: esta é a ideia twelve-factor de "config no ambiente", tornada concreta para
Kubernetes. A image é a coisa que você construiu e escaneou no S01/S02 — ela deve ser
imutável e idêntica entre ambientes. O que difere por ambiente é a configuração, e o
Kubernetes te dá dois objetos para guardá-la: ConfigMap (não sensível) e Secret
(sensível). O Lab 10 vem depois desta seção.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · dois objetos, duas portas de entrada</span>

# ConfigMap e Secret — chave/valor, injetados de duas formas

<div class="kw-cols-2 mt-2 text-sm">
  <v-click at="1">
    <KwCard heading="ConfigMap" kind="cm">
      Chave/valor não sensível: flags, URLs, tuning.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Secret" kind="secret" variant="warn">
      Valores sensíveis — <strong>base64</strong>, não criptografia (próximo slide).
    </KwCard>
  </v-click>
</div>

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="3">
    <KwCard heading="Como variáveis de ambiente" icon="🌱">
      <code>envFrom</code> / <code>valueFrom</code> — simples, mas <strong>congelado no start</strong>.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Como arquivos montados" icon="📄">
      O mount de diretório inteiro <strong>atualiza no lugar</strong>; <code>subPath</code> nunca atualiza.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 kw-muted text-sm">

Os mesmos objetos, dois modos de consumo. A ressalva do <code>subPath</code> é o que o lab de rotação prova.

</div>

</div>

<!--
Speaker: construa os quatro cards. Crave duas coisas: (1) um Secret não é criptografado, é
só base64 + alguns guard rails (RBAC, sem logging acidental) — o próximo slide é o ponto
central. (2) O modo de consumo decide o comportamento de atualização, e subPath é a
armadilha: subPath copia o arquivo na hora do mount, então se comporta como uma env var
(congelado), enquanto um mount de diretório acompanha o objeto. Essa distinção exata é o
passo de rotação do lab e sua pergunta-manchete.
-->

---
layout: code-walkthrough
heading: 'Estenda a aplicação — consuma config como env, arquivos e um Secret'
lab: labs/day-2/10-config.md
---

````md magic-move
```yaml
# nossa aplicação do Day 1 — nada consome config ainda
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1                       # uma réplica → um Pod responde toda requisição
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
```

```yaml
# +1: um ConfigMap injetado como variáveis de ambiente
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          envFrom:
            - configMapRef: { name: web-config }   # cada chave → uma env var
```

```yaml
# +2: o MESMO ConfigMap também montado como arquivos (diretório inteiro → atualizável)
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          envFrom:
            - configMapRef: { name: web-config }
          volumeMounts:
            - { name: config, mountPath: /etc/web-config }   # mount de diretório, sem subPath
        - name: toolbox   # a image da aplicação não tem shell — um sidecar para ler os arquivos
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - { name: config, mountPath: /etc/web-config }
      volumes:
        - { name: config, configMap: { name: web-config } }
```

```yaml
# +3: um Secret injetado como uma env var — mesma aplicação, valor sensível separado
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          envFrom:
            - configMapRef: { name: web-config }
          env:
            - name: API_TOKEN
              valueFrom: { secretKeyRef: { name: web-secret, key: API_TOKEN } }
          volumeMounts:
            - { name: config, mountPath: /etc/web-config }
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - { name: config, mountPath: /etc/web-config }
      volumes:
        - { name: config, configMap: { name: web-config } }
```
````

<!--
Speaker: QUATRO frames, todos o MESMO Deployment crescendo. (1) a aplicação do Day 1, sem
config. (2) envFrom puxa cada chave do ConfigMap como uma env var — uma linha; a chave
VERSION do ConfigMap sobrescreve a versão embutida da aplicação, então o próprio corpo da
resposta prova a injeção. (3) o mesmo ConfigMap TAMBÉM montado como um diretório de
arquivos — destaque o mountPath SEM subPath, essa é a forma atualizável (importa dois
slides adiante); o sidecar toolbox existe porque a image da aplicação é distroless (sem
shell) — um segundo container é a forma honesta de olhar arquivos montados. (4) a chave de
um Secret injetada como uma env var via secretKeyRef — o valor sensível vive no seu
próprio objeto, consumido do mesmo jeito. O lab aplica essas mesmas peças e prova cada uma
no corpo da resposta ou via toolbox. Note que replicas:1 é deliberado: um Pod só significa
que a linha `pod:` do corpo nunca surpreende.
-->

---
layout: code-annotated
heading: 'Um Secret é base64, não um cofre'
lab: labs/day-2/10-config.md
---

```yaml {none|1-6|4-6|all}
apiVersion: v1
kind: Secret
metadata: { name: web-secret }
type: Opaque                 # também: kubernetes.io/tls, .../dockerconfigjson
data:
  API_TOKEN: czNjcjN0        # "s3cr3t" — base64, trivialmente reversível
```

::notes::

<CodeNote at="1" label="Secret ≈ ConfigMap">
O mesmo formato chave/valor de um ConfigMap. As diferenças são de tratamento, não de
criptografia: ele fica fora da maioria dos logs e é protegido por RBAC — só isso.
</CodeNote>

<CodeNote at="2" label="base64 ≠ criptografia" variant="warn">
<code>echo czNjcjN0 | base64 -d</code> devolve o valor. Qualquer um que puder dar
<code>get</code> no Secret pode lê-lo. Os controles reais são <strong>RBAC</strong>
(quem pode lê-lo) e <strong>encryption-at-rest do etcd</strong> (quem pode ler o disco).
</CodeNote>

<CodeNote at="3" label="tipado com um propósito" variant="ok">
<code>type</code> diz aos consumidores o que há dentro: <code>Opaque</code> (arbitrário),
<code>kubernetes.io/tls</code> (cert/chave para um listener), <code>.../dockerconfigjson</code>
(um pull secret de registry — lembre-se de <code>imagePullSecrets</code> do Pod).
</CodeNote>

<!--
Speaker: o objeto mais mal compreendido do Kubernetes. Percorra: é base64, decodifique ao
vivo de cabeça — czNjcjN0 → s3cr3t. Então um Secret só protege você tanto quanto seu RBAC
e sua config do etcd protegem. Habilite encryption-at-rest e restrinja `get secrets`; é aí
que a segurança mora de verdade. Depois os tipos: Opaque é o default; tls e
dockerconfigjson são consumidos por maquinário específico. O lab decodifica um Secret real
com `-o jsonpath | base64 -d` para que o ponto "não é criptografado" seja sentido, não só
contado.
-->

---
layout: statement
kicker: 'A próxima pergunta · seus manifestos vivem no Git'
---

Todo o restante deste deck pode ser **commitado**. Um Secret não.

O Deployment, o Service, o ConfigMap — tudo isso pertence ao Git, revisado e
versionado. Mas o `data:` de um Secret é só base64: commitá-lo **é** publicá-lo.
Então toda plataforma de verdade responde a uma pergunta deliberadamente: **onde vive a
verdade sobre um secret, e como ela chega ao cluster?** Três padrões dominam.

<!--
Speaker: esta é a ponte de "um Secret é fraco" para "então como os times realmente fazem
isso". Enquadre com Git porque a seção de GitOps do Day 3 faz de tudo-no-Git o modelo de
entrega — secrets são a única coisa que não pode viajar junto em forma plana. Nomeie o
anti-padrão em voz alta: um manifesto de Secret em um repositório privado ainda é uma
credencial vazada para todo mundo com acesso ao repo, para sempre, no histórico. Os três
padrões do próximo slide diferem em exatamente um ponto profundo: onde a fonte da verdade
vive (criptografada no Git / em um gerenciador externo / no Vault) — todo o resto é
mecânica. Mantenha este slide curto; a comparação carrega o conteúdo.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Entrega segura · três padrões, uma pergunta — onde vive a verdade?</span>

# Sealed Secrets · External Secrets Operator · Vault

<div class="kw-cols-3 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Sealed Secrets — criptografe para o Git" icon="📮" variant="ok">
      O <code>kubeseal</code> criptografa seu Secret com a <strong>chave pública</strong>
      do controller em um <strong>SealedSecret</strong> — seguro para
      commitar. Só o controller in-cluster consegue descriptografá-lo, em um Secret normal.
      <div class="kw-muted mt-1">A verdade vive <strong>no Git</strong>, criptografada.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="External Secrets Operator — sincronize para dentro" icon="🔄" variant="ok">
      Um <strong>ExternalSecret</strong> nomeia chaves em um
      <strong>SecretStore</strong> (AWS/GCP/Azure/Vault…); o operator as puxa
      para um Secret nativo e <strong>ressincroniza</strong> em um intervalo.
      <div class="kw-muted mt-1">A verdade vive no <strong>gerenciador externo</strong>;
      o Git guarda só referências.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Vault — entregue ao Pod" icon="🏦" variant="ok">
      Um serviço central de secrets. Um sidecar ou volume CSI monta secrets como
      <strong>arquivos no Pod</strong> — muitas vezes <em>nunca</em> criando um
      Secret K8s (nada cai no etcd); seu operator também pode sincronizar Secrets reais.
      <div class="kw-muted mt-1">A verdade vive <strong>no Vault</strong>; os Pods
      se autenticam com seu ServiceAccount.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

Os três terminam no (ou deliberadamente contornam o) **mesmo objeto que você acabou de
aprender** — a aplicação continua consumindo env vars ou arquivos. O que você está
escolhendo é **onde a verdade vive** e **o que é seguro commitar**.

</div>

</div>

<!--
Speaker: três cards, um eixo — a fonte da verdade. (1) Sealed Secrets (bitnami-labs)
é o mais leve: criptografia assimétrica, o kubeseal criptografa com a chave pública do
controller do cluster, o CRD SealedSecret é seguro até em um repo público, e o controller
o desela em um Secret comum. Por padrão o selamento é escopado estritamente àquele
name + namespace, então um blob selado não pode ser reaproveitado em outro lugar.
Encaixa em GitOps puro sem infraestrutura extra — mas rotação ainda significa
re-selar e commitar. (2) External Secrets Operator: o secret é mantido em um
gerenciador de secrets de cloud ou no Vault; os CRDs ExternalSecret + SecretStore/
ClusterSecretStore (external-secrets.io) declaram QUAIS chaves, e o operator
materializa e atualiza Secrets nativos (spec.refreshInterval) — rotação no upstream
flui automaticamente. Notas de honestidade: é um projeto CNCF Sandbox, e em 2025
pausou brevemente os releases por falta de mantenedores antes de novos mantenedores
retomarem releases mensais — "confira a saúde do que você adota" é uma lição justa de
dizer em voz alta. (3) Vault: os secrets ficam no Vault; o sidecar Agent Injector ou o
provider CSI os entregam como arquivos direto no filesystem do Pod — sem objeto Secret,
nada no etcd — enquanto o Vault Secrets Operator alternativamente sincroniza Secrets
reais para aplicações que precisam de env vars. Os Pods se autenticam via token de
ServiceAccount (método de auth Kubernetes). Nuance de licenciamento para os curiosos:
o Vault migrou para BSL em 2023; o OpenBao é o fork da Linux Foundation que continua
sob licença open-source. Feche na linha em cinza: a história de CONSUMO desta seção
não muda em nenhum dos três — por isso ensinamos o Secret puro primeiro.
-->

---

<span class="kw-kicker">Válvula de segurança · trave um valor</span>

# Config imutável — mais rápida e mais segura, porém congelada

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="immutable: true" icon="🔒">
    Defina-o em um ConfigMap ou Secret e o valor <strong>nunca</strong> mais muda.
    Para lançar um valor novo você cria um <strong>objeto novo</strong> e reaponta o
    Deployment.
  </KwCard>
  <KwCard heading="Por que se dar ao trabalho" icon="⚡">
    O kubelet para de observar objetos imutáveis por mudanças — <strong>menos carga na API</strong>
    em escala — e uma edição acidental não consegue reconfigurar Pods vivos silenciosamente.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

O tradeoff está no nome: sem edições no lugar. Ele combina naturalmente com tratar cada
versão de config como um **objeto novo, nomeado** — que é exatamente como você lança
mudanças com segurança (próximo slide).

</div>

<!--
Speaker: beat rápido, não se demore. immutable: true é uma alavanca de performance +
segurança: o kubelet derruba o watch (economia real quando milhares de Pods montam o
mesmo objeto) e edições de dedo gordo se tornam impossíveis. Custo: você não pode
editá-lo — valor novo significa objeto novo. Isso emenda direto na pegadinha da rotação:
mesmo para objetos MUTÁVEIS, mudá-los não reinicia Pods, então você acaba gerenciando
config por versão de qualquer jeito.
-->

---
layout: code-annotated
heading: 'Mudar a config não reinicia seus Pods'
compact: true
lab: labs/day-2/10-config.md
---

```console {none|1-3|5-6|8-10}
# 1) edite o ConfigMap
$ kubectl edit configmap web-config    # VERSION: config-v1 → config-v2
$ wget -qO- http://$POD_IP:8080 | head -1
workshop-web config-v1                  # env congelado no start do Pod

# 2) o arquivo montado atualiza (~60–90s)
$ kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
config-v2

# 3) force o rollout — annotation de checksum
$ kubectl patch deploy web -p '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"<sha>"}}}}}'
```

::notes::

<CodeNote at="1" label="env é congelado" variant="warn">
Variáveis de ambiente são lidas <strong>uma vez</strong>, quando o container inicia.
Editar o ConfigMap muda o objeto, não o processo em execução — o valor antigo persiste até
o Pod ser recriado.
</CodeNote>

<CodeNote at="2" label="arquivos atualizam, eventualmente">
Um mount de volume de diretório inteiro acompanha o objeto: o kubelet o atualiza em cerca
de um minuto. (Um mount com <code>subPath</code> <strong>não</strong> atualizaria — ele é
copiado uma única vez.)
</CodeNote>

<CodeNote at="3" label="o truque do checksum" variant="ok">
Nada reinicia Pods automaticamente numa mudança de config. Os times colocam um hash da
config em uma <strong>annotation do pod template</strong>: mudou a config → mudou o hash →
o template mudou → um rolling update normal entrega o valor novo.
</CodeNote>

<!--
Speaker: este é o beat que queima as pessoas em produção. Três desfechos de UMA edição:
(1) env var inalterada — congelada no start; o corpo da resposta da aplicação ainda diz a
versão ANTIGA, o que torna "congelado" visível sem um shell; (2) o arquivo montado por
diretório atualiza após ~60–90s — lido via sidecar toolbox; tranquilize-os de que o atraso
é normal, não está quebrado; (3) se você precisa que o env mude agora, precisa rolar os
Pods, e o idioma é uma annotation checksum/config no pod template (Helm/Kustomize
automatizam isso) — depois do rollout o corpo diz config-v2. Amarre de volta: objetos
imutáveis te empurram para nome-por-versão de qualquer forma. O lab percorre os três
desfechos e pede ao participante que explique por que o env não mudou mas o arquivo sim.
-->

---
layout: recap
heading: 'Recap — a config vive fora da image'
story: 'Ops editou o ConfigMap e se perguntou por que a aplicação ainda dizia "hi" — o env estava congelado; o arquivo montado alcançou um minuto depois.'
next: 'Storage — dê à aplicação um volume que sobrevive a um restart (o Day 2 continua)'
---

- **ConfigMap** (não secreto) e **Secret** (sensível) guardam config chave/valor para que
  uma image rode em todos os ambientes
- Consuma qualquer um como **env vars** (`envFrom` / `valueFrom`) ou como **arquivos
  montados** — a mesma aplicação, duas portas de entrada
- Um **Secret é base64, não criptografia**: a proteção real é **RBAC** + **encryption-at-rest
  do etcd**; `type` (`Opaque` / `tls` / `dockerconfigjson`) diz aos consumidores o que há dentro
- **`immutable: true`** troca edições no lugar por menos carga na API e nenhuma mudança
  acidental — lance um valor novo como um objeto novo
- **Atualizações não reiniciam Pods:** env é **congelado no start**, arquivos de diretório
  inteiro atualizam em ~60–90s, `subPath` nunca atualiza — force um rollout com uma
  **annotation de checksum**
- A seguir: a aplicação está configurável — agora torne seus **dados duráveis** com um volume

<!--
Speaker: deixe com eles a matriz de atualização — é o takeaway prático que vão buscar em
um incidente: "mudei o ConfigMap e nada aconteceu" é env congelado, não um bug. Depois
pivote para o arco de storage do Day 2: a config está externalizada, mas os DADOS da
aplicação ainda são efêmeros — um restart os perde. Isso é o S11. Passe o bastão para o
Lab 10: injetar config como env e arquivos, decodificar um Secret, e rotacionar um valor
para observar exatamente o que muda e o que não muda.
-->

---
layout: lab
lab: labs/day-2/10-config.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 10 — Config para dentro, secrets rotacionados

- Crie um **ConfigMap**; consuma-o como **env** (`envFrom`) — o `VERSION` injetado
  aparece no próprio corpo da resposta da aplicação
- Monte o **mesmo** ConfigMap como **arquivos**; dê `cat` em uma chave montada a partir do sidecar toolbox
- Crie um **Secret**, consuma-o como env e decodifique-o — veja o base64, sinta o "não é criptografado"
- **Rotacione:** edite o ConfigMap → o env fica **inalterado**, o arquivo montado atualiza, então uma
  **annotation de checksum** força um rollout
- Responda a manchete: *por que a env var não mudou mas o arquivo montado sim?*
